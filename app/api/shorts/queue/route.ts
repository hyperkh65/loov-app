import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase
    .from('bossai_shorts_queue')
    .select('id, title, status, progress, video_url, yt_url, error_message, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ jobs: data || [] });
}

// 작업 취소/삭제
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { id, all } = await req.json() as { id?: string; all?: boolean };

  if (all) {
    // 모든 완료/오류/대기 작업 삭제
    await supabase
      .from('bossai_shorts_queue')
      .delete()
      .eq('user_id', user.id)
      .in('status', ['done', 'error', 'pending', 'running']);
  } else if (id) {
    await supabase
      .from('bossai_shorts_queue')
      .delete()
      .eq('user_id', user.id)
      .eq('id', id);
  } else {
    return NextResponse.json({ error: 'id 또는 all 필요' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
