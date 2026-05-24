import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { site_id, sns_platforms, use_ai, post_order, page_from, page_to, interval_seconds } = await req.json();

  if (!site_id || !sns_platforms?.length) {
    return NextResponse.json({ error: '사이트와 SNS 계정을 선택해주세요' }, { status: 400 });
  }

  const admin = createAdminClient();

  // 기존 실행 중인 작업 중지
  await admin.from('bossai_sns_auto_jobs')
    .update({ status: 'stopped', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('site_id', site_id)
    .eq('status', 'running');

  const { data: job, error } = await admin.from('bossai_sns_auto_jobs').insert({
    user_id: user.id,
    site_id,
    sns_platforms,
    use_ai: use_ai ?? true,
    post_order: post_order || 'desc',
    page_from: page_from || 1,
    page_to: page_to || 1,
    current_page: page_from || 1,
    current_post_index: 0,
    interval_seconds: interval_seconds || 60,
    status: 'running',
    total_done: 0,
    total_success: 0,
    total_failed: 0,
    next_run_at: new Date().toISOString(),
    locked_until: new Date(Date.now() - 1000).toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job_id: job.id });
}
