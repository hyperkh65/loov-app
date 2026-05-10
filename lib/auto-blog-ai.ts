/**
 * 블로그 자동화용 AI 텍스트 생성 (non-streaming)
 * 우선순위: Ollama Cloud → OpenRouter → Gemini → OpenAI
 * 각각 localStorage 키(무료AI 페이지) 또는 DB/env 설정값 사용
 */
import { getSetting } from './get-setting';

const OPENROUTER_MODELS = [
  'qwen/qwen3-235b-a22b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-7b-instruct:free',
];

async function callOllama(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
    signal: AbortSignal.timeout(540_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.message?.content || '';
  if (!text) throw new Error('Ollama 빈 응답');
  return text;
}

async function callOpenRouter(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://loov.co.kr',
      'X-Title': 'LOOV Blog Automation',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
    signal: AbortSignal.timeout(540_000),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenRouter 빈 응답');
  return text;
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(540_000),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini 빈 응답');
  return text;
}

async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(540_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenAI 빈 응답');
  return text;
}

// Ollama 가용 모델 캐시 (키별, 1시간)
const _ollamaModelCache = new Map<string, { models: string[]; ts: number }>();

async function getAvailableOllamaModels(apiKey: string): Promise<string[]> {
  const CACHE_TTL = 3_600_000;
  const cached = _ollamaModelCache.get(apiKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.models;
  try {
    const res = await fetch('https://ollama.com/api/tags', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      _ollamaModelCache.set(apiKey, { models: [], ts: Date.now() });
      return [];
    }
    const data = await res.json() as { models?: Array<{ name: string }> };
    const models = (data.models || []).map(m => m.name.split(':')[0]);
    _ollamaModelCache.set(apiKey, { models, ts: Date.now() });
    return models;
  } catch {
    return [];
  }
}

// Claude 모델 캐시 (프로세스 내 1시간)
let _claudeModelCache: { models: string[]; ts: number } | null = null;

async function getLatestClaudeHaiku(apiKey: string): Promise<string> {
  const FALLBACK = 'claude-haiku-4-5-20251001';
  try {
    const now = Date.now();
    if (_claudeModelCache && now - _claudeModelCache.ts < 3_600_000) {
      const haiku = _claudeModelCache.models.find((m) => m.includes('haiku'));
      return haiku || FALLBACK;
    }
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return FALLBACK;
    const data = await res.json() as { data: Array<{ id: string; created_at: string }> };
    const models = (data.data || [])
      .filter((m) => m.id.startsWith('claude-'))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((m) => m.id);
    _claudeModelCache = { models, ts: now };
    return models.find((m) => m.includes('haiku')) || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

async function callClaude(apiKey: string, prompt: string, model?: string): Promise<string> {
  const resolvedModel = model || await getLatestClaudeHaiku(apiKey);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: resolvedModel,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(540_000),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  if (!text) throw new Error('Claude 빈 응답');
  return text;
}

export async function generateText(
  prompt: string,
  preferModel: string = 'qwen3',
  clientOllamaKey?: string,
  clientOpenrouterKey?: string,
): Promise<string> {
  const errors: string[] = [];

  // 0. Claude 모델 직접 지정된 경우 우선 처리
  if (preferModel.startsWith('claude-')) {
    const claudeKey = await getSetting('CLAUDE_API_KEY');
    if (claudeKey) {
      try {
        return await callClaude(claudeKey, prompt, preferModel);
      } catch (e) {
        errors.push(`Claude(${preferModel}): ${e}`);
      }
    }
  }

  // 1. Ollama Cloud (무료AI 페이지 localStorage 키 우선 → DB 배열키 → DB 단수키 순서)
  const ollamaKeys: string[] = [];
  if (clientOllamaKey) ollamaKeys.push(clientOllamaKey);
  try {
    const raw = await getSetting('OLLAMA_API_KEYS');
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) ollamaKeys.push(...arr.filter(Boolean));
    }
  } catch { /* ignore */ }
  const legacyKey = await getSetting('OLLAMA_API_KEY');
  if (legacyKey && !ollamaKeys.includes(legacyKey)) ollamaKeys.push(legacyKey);

  if (ollamaKeys.length > 0) {
    const OLLAMA_FALLBACKS = [
      'qwen3.5', 'qwen3', 'qwen3-coder', 'llama3.3', 'llama3.2',
      'mistral', 'mistral-small3.1', 'gemma3', 'deepseek-r1',
      'phi4', 'phi4-mini', 'ministral-3',
    ];
    for (const ollamaKey of ollamaKeys) {
      // 실제 사용 가능한 모델만 시도 (없으면 fallback 전체 시도)
      const available = await getAvailableOllamaModels(ollamaKey);
      const allCandidates = [preferModel, ...OLLAMA_FALLBACKS.filter(m => m !== preferModel)];
      const modelsToTry = available.length > 0
        ? allCandidates.filter(m => available.includes(m))
        : allCandidates;
      if (modelsToTry.length === 0) continue;
      for (const tryModel of modelsToTry) {
        try { return await callOllama(ollamaKey, tryModel, prompt); } catch { continue; }
      }
    }
    errors.push('Ollama Cloud: 모든 키/모델 실패');
  }

  // 2. OpenRouter (localStorage 키 → DB 설정 키 순서)
  const orKey = clientOpenrouterKey || await getSetting('OPENROUTER_API_KEY');
  if (orKey) {
    for (const model of OPENROUTER_MODELS) {
      try { return await callOpenRouter(orKey, model, prompt); } catch { continue; }
    }
  }

  // 3. Gemini (설정 페이지 DB 키)
  const geminiKey = await getSetting('GEMINI_API_KEY');
  if (geminiKey) {
    try {
      return await callGemini(geminiKey, prompt);
    } catch (e) {
      errors.push(`Gemini: ${e}`);
    }
  }

  // 4. OpenAI (설정 페이지 DB 키)
  const openaiKey = await getSetting('OPENAI_API_KEY');
  if (openaiKey) {
    try {
      return await callOpenAI(openaiKey, prompt);
    } catch (e) {
      errors.push(`OpenAI: ${e}`);
    }
  }

  // 5. Claude Haiku (설정 페이지 DB 키 - 빠르고 저렴, 한국어 우수)
  const claudeKey = await getSetting('CLAUDE_API_KEY');
  if (claudeKey) {
    try {
      return await callClaude(claudeKey, prompt);
    } catch (e) {
      errors.push(`Claude: ${e}`);
    }
  }

  throw new Error(
    `사용 가능한 AI 없음\n` +
    (errors.length ? `오류: ${errors.join(' | ')}\n` : '') +
    'Ollama Cloud 키가 없거나 모든 모델 실패 → 설정 페이지에서 Gemini, OpenAI, Claude API 키 중 하나를 저장하세요.'
  );
}
