import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 30;

const LANG_NAMES: Record<string, string> = {
  'zh-CN': '중국어(간체)',
  'zh-TW': '중국어(번체)',
  'en-US': '영어',
  'ja-JP': '일본어',
  'ko-KR': '한국어',
  'auto':  '자동감지',
};

export async function POST(req: NextRequest) {
  try {
    const { text, from = 'zh-CN', to = 'ko-KR' } = await req.json() as {
      text: string;
      from?: string;
      to?: string;
    };

    if (!text?.trim()) {
      return NextResponse.json({ error: '번역할 텍스트가 없습니다.' }, { status: 400 });
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

    // ── 스트리밍 청크 수집 헬퍼 ──────────────────────────────────────
    async function collectOllamaStream(body: ReadableStream): Promise<string> {
      const reader = body.getReader();
      const dec = new TextDecoder();
      let buf = '', content = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try { const j = JSON.parse(line); if (j.message?.content) content += j.message.content; } catch {}
        }
      }
      return content.trim();
    }

    async function collectOpenRouterStream(body: ReadableStream): Promise<string> {
      const reader = body.getReader();
      const dec = new TextDecoder();
      let buf = '', content = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try { const j = JSON.parse(line.slice(6)); const c = j.choices?.[0]?.delta?.content; if (c) content += c; } catch {}
        }
      }
      return content.trim();
    }

    // ── 1. Ollama Cloud (streaming 수집) ──────────────────────────
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
          const translation = await collectOllamaStream(res.body);
          if (translation) return NextResponse.json({ translation, model: 'qwen3 (Ollama)' });
        }
      } catch {}
    }

    // ── 2. OpenRouter 무료 폴백 (streaming 수집) ──────────────────
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
            const translation = await collectOpenRouterStream(res.body);
            if (translation) return NextResponse.json({ translation, model });
          }
        } catch { continue; }
      }
    }

    return NextResponse.json(
      { error: 'AI 모델에 연결할 수 없습니다. 무료AI 메뉴에서 API 키를 확인하세요.' },
      { status: 503 },
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
