import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

export async function GET() {
  // Read all Ollama Cloud keys
  const keys: string[] = [];
  try {
    const raw = await getSetting('OLLAMA_API_KEYS');
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) keys.push(...arr.filter(Boolean));
    }
  } catch { /* ignore */ }
  const legacy = await getSetting('OLLAMA_API_KEY');
  if (legacy && !keys.includes(legacy)) keys.push(legacy);

  if (keys.length === 0) {
    return NextResponse.json({ error: 'Ollama Cloud 키가 없습니다' }, { status: 400 });
  }

  const results: Record<string, unknown>[] = [];

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    const keyHint = apiKey.slice(0, 8) + '...';
    try {
      const res = await fetch('https://ollama.com/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'qwen3.5',
          messages: [{ role: 'user', content: '안녕' }],
          stream: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const rawText = await res.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(rawText); } catch { /* ignore */ }

      results.push({
        keyIndex: i + 1,
        keyHint,
        status: res.status,
        ok: res.ok,
        responseText: rawText.slice(0, 500),
        parsed,
      });
    } catch (e) {
      results.push({
        keyIndex: i + 1,
        keyHint,
        error: String(e),
      });
    }
  }

  return NextResponse.json({ keysFound: keys.length, results });
}
