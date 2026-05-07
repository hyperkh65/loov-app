/**
 * Centralized AI call function with multi-provider support and fallback chain.
 * Supports: Claude, Gemini, OpenAI (gpt4o/gpt4/gpt35), OpenRouter, Ollama
 */
import { getSetting } from '@/lib/get-setting';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AICallOptions {
  messages: AIMessage[];      // full conversation including system
  provider?: string;          // primary provider
  model?: string;             // primary model
  apiKey?: string;            // override API key
  maxTokens?: number;
  temperature?: number;
  useFallback?: boolean;      // try fallback chain on failure (default: true)
}

export interface AICallResult {
  text: string;
  provider: string;
  model: string;
  usedFallback: boolean;
}

interface FallbackEntry {
  provider: string;
  model: string;
}

const DEFAULT_FALLBACK_CHAIN: FallbackEntry[] = [
  { provider: 'openrouter', model: 'qwen/qwen3-235b-a22b:free' },
];

// ── Resolve API key for a provider ──────────────────────────────────────────

async function resolveApiKey(provider: string, override?: string): Promise<string> {
  if (override) return override;
  switch (provider) {
    case 'claude':
      return getSetting('CLAUDE_API_KEY');
    case 'gemini':
      return getSetting('GEMINI_API_KEY');
    case 'openrouter':
      return getSetting('OPENROUTER_API_KEY');
    case 'ollama': {
      const keys = await getOllamaCloudKeys();
      return keys[0] || 'ollama'; // first cloud key or local dummy
    }
    case 'gpt4o':
    case 'gpt4':
    case 'gpt35':
      return getSetting('OPENAI_API_KEY');
    default:
      return 'ollama';
  }
}

// Returns all Ollama Cloud API keys (multi-key pool + legacy single key)
async function getOllamaCloudKeys(): Promise<string[]> {
  const keys: string[] = [];
  try {
    const raw = await getSetting('OLLAMA_API_KEYS');
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) keys.push(...arr.filter(Boolean));
    }
  } catch { /* ignore */ }
  const legacy = await getSetting('OLLAMA_API_KEY');
  if (legacy && !keys.includes(legacy)) keys.push(legacy);
  return keys;
}

// ── Claude 모델 캐시 (1시간, /v1/models 동적 조회) ───────────────────────────
let _claudeCache: { models: string[]; ts: number } | null = null;

async function getLatestClaudeModel(tier: 'sonnet' | 'haiku' | 'opus', apiKey: string): Promise<string> {
  const FALLBACK: Record<string, string> = {
    sonnet: 'claude-sonnet-4-6',
    haiku:  'claude-haiku-4-5-20251001',
    opus:   'claude-opus-4-6',
  };
  try {
    const now = Date.now();
    if (!_claudeCache || now - _claudeCache.ts > 3_600_000) {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json() as { data: Array<{ id: string; created_at: string }> };
        const models = (data.data || [])
          .filter((m) => m.id.startsWith('claude-'))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .map((m) => m.id);
        if (models.length) _claudeCache = { models, ts: now };
      }
    }
    const models = _claudeCache?.models || [];
    return models.find((m) => m.includes(tier)) || FALLBACK[tier];
  } catch {
    return FALLBACK[tier];
  }
}

// ── Default model per provider ───────────────────────────────────────────────

function defaultModel(provider: string): string {
  switch (provider) {
    case 'claude':      return 'claude-sonnet-4-6';  // 런타임에 getLatestClaudeModel()로 덮어씀
    case 'gemini':      return 'gemini-2.0-flash';
    case 'gpt4o':       return 'gpt-4o';
    case 'gpt4':        return 'gpt-4-turbo';
    case 'gpt35':       return 'gpt-3.5-turbo';
    case 'openrouter':  return 'qwen/qwen3-235b-a22b:free';
    case 'ollama':      return 'qwen3.5';
    default:            return 'qwen3.5';
  }
}

// ── Provider call implementations ────────────────────────────────────────────

async function callClaude(
  messages: AIMessage[],
  model: string,
  apiKey: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
  const chatMsgs = messages.filter((m) => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemMsg,
      messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
      temperature,
    }),
  });

  const data = await res.json() as {
    content?: Array<{ text?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || `Anthropic API error ${res.status}`);
  return data.content?.[0]?.text?.trim() || '';
}

async function callGemini(
  messages: AIMessage[],
  model: string,
  apiKey: string,
): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);

  const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
  const chatMsgs = messages.filter((m) => m.role !== 'system');

  const geminiModel = genAI.getGenerativeModel({
    model,
    ...(systemMsg ? { systemInstruction: systemMsg } : {}),
  });

  // Build history (all but the last user message)
  const history = chatMsgs.slice(0, -1).map((m) => ({
    role: m.role === 'user' ? 'user' as const : 'model' as const,
    parts: [{ text: m.content }],
  }));

  const lastMsg = chatMsgs[chatMsgs.length - 1];
  if (!lastMsg) throw new Error('No user message provided');

  const chat = geminiModel.startChat({ history });
  const result = await chat.sendMessage(lastMsg.content);
  return result.response.text().trim();
}

// Ollama Cloud 네이티브 API — 429 rate-limit 시 다음 키로 자동 순환
async function callOllamaCloud(
  messages: AIMessage[],
  model: string,
  keys: string[],
): Promise<string> {
  const ollamaMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : m.role,
    content: m.content,
  }));

  let rateLimitErr: Error | null = null;
  for (const apiKey of keys) {
    const res = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: ollamaMessages, stream: false }),
    });

    if (res.status === 429) {
      rateLimitErr = new Error(`Ollama Cloud 요청 한도 초과 (429) — 다음 키 시도 중`);
      console.warn(`[ai-call] Ollama Cloud 429 for key ${apiKey.slice(0, 8)}..., rotating`);
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama Cloud 오류 ${res.status}: ${err}`);
    }

    const data = await res.json() as { message?: { content?: string }; error?: string };
    if (data.error) throw new Error(data.error);
    return data.message?.content?.trim() || '';
  }

  throw rateLimitErr || new Error('Ollama Cloud: 사용 가능한 API 키가 없습니다.');
}

async function callOpenAICompatible(
  messages: AIMessage[],
  model: string,
  apiKey: string,
  provider: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  let baseUrl: string;
  if (provider === 'openrouter') {
    baseUrl = 'https://openrouter.ai/api/v1';
  } else if (provider === 'ollama') {
    const ollamaUrl = await getSetting('OLLAMA_BASE_URL');
    if (!ollamaUrl) {
      throw new Error('Ollama 로컬 URL이 설정되지 않았습니다.');
    }
    baseUrl = `${ollamaUrl}/v1`;
  } else {
    baseUrl = 'https://api.openai.com/v1';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey || 'ollama'}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://loov.co.kr';
    headers['X-Title'] = 'LOOV';
  }

  // 로컬 Ollama는 30초, 외부 API는 60초 타임아웃
  const timeoutMs = provider === 'ollama' ? 30_000 : 60_000;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || `${provider} API error ${res.status}`);
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ── Single provider call ─────────────────────────────────────────────────────

async function callSingleProvider(
  provider: string,
  model: string,
  messages: AIMessage[],
  apiKey: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  if (provider === 'claude') {
    return callClaude(messages, model, apiKey, maxTokens, temperature);
  } else if (provider === 'gemini') {
    return callGemini(messages, model, apiKey);
  } else if (provider === 'ollama') {
    const ollamaBaseUrl = await getSetting('OLLAMA_BASE_URL');
    if (ollamaBaseUrl) {
      // 로컬 Ollama 우선 (OLLAMA_BASE_URL 설정 시)
      return callOpenAICompatible(messages, model, 'ollama', provider, maxTokens, temperature);
    } else if (apiKey && apiKey !== 'ollama') {
      // 로컬 없을 때만 Ollama Cloud 사용
      const cloudKeys = await getOllamaCloudKeys();
      const keys = cloudKeys.length > 0 ? cloudKeys : [apiKey];
      return callOllamaCloud(messages, model, keys);
    } else {
      throw new Error('Ollama: OLLAMA_BASE_URL 또는 클라우드 API 키가 필요합니다.');
    }
  } else {
    // gpt4o, gpt4, gpt35, openrouter, ollama all use OpenAI-compatible API
    return callOpenAICompatible(messages, model, apiKey, provider, maxTokens, temperature);
  }
}

// ── Main exported function ───────────────────────────────────────────────────

export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const {
    messages,
    provider: primaryProviderOpt,
    model: primaryModelOpt,
    apiKey: keyOverride,
    maxTokens = 2048,
    temperature = 0.7,
    useFallback = true,
  } = options;

  // Read global AI settings from DB when no provider/model specified
  let primaryProvider = primaryProviderOpt || 'ollama';
  let primaryModelFallback: string | undefined = primaryModelOpt;

  if (!primaryProviderOpt) {
    try {
      const globalProvider = await getSetting('AI_GLOBAL_PROVIDER');
      if (globalProvider) primaryProvider = globalProvider;
    } catch { /* use default */ }
  }

  if (!primaryModelOpt) {
    try {
      const globalModel = await getSetting('AI_GLOBAL_MODEL');
      if (globalModel) primaryModelFallback = globalModel;
    } catch { /* use default */ }
  }

  const resolvedKey = await resolveApiKey(primaryProvider, keyOverride);
  // Claude: 모델 미지정 시 Anthropic API에서 최신 sonnet 동적 선택
  let resolvedModel = primaryModelFallback || defaultModel(primaryProvider);
  if (primaryProvider === 'claude' && !primaryModelFallback && resolvedKey) {
    resolvedModel = await getLatestClaudeModel('sonnet', resolvedKey);
  }

  // Try primary provider
  try {
    const text = await callSingleProvider(
      primaryProvider,
      resolvedModel,
      messages,
      resolvedKey,
      maxTokens,
      temperature,
    );
    return { text, provider: primaryProvider, model: resolvedModel, usedFallback: false };
  } catch (primaryErr) {
    console.error(`[ai-call] Primary provider "${primaryProvider}" failed:`, primaryErr);

    if (!useFallback) {
      throw primaryErr;
    }
  }

  // Load fallback chain from settings
  let chain: FallbackEntry[] = DEFAULT_FALLBACK_CHAIN;
  try {
    const chainRaw = await getSetting('AI_FALLBACK_CHAIN');
    if (chainRaw) {
      const parsed = JSON.parse(chainRaw) as FallbackEntry[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        chain = parsed;
      }
    }
  } catch {
    // Use default chain
  }

  // Try each fallback in order
  for (const entry of chain) {
    // Skip if same as primary (already failed)
    if (entry.provider === primaryProvider && entry.model === resolvedModel) continue;

    try {
      const fbKey = await resolveApiKey(entry.provider);
      const text = await callSingleProvider(
        entry.provider,
        entry.model,
        messages,
        fbKey,
        maxTokens,
        temperature,
      );
      console.log(`[ai-call] Fallback succeeded with "${entry.provider}/${entry.model}"`);
      return { text, provider: entry.provider, model: entry.model, usedFallback: true };
    } catch (fbErr) {
      console.error(`[ai-call] Fallback "${entry.provider}/${entry.model}" also failed:`, fbErr);
    }
  }

  throw new Error('All AI providers failed. Please check your API keys and settings.');
}

// ── Convenience wrapper ──────────────────────────────────────────────────────

export async function callAISimple(
  prompt: string,
  systemPrompt?: string,
  provider?: string,
): Promise<string> {
  const messages: AIMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const result = await callAI({ messages, provider, useFallback: true });
  return result.text;
}
