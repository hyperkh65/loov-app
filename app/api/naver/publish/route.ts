export const runtime = 'edge';
export const preferredRegion = ['icn1', 'hnd1'];

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToNaverBlog, postToNaverBlogOAuth, refreshNaverToken, sanitizeForNaver } from '@/lib/naver-blog';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const {
    title, content, tags = [], categoryNo = 0,
    status = 'publish', notionPageId = '',
  } = await req.json() as {
    title: string; content: string; tags: string[];
    categoryNo: number; status: string; notionPageId: string;
  };

  if (!title?.trim()) return NextResponse.json({ error: '제목이 필요합니다' }, { status: 400 });
  if (!content?.trim()) return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 });

  // 연결 정보 조회 (OAuth 토큰 포함)
  const { data: conn } = await supabase
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses, access_token, refresh_token, token_expires_at')
    .eq('user_id', user.id)
    .single();

  if (!conn?.blog_id) {
    return NextResponse.json({ error: '네이버 블로그 연결 정보가 없습니다. 설정 탭에서 먼저 연결해주세요.' }, { status: 400 });
  }

  const cleanContent = sanitizeForNaver(content);

  // ── OAuth 우선 시도 ────────────────────────────────────────────────────────
  let accessToken = conn.access_token || '';
  const tokenExpiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : new Date(0);

  if (accessToken) {
    // 만료된 경우 갱신 시도
    if (tokenExpiresAt <= new Date() && conn.refresh_token) {
      const refreshed = await refreshNaverToken(conn.refresh_token);
      if (refreshed.accessToken) {
        accessToken = refreshed.accessToken;
        await supabase.from('naver_connections').update({
          access_token: refreshed.accessToken,
          token_expires_at: refreshed.expiresAt,
        }).eq('user_id', user.id);
      } else {
        accessToken = ''; // 갱신 실패 → 쿠키로 폴백
      }
    }
  }

  let result;
  if (accessToken) {
    // OAuth API 사용 (IP 무관)
    result = await postToNaverBlogOAuth({
      accessToken,
      blogId: conn.blog_id,
      title: title.trim(),
      content: cleanContent,
      tags,
      categoryNo,
      isPublish: status === 'publish',
    });

    // OAuth 토큰 만료 → 재연결 필요
    if (result.errorCode === 'AUTH') {
      await supabase.from('naver_connections').update({
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
      }).eq('user_id', user.id);
      return NextResponse.json({
        error: 'OAuth 토큰이 만료되었습니다. 설정 탭에서 네이버 재연결을 해주세요.',
        errorCode: 'AUTH',
      }, { status: 401 });
    }
  } else {
    // 쿠키 폴백 (IP 차단으로 실패할 가능성 높음)
    if (!conn.nid_aut || !conn.nid_ses) {
      return NextResponse.json({
        error: '네이버 OAuth 연결 또는 쿠키(NID_AUT, NID_SES)가 필요합니다. 설정 탭에서 OAuth로 연결해주세요.',
        errorCode: 'AUTH',
      }, { status: 400 });
    }
    result = await postToNaverBlog({
      blogId: conn.blog_id,
      nidAut: conn.nid_aut,
      nidSes: conn.nid_ses,
      title: title.trim(),
      content: cleanContent,
      tags,
      categoryNo,
      isPublish: status === 'publish',
    });
  }

  if (result.error && !result.postId) {
    const httpStatus = result.errorCode === 'AUTH' ? 401 : 500;
    return NextResponse.json({ error: result.error, errorCode: result.errorCode }, { status: httpStatus });
  }

  // 발행 히스토리 저장
  await supabase.from('naver_publish_history').insert({
    user_id: user.id,
    blog_id: conn.blog_id,
    post_id: result.postId || '',
    post_url: result.postUrl || '',
    title: title.trim(),
    notion_page_id: notionPageId,
    status,
  });

  return NextResponse.json({ postId: result.postId, postUrl: result.postUrl });
}
