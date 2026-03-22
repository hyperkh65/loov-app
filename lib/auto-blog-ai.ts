/**
 * 블로그 자동화용 AI 텍스트 생성 (non-streaming)
 * Ollama Cloud → OpenRouter 순서로 폴백
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
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
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

export async function generateText(
  prompt: string,
  preferModel: string = 'qwen3',
  clientOllamaKey?: string,
  clientOpenrouterKey?: string,
): Promise<string> {
  // 1. Ollama Cloud — 클라이언트 키 우선, 없으면 서버 env/DB
  const ollamaKey = clientOllamaKey || await getSetting('OLLAMA_API_KEY');
  if (ollamaKey) {
    // 지정 모델 먼저 시도
    try {
      return await callOllama(ollamaKey, preferModel, prompt);
    } catch (e) {
      console.warn(`[AI] Ollama ${preferModel} 실패:`, e);
    }
    // 폴백 모델들
    for (const fallbackModel of ['qwen3', 'llama3.3', 'mistral', 'gemma3']) {
      if (fallbackModel === preferModel) continue;
      try {
        return await callOllama(ollamaKey, fallbackModel, prompt);
      } catch { continue; }
    }
  }

  // 2. OpenRouter — 클라이언트 키 우선, 없으면 서버 env/DB
  const orKey = clientOpenrouterKey || await getSetting('OPENROUTER_API_KEY');
  if (orKey) {
    for (const model of OPENROUTER_MODELS) {
      try {
        return await callOpenRouter(orKey, model, prompt);
      } catch { continue; }
    }
  }

  throw new Error('사용 가능한 AI 없음 — 무료AI 페이지에서 Ollama 또는 OpenRouter 키를 설정해주세요');
}
