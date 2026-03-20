import { NextRequest } from 'next/server';

// Ollama Cloud 모델 (cloud 태그 있는 것들)
export const OLLAMA_CLOUD_MODELS = [
  { id: 'qwen3.5', name: 'Qwen 3.5', emoji: '🔮', desc: '멀티모달 · vision · thinking' },
  { id: 'qwen3', name: 'Qwen 3', emoji: '🔮', desc: 'Alibaba · 다국어 강점' },
  { id: 'qwen3-coder-next', name: 'Qwen 3 Coder', emoji: '💻', desc: '코딩 특화' },
  { id: 'llama3.3', name: 'Llama 3.3', emoji: '🦙', desc: 'Meta AI · 범용' },
  { id: 'mistral', name: 'Mistral', emoji: '🌪️', desc: '유럽산 · 빠른 응답' },
  { id: 'gemma3', name: 'Gemma 3', emoji: '💎', desc: 'Google · 경량 고성능' },
  { id: 'deepseek-r1', name: 'DeepSeek R1', emoji: '🧠', desc: '추론 특화 · 사고과정 표시' },
  { id: 'phi4', name: 'Phi 4', emoji: '⚡', desc: 'Microsoft · 초경량' },
];

// OpenRouter 무료 폴백 모델
const OPENROUTER_FREE_MODELS = [
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B', emoji: '🦙' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B', emoji: '🌪️' },
  { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B', emoji: '💎' },
  { id: 'qwen/qwen-2-7b-instruct:free', name: 'Qwen 2 7B', emoji: '🔮' },
];

export const maxDuration = 30;

// Ollama Cloud 네이티브 스트리밍 (https://ollama.com/api/chat + Bearer 인증)
async function streamOllamaCloud(
  apiKey: string,
  modelName: string,
  messages: object[],
  providerName: string,
  displayName: string,
  emoji: string,
  send: (data: object) => void,
): Promise<boolean> {
  try {
    const res = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: modelName, messages, stream: true }),
    });
    if (!res.ok || !res.body) return false;

    send({ provider: providerName, model: displayName, emoji });

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          if (j.message?.content) send({ chunk: j.message.content });
          if (j.done) return true;
        } catch {}
      }
    }
    return true;
  } catch { return false; }
}

// OpenAI 호환 스트리밍 (Ollama Cloud + OpenRouter 공용)
async function streamOpenAI(
  url: string,
  apiKey: string,
  model: string,
  messages: object[],
  providerName: string,
  modelName: string,
  emoji: string,
  send: (data: object) => void,
  extraHeaders?: Record<string, string>,
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: 2048 }),
    });
    if (!res.ok || !res.body) return false;

    send({ provider: providerName, model: modelName, emoji });

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const d = line.slice(6).trim();
        if (d === '[DONE]') continue;
        try {
          const j = JSON.parse(d);
          const chunk = j.choices?.[0]?.delta?.content || '';
          if (chunk) send({ chunk });
        } catch {}
      }
    }
    return true;
  } catch { return false; }
}

// 로컬 Ollama (native /api/chat 형식)
async function streamLocalOllama(
  baseUrl: string,
  modelName: string,
  messages: object[],
  send: (data: object) => void,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, messages, stream: true }),
    });
    if (!res.ok || !res.body) return false;

    send({ provider: 'Ollama (로컬)', model: modelName, emoji: '🏠' });

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          if (j.message?.content) send({ chunk: j.message.content });
          if (j.done) return true;
        } catch {}
      }
    }
    return true;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const { messages, model, ollamaUrl, ollamaModel } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let success = false;
      // 공식 문서 기준: env var = OLLAMA_API_KEY, host = https://ollama.com
      const ollamaCloudKey = process.env.OLLAMA_API_KEY;

      // 1. Ollama Cloud (공식 클라우드) - 최우선
      if (!success && ollamaCloudKey) {
        const targetModel = model && OLLAMA_CLOUD_MODELS.find(m => m.id === model)
          ? model : OLLAMA_CLOUD_MODELS[0].id;
        const info = OLLAMA_CLOUD_MODELS.find(m => m.id === targetModel) || OLLAMA_CLOUD_MODELS[0];

        // Ollama Cloud는 네이티브 /api/chat 형식 + Authorization 헤더
        success = await streamOllamaCloud(ollamaCloudKey, targetModel, messages,
          'Ollama Cloud', info.name, info.emoji, send);

        // 선택 모델 실패 시 다른 모델로 폴백
        if (!success) {
          for (const m of OLLAMA_CLOUD_MODELS) {
            if (m.id === targetModel) continue;
            success = await streamOllamaCloud(ollamaCloudKey, m.id, messages,
              'Ollama Cloud', m.name, m.emoji, send);
            if (success) break;
          }
        }
      }

      // 2. 사용자 입력 로컬 Ollama
      if (!success && ollamaUrl && ollamaModel) {
        success = await streamLocalOllama(ollamaUrl.replace(/\/$/, ''), ollamaModel, messages, send);
      }

      // 3. 서버 환경변수 로컬 Ollama
      if (!success && process.env.OLLAMA_BASE_URL) {
        success = await streamLocalOllama(
          process.env.OLLAMA_BASE_URL, ollamaModel || 'llama3.2', messages, send,
        );
      }

      // 4. OpenRouter 무료 모델 폴백
      if (!success && process.env.OPENROUTER_API_KEY) {
        for (const m of OPENROUTER_FREE_MODELS) {
          success = await streamOpenAI(
            'https://openrouter.ai/api/v1/chat/completions',
            process.env.OPENROUTER_API_KEY,
            m.id, messages, 'OpenRouter', m.name, m.emoji, send,
            { 'HTTP-Referer': 'https://loov.co.kr', 'X-Title': 'LOOV Free AI' },
          );
          if (success) break;
        }
      }

      if (!success) {
        send({ error: 'OLLAMA_CLOUD_API_KEY 또는 OPENROUTER_API_KEY 환경변수를 설정해주세요.' });
      }

      send({ done: true });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export async function GET() {
  return Response.json({
    ollamaCloudModels: OLLAMA_CLOUD_MODELS,
    openrouterModels: OPENROUTER_FREE_MODELS,
    configured: {
      ollamaCloud: !!process.env.OLLAMA_API_KEY,
      openrouter: !!process.env.OPENROUTER_API_KEY,
      localOllama: !!process.env.OLLAMA_BASE_URL,
    },
  });
}
