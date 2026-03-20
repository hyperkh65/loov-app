import { NextRequest } from 'next/server';

const FREE_MODELS = [
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B', emoji: '🦙' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B', emoji: '🌪️' },
  { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B', emoji: '💎' },
  { id: 'qwen/qwen-2-7b-instruct:free', name: 'Qwen 2 7B', emoji: '🔮' },
  { id: 'microsoft/phi-3-mini-128k-instruct:free', name: 'Phi-3 Mini', emoji: '⚡' },
];

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { messages, model, ollamaUrl, ollamaModel } = await req.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Helper: try OpenRouter with a specific model
      async function tryOpenRouter(modelId: string): Promise<boolean> {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) return false;
        try {
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://loov.co.kr',
              'X-Title': 'LOOV Free AI',
            },
            body: JSON.stringify({
              model: modelId,
              messages,
              stream: true,
              max_tokens: 2048,
            }),
          });
          if (!res.ok || !res.body) return false;

          const modelInfo = FREE_MODELS.find(m => m.id === modelId);
          send({ provider: 'openrouter', model: modelInfo?.name || modelId, emoji: modelInfo?.emoji || '🤖' });

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

      // Helper: try Ollama
      async function tryOllama(baseUrl: string, modelName: string): Promise<boolean> {
        try {
          const res = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelName,
              messages,
              stream: true,
            }),
          });
          if (!res.ok || !res.body) return false;

          send({ provider: 'ollama', model: modelName, emoji: '🏠' });

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
                const chunk = j.message?.content || '';
                if (chunk) send({ chunk });
                if (j.done) return true;
              } catch {}
            }
          }
          return true;
        } catch { return false; }
      }

      let success = false;

      // 1. Try user-provided Ollama URL
      if (ollamaUrl && ollamaModel) {
        success = await tryOllama(ollamaUrl.replace(/\/$/, ''), ollamaModel);
      }

      // 2. Try server Ollama
      if (!success && process.env.OLLAMA_BASE_URL) {
        const defaultModel = ollamaModel || 'llama3.2' || 'mistral';
        success = await tryOllama(process.env.OLLAMA_BASE_URL, defaultModel);
      }

      // 3. Try OpenRouter free models in order
      if (!success) {
        const targetModel = model && FREE_MODELS.find(m => m.id === model) ? model : null;
        const modelsToTry = targetModel
          ? [targetModel, ...FREE_MODELS.filter(m => m.id !== targetModel).map(m => m.id)]
          : FREE_MODELS.map(m => m.id);

        for (const modelId of modelsToTry) {
          success = await tryOpenRouter(modelId);
          if (success) break;
        }
      }

      if (!success) {
        send({ error: 'API 키 미설정 또는 모든 무료 모델 응답 실패. 설정에서 OpenRouter API 키를 추가하거나 Ollama URL을 입력해주세요.' });
      }

      send({ done: true });
      controller.close();
    }
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
  return Response.json({ models: FREE_MODELS });
}
