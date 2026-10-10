import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

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

  if (keys.length === 0) return NextResponse.json({ error: 'Ollama 키 없음' }, { status: 400 });

  const results = await Promise.all(keys.map(async (key, i) => {
    const prefix = key.slice(0, 8) + '...';
    try {
      // 1. 모델 목록 조회
      const tagsRes = await fetch('https://ollama.com/api/tags', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!tagsRes.ok) {
        const body = await tagsRes.text();
        return { key: i + 1, prefix, status: tagsRes.status, result: '❌ 키 오류', detail: body.slice(0, 100) };
      }
      const tagsData = await tagsRes.json() as { models?: Array<{ name: string }> };
      const models = (tagsData.models || []).map(m => m.name).filter(Boolean);

      // 2. deepseek-v4-flash 있는지 확인
      const hasDeepseek = models.some(m => m.includes('deepseek-v4-flash'));
      const freeModels = models.slice(0, 5);

      return {
        key: i + 1,
        prefix,
        status: 200,
        result: '✅ 정상',
        model_count: models.length,
        has_deepseek_v4_flash: hasDeepseek,
        sample_models: freeModels,
      };
    } catch (e) {
      return { key: i + 1, prefix, status: 0, result: '⏱️ 타임아웃/연결오류', detail: String(e).slice(0, 100) };
    }
  }));

  const validCount = results.filter(r => r.result === '✅ 정상').length;
  return NextResponse.json({ total_keys: keys.length, valid_keys: validCount, results });
}
