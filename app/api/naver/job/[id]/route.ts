import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data: job, error } = await supabase
    .from('naver_publish_jobs')
    .select('id, status, post_id, post_url, error_message, created_at, completed_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !job) return NextResponse.json({ error: '작업을 찾을 수 없습니다' }, { status: 404 });

  return NextResponse.json(job);
}
