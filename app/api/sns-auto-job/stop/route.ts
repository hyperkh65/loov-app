import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { job_id } = await req.json();
  if (!job_id) return NextResponse.json({ error: 'job_id 필요' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('bossai_sns_auto_jobs')
    .update({ status: 'stopped', updated_at: new Date().toISOString() })
    .eq('id', job_id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
