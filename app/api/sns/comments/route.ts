import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import {
  fetchCommentsFromTwitter,
  fetchCommentsFromFacebook,
  fetchCommentsFromInstagram,
} from '@/lib/sns/platforms-server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const platform = searchParams.get('platform');
  const postId = searchParams.get('post_id');

  if (!platform || !postId)
    return NextResponse.json({ error: 'platform과 post_id가 필요합니다' }, { status: 400 });

  const { data: conn } = await supabase
    .from('sns_connections')
    .select('access_token, platform_user_id')
    .eq('user_id', user.id)
    .eq('platform', platform)
    .eq('is_active', true)
    .single();

  if (!conn) return NextResponse.json({ error: '연결되지 않은 플랫폼' }, { status: 400 });

  try {
    let comments: Awaited<ReturnType<typeof fetchCommentsFromTwitter>> = [];
    if (platform === 'twitter') {
      comments = await fetchCommentsFromTwitter(conn.access_token, postId);
    } else if (platform === 'facebook') {
      comments = await fetchCommentsFromFacebook(conn.access_token, postId);
    } else if (platform === 'instagram') {
      comments = await fetchCommentsFromInstagram(conn.access_token, postId);
    } else {
      return NextResponse.json({ comments: [], note: '해당 플랫폼은 댓글 조회를 지원하지 않습니다' });
    }
    return NextResponse.json({ comments });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
