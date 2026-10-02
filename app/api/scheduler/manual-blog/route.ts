import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { runBlogAuto } from '@/lib/scheduler/blog-runner';
import type { Schedule } from '@/lib/scheduler';

export const maxDuration = 300;

// Ollama가 막힐 때 사람(Claude)이 직접 쓴 원문을 기존 발행 파이프라인(이미지·게이트·발행·SNS)에 태운다.
export async function POST(req: NextRequest) {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret || req.headers.get('x-deploy-secret') !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { schedule_id, keyword, raw } = await req.json();
  if (!schedule_id || !keyword || !raw) return NextResponse.json({ error: 'schedule_id, keyword, raw 필요' }, { status: 400 });
  const { data: schedule } = await createAdminClient().from('bossai_schedules').select('*').eq('id', schedule_id).eq('type', 'blog_auto').single();
  if (!schedule) return NextResponse.json({ error: 'blog_auto 스케줄 없음' }, { status: 404 });
  try {
    return NextResponse.json({ ok: true, ...(await runBlogAuto(schedule as Schedule, { keyword, rawOutput: raw })) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
