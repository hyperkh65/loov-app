import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import {
  replyToTwitterComment,
  replyToFacebookComment,
  replyToInstagramComment,
} from '@/lib/sns/platforms-server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { platform, post_id, comment_id, content, media_urls } = await req.json();

  if (!platform || !post_id || !content?.trim())
    return NextResponse.json({ error: '필수 값이 없습니다 (platform, post_id, content)' }, { status: 400 });

  const { data: conn } = await supabase
    .from('sns_connections')
    .select('access_token, platform_user_id')
    .eq('user_id', user.id)
    .eq('platform', platform)
    .eq('is_active', true)
    .single();

  if (!conn) return NextResponse.json({ error: '연결되지 않은 플랫폼' }, { status: 400 });

  try {
    let result: { id: string };
    if (platform === 'twitter') {
      result = await replyToTwitterComment(conn.access_token, post_id, content, media_urls);
    } else if (platform === 'facebook') {
      result = await replyToFacebookComment(conn.access_token, comment_id || post_id, content);
    } else if (platform === 'instagram') {
      if (!comment_id) return NextResponse.json({ error: 'Instagram 답글에는 comment_id가 필요합니다' }, { status: 400 });
      result = await replyToInstagramComment(conn.access_token, post_id, comment_id, content);
    } else {
      return NextResponse.json({ error: '해당 플랫폼은 댓글 기능을 지원하지 않습니다' }, { status: 400 });
    }
    return NextResponse.json({ success: true, id: result.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
