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
  { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
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
      const cloudKey = await getSetting('OLLAMA_API_KEY');
      return cloudKey || 'ollama'; // cloud key or local dummy
    }
    case 'gpt4o':
    case 'gpt4':
    case 'gpt35':
      return getSetting('OPENAI_API_KEY');
    default:
      return 'ollama';
  }
}

// ── Default model per provider ───────────────────────────────────────────────

function defaultModel(provider: string): string {
  switch (provider) {
    case 'claude':      return 'claude-sonnet-4-6';
    case 'gemini':      return 'gemini-2.0-flash';
    case 'gpt4o':       return 'gpt-4o';
    case 'gpt4':        return 'gpt-4-turbo';
    case 'gpt35':       return 'gpt-3.5-turbo';
    case 'openrouter':  return 'meta-llama/llama-3.3-70b-instruct:free';
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
    const cloudKey = await getSetting('OLLAMA_API_KEY');
    if (cloudKey) {
      baseUrl = 'https://ollama.com/v1'; // Ollama Cloud
    } else {
      const ollamaUrl = await getSetting('OLLAMA_BASE_URL');
      if (!ollamaUrl) {
        throw new Error('Ollama API 키가 설정되지 않았습니다. 설정 > AI > Ollama Cloud API Key를 입력해주세요.');
      }
      baseUrl = `${ollamaUrl}/v1`; // Local
    }
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

  const resolvedModel = primaryModelFallback || defaultModel(primaryProvider);
  const resolvedKey = await resolveApiKey(primaryProvider, keyOverride);

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
