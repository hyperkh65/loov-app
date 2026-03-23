/**
 * 블로그 자동화용 AI 텍스트 생성 (non-streaming)
 * 우선순위: Ollama Cloud → OpenRouter → Gemini → OpenAI
 * 각각 localStorage 키(무료AI 페이지) 또는 DB/env 설정값 사용
 */
import { getSetting } from './get-setting';

const OPENROUTER_MODELS = [
  'qwen/qwen3-14b:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free',
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
    signal: AbortSignal.timeout(180_000),
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
    signal: AbortSignal.timeout(120_000),
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
      signal: AbortSignal.timeout(120_000),
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
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenAI 빈 응답');
  return text;
}

async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(120_000),
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
    try {
      return await callOllama(ollamaKey, preferModel, prompt);
    } catch (e) {
      errors.push(`Ollama(${preferModel}): ${e}`);
    }
    for (const fallback of ['qwen3', 'llama3.3', 'mistral', 'gemma3']) {
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
    `사용 가능한 AI 없음 (${errors.join(' | ')})\n` +
    '설정 페이지 → API 키 관리에서 Gemini, OpenAI, Claude 키 중 하나를 저장하세요.'
  );
}
