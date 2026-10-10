// Server-to-server Naver blog publish endpoint for auto-run cron jobs.
// Requires Authorization: Bearer <CRON_SECRET>.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { postToNaverBlog, postToNaverBlogOAuth, refreshNaverToken, sanitizeForNaver } from '@/lib/naver-blog';

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    user_id, title, content, tags = [], categoryNo = 0, status = 'publish',
  } = await req.json() as {
    user_id: string;
    title: string;
    content: string;
    tags?: string[];
    categoryNo?: number;
    status?: string;
  };

  if (!user_id) return NextResponse.json({ error: 'user_id 필요' }, { status: 400 });
  if (!title?.trim()) return NextResponse.json({ error: '제목이 필요합니다' }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 });

  const adminSb = createAdminClient();

  const { data: conn } = await adminSb
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses, access_token, refresh_token, token_expires_at')
    .eq('user_id', user_id)
    .single();

  if (!conn?.blog_id) {
    return NextResponse.json({ error: '네이버 블로그 연결 정보가 없습니다' }, { status: 400 });
  }

  const cleanContent = sanitizeForNaver(content);
  let accessToken = conn.access_token || '';
  const tokenExpiresAt = conn.token_expires_at ? new Date(conn.token_expires_at as string) : new Date(0);

  if (accessToken && tokenExpiresAt <= new Date() && conn.refresh_token) {
    const refreshed = await refreshNaverToken(conn.refresh_token as string);
    if (refreshed.accessToken) {
      accessToken = refreshed.accessToken;
      await adminSb.from('naver_connections').update({
        access_token: refreshed.accessToken,
        token_expires_at: refreshed.expiresAt,
      }).eq('user_id', user_id);
    } else {
      accessToken = '';
    }
  }

  let result: import('@/lib/naver-blog').NaverPostResult;
  if (accessToken) {
    result = await postToNaverBlogOAuth({
      accessToken,
      blogId: conn.blog_id as string,
      title: title.trim(),
      content: cleanContent,
      tags,
      categoryNo,
      isPublish: status === 'publish',
    });
    if (result.errorCode === 'AUTH') {
      await adminSb.from('naver_connections').update({
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
      }).eq('user_id', user_id);
      return NextResponse.json(
        { error: 'OAuth 토큰 만료. 네이버 재연결 필요', errorCode: 'AUTH' },
        { status: 401 },
      );
    }
  } else {
    if (!conn.nid_aut || !conn.nid_ses) {
      return NextResponse.json(
        { error: '네이버 OAuth 또는 쿠키(NID_AUT, NID_SES) 필요', errorCode: 'AUTH' },
        { status: 400 },
      );
    }
    result = await postToNaverBlog({
      blogId: conn.blog_id as string,
      nidAut: conn.nid_aut as string,
      nidSes: conn.nid_ses as string,
      title: title.trim(),
      content: cleanContent,
      tags,
      categoryNo,
      isPublish: status === 'publish',
    });
  }

  if (result.error) {
    return NextResponse.json({ error: result.error || '발행 실패' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: result.postUrl, postNo: result.postId });
}
