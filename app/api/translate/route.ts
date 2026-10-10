import { NextRequest } from 'next/server';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 30;

const LANG_NAMES: Record<string, string> = {
  'zh-CN': '중국어(간체)',
  'zh-TW': '중국어(번체)',
  'en-US': '영어',
  'ja-JP': '일본어',
  'ko-KR': '한국어',
};

export async function POST(req: NextRequest) {
  try {
    const { text, from = 'zh-CN', to = 'ko-KR' } = await req.json() as {
      text: string;
      from?: string;
      to?: string;
    };

    if (!text?.trim()) {
      return new Response(
        `data: ${JSON.stringify({ error: '번역할 텍스트가 없습니다.' })}\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    }

    const fromName = LANG_NAMES[from] ?? from;
    const toName   = LANG_NAMES[to]   ?? to;

    const systemPrompt =
      `You are a professional translator. ` +
      `Translate the following ${fromName} text into ${toName}. ` +
      `Output ONLY the translated text, with no explanations, no romanization, no extra comments.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: text },
    ];

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        try {
          // ── 1. Ollama Cloud ─────────────────────────────────────────
          const ollamaKey = await getSetting('OLLAMA_API_KEY');
          if (ollamaKey) {
            try {
              const res = await fetch('https://ollama.com/api/chat', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${ollamaKey}`,
                },
                body: JSON.stringify({ model: 'qwen3', messages, stream: true }),
                signal: AbortSignal.timeout(20000),
              });

              if (res.ok && res.body) {
                send({ model: 'qwen3' });
                const reader = res.body.getReader();
                const dec = new TextDecoder();
                let buf = '';
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buf += dec.decode(value, { stream: true });
                  const lines = buf.split('\n');
                  buf = lines.pop() ?? '';
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
            } catch {}
          }

          // ── 2. OpenRouter 폴백 ───────────────────────────────────────
          const orKey = await getSetting('OPENROUTER_API_KEY');
          if (orKey) {
            const orModels = [
              'qwen/qwen3-235b-a22b:free',
              'meta-llama/llama-3.3-70b-instruct:free',
              'deepseek/deepseek-r1:free',
            ];
            for (const model of orModels) {
              try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${orKey}`,
                  },
                  body: JSON.stringify({ model, messages, stream: true }),
                  signal: AbortSignal.timeout(20000),
                });
                if (res.ok && res.body) {
                  send({ model: model.split('/').pop()?.split(':')[0] ?? model });
                  const reader = res.body.getReader();
                  const dec = new TextDecoder();
                  let buf = '';
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += dec.decode(value, { stream: true });
                    const lines = buf.split('\n');
                    buf = lines.pop() ?? '';
                    for (const line of lines) {
                      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
                      try {
                        const j = JSON.parse(line.slice(6));
                        const c = j.choices?.[0]?.delta?.content;
                        if (c) send({ chunk: c });
                      } catch {}
                    }
                  }
                  controller.close();
                  return;
                }
              } catch { continue; }
            }
          }

          send({ error: 'AI 모델에 연결할 수 없습니다. 무료AI 메뉴에서 API 키를 확인하세요.' });
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
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }
}
