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

async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const model = await getLatestClaudeHaiku(apiKey);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
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

  // 1. Ollama Cloud (무료AI 페이지 localStorage 키 우선)
  const ollamaKey = clientOllamaKey || await getSetting('OLLAMA_API_KEY');
  if (ollamaKey) {
    // 선호 모델 시도
    try {
      return await callOllama(ollamaKey, preferModel, prompt);
    } catch (e) {
      const errStr = String(e);
      // "string not match" = Ollama Cloud에 해당 모델 없음 → fallback 시도
      errors.push(`Ollama(${preferModel}): ${errStr.includes('string not match') ? '모델 없음' : errStr}`);
    }
    // fallback: 최신 popular 모델 순서로 시도 (ollama.com/search 기준)
    const OLLAMA_FALLBACKS = [
      'qwen3.5', 'qwen3', 'qwen3-coder', 'llama3.3', 'llama3.2',
      'mistral', 'mistral-small3.1', 'gemma3', 'deepseek-r1',
      'phi4', 'phi4-mini', 'ministral-3',
    ];
    for (const fallback of OLLAMA_FALLBACKS) {
      if (fallback === preferModel) continue;
      try { return await callOllama(ollamaKey, fallback, prompt); } catch { continue; }
    }
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
