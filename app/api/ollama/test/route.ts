import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/get-setting';

const TEST_MODELS = [
  'llama3.2', 'llama3.1', 'llama3', 'llama2',
  'mistral', 'gemma3', 'gemma2', 'gemma',
  'phi3', 'phi3.5', 'phi4',
  'qwen2.5', 'qwen2', 'qwen',
  'deepseek-r1', 'deepseek-v2',
  'tinyllama', 'orca-mini',
];

export async function GET() {
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

  const apiKey = keys[0];
  const keyHint = apiKey.slice(0, 8) + '...';
  const results: Record<string, unknown>[] = [];

  for (const model of TEST_MODELS) {
    try {
      const res = await fetch('https://ollama.com/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hi' }],
          stream: false,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(text); } catch { /* ignore */ }

      const isSubscriptionErr = text.includes('subscription');
      const isModelNotFound = text.includes('not found') || text.includes('pull');

      results.push({
        model,
        status: res.status,
        ok: res.ok,
        result: res.ok ? 'FREE ✅' : isSubscriptionErr ? '유료 ❌' : isModelNotFound ? '모델없음 ⚠️' : `오류 ${res.status}`,
        response: res.ok ? (parsed as Record<string, unknown>)?.message : text.slice(0, 100),
      });

      if (res.ok) break; // 첫 번째 작동 모델 찾으면 중단
    } catch (e) {
      results.push({ model, error: String(e), result: '타임아웃/연결오류' });
    }
  }

  const freeModels = results.filter((r) => r['result'] === 'FREE ✅').map((r) => r['model']);

  return NextResponse.json({ keyHint, freeModels, results });
}
