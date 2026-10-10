import { NextRequest } from 'next/server';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      systemPrompt: string;
      model?: string;
    };

    const { messages, systemPrompt, model = 'qwen3' } = body;

    const ollamaKey = await getSetting('OLLAMA_API_KEY');
    if (!ollamaKey) {
      return new Response(
        `data: ${JSON.stringify({ error: '무료AI 메뉴에서 Ollama API 키를 설정해주세요.' })}\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } }
      );
    }

    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        try {
          // 1. Ollama Cloud 시도
          const res = await fetch('https://ollama.com/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ollamaKey}`,
            },
            body: JSON.stringify({ model, messages: ollamaMessages, stream: true }),
            signal: AbortSignal.timeout(55000),
          });

          if (res.ok && res.body) {
            send({ model });
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
                } catch {}
              }
            }
            controller.close();
            return;
          }

          // 2. OpenRouter 무료 폴백
          const orKey = await getSetting('OPENROUTER_API_KEY');
          if (orKey) {
            const orModels = [
              'qwen/qwen3-235b-a22b:free',
              'meta-llama/llama-3.3-70b-instruct:free',
              'deepseek/deepseek-r1:free',
            ];
            for (const orModel of orModels) {
              try {
                const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${orKey}`,
                  },
                  body: JSON.stringify({ model: orModel, messages: ollamaMessages, stream: true }),
                  signal: AbortSignal.timeout(30000),
                });
                if (orRes.ok && orRes.body) {
                  send({ model: orModel });
                  const reader = orRes.body.getReader();
                  const dec = new TextDecoder();
                  let buf = '';
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += dec.decode(value, { stream: true });
                    const lines = buf.split('\n');
                    buf = lines.pop() || '';
                    for (const line of lines) {
                      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
                      try {
                        const j = JSON.parse(line.slice(6));
                        const chunk = j.choices?.[0]?.delta?.content;
                        if (chunk) send({ chunk });
                      } catch {}
                    }
                  }
                  controller.close();
                  return;
                }
              } catch { continue; }
            }
          }

          send({ error: 'AI 모델 연결 실패. Ollama API 키를 확인해주세요.' });
        } catch (e) {
          send({ error: String(e) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    return new Response(
      `data: ${JSON.stringify({ error: String(e) })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } }
    );
  }
}
