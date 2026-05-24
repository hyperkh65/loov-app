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

  let query = admin.from('bossai_sns_auto_jobs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (jobId) query = query.eq('id', jobId);
  else if (siteId) query = query.eq('site_id', siteId);

  const { data: job } = await query.maybeSingle();
  if (!job) return NextResponse.json({ job: null, logs: [] });

  const { data: logs } = await admin.from('bossai_sns_auto_job_logs')
    .select('*')
    .eq('job_id', job.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ job, logs: logs || [] });
}
