import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const {
    site_id, sns_platforms, sns_connection_configs, use_ai, post_order,
    page_from, page_to, interval_seconds, threads_interval_seconds,
  } = await req.json();

  if (!site_id || !sns_platforms?.length) {
    return NextResponse.json({ error: '사이트와 SNS 계정을 선택해주세요' }, { status: 400 });
  }

  const admin = createAdminClient();

  // 실행 중인 작업 수 확인 (최대 3개)
  const { count } = await admin.from('bossai_sns_auto_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'running');

  if ((count || 0) >= 3) {
    return NextResponse.json({ error: '최대 3개 작업까지 동시 실행 가능합니다. 기존 작업을 중지하세요.' }, { status: 400 });
  }

  const { data: job, error } = await admin.from('bossai_sns_auto_jobs').insert({
    user_id: user.id,
    site_id,
    sns_platforms: sns_platforms || [],
    sns_connection_configs: sns_connection_configs || [],
    use_ai: use_ai ?? true,
    post_order: post_order || 'desc',
    page_from: page_from || 1,
    page_to: page_to || 1,
    current_page: page_from || 1,
    current_post_index: 0,
    interval_seconds: interval_seconds || 60,
    threads_interval_seconds: threads_interval_seconds || null,
    status: 'running',
    total_done: 0,
    total_success: 0,
    total_failed: 0,
    next_run_at: new Date().toISOString(),
    locked_until: new Date(Date.now() - 1000).toISOString(),
    threads_next_run_at: new Date(Date.now() - 1000).toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job_id: job.id });
}
