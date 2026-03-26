import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, content, category = '' } = await req.json() as {
    title: string;
    content: string;
    category?: string;
  };

  if (!title?.trim()) return NextResponse.json({ error: '제목 필요' }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: '내용 필요' }, { status: 400 });

  const { data: conn } = await supabase
    .from('ameba_connections')
    .select('blog_id')
    .eq('user_id', user.id)
    .single();

  if (!conn) {
    return NextResponse.json(
      { error: '아메바 연결 정보 없음. 설정 탭에서 먼저 연결해주세요.' },
      { status: 400 }
    );
  }

  const { data: job, error } = await supabase
    .from('ameba_publish_queue')
    .insert({
      user_id: user.id,
      blog_id: conn.blog_id,
      title,
      content,
      category,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Poll for up to 50s
  const jobId = job.id as string;
  const deadline = Date.now() + 50000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const { data: updated } = await supabase
      .from('ameba_publish_queue')
      .select('status, result_url, error')
      .eq('id', jobId)
      .single();

    if (updated?.status === 'done') {
      // Move to history
      await supabase.from('ameba_publish_history').insert({
        user_id: user.id,
        blog_id: conn.blog_id,
        title,
        post_url: updated.result_url,
        status: 'success',
      });
      return NextResponse.json({ ok: true, postUrl: updated.result_url });
    }
    if (updated?.status === 'error') {
      return NextResponse.json({ error: updated.error || '발행 실패' }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    pending: true,
    jobId,
    message: '에이전트가 백그라운드에서 처리 중입니다.',
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('job_id');

  if (jobId) {
    const { data } = await supabase
      .from('ameba_publish_queue')
      .select('status, result_url, error')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();
    return NextResponse.json(data || { status: 'not_found' });
  }

  return NextResponse.json({ error: 'job_id 필요' }, { status: 400 });
}
