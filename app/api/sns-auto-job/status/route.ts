import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');
  const siteId = searchParams.get('site_id');

  const admin = createAdminClient();

  // 단일 작업 조회
  if (jobId) {
    const { data: job } = await admin.from('bossai_sns_auto_jobs')
      .select('*').eq('id', jobId).eq('user_id', user.id).maybeSingle();
    if (!job) return NextResponse.json({ job: null, logs: [] });
    const { data: logs } = await admin.from('bossai_sns_auto_job_logs')
      .select('*').eq('job_id', job.id).order('created_at', { ascending: false }).limit(30);
    return NextResponse.json({ job, logs: logs || [] });
  }

  // 사이트의 모든 실행 중인 작업 조회
  if (siteId) {
    const { data: jobs } = await admin.from('bossai_sns_auto_jobs')
      .select('*')
      .eq('user_id', user.id)
      .eq('site_id', siteId)
      .in('status', ['running', 'completed', 'stopped'])
      .order('created_at', { ascending: false })
      .limit(5);

    if (!jobs?.length) return NextResponse.json({ jobs: [], logsByJob: {} });

    const logsByJob: Record<string, unknown[]> = {};
    for (const job of jobs) {
      const { data: logs } = await admin.from('bossai_sns_auto_job_logs')
        .select('*').eq('job_id', job.id).order('created_at', { ascending: false }).limit(50);
      logsByJob[job.id] = logs || [];
    }
    return NextResponse.json({ jobs, logsByJob });
  }

  return NextResponse.json({ jobs: [], logsByJob: {} });
}
