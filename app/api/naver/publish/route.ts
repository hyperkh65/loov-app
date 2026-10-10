import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToNaverBlog, postToNaverBlogOAuth, refreshNaverToken, sanitizeForNaver } from '@/lib/naver-blog';
import { postViaNas } from '@/lib/naver-nas-publish';

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

  const { data: conn } = await supabase
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses, access_token, refresh_token, token_expires_at, upload_session_key, naver_user_id')
    .eq('user_id', user.id)
    .single();

  if (!conn?.blog_id) {
    return NextResponse.json({ error: '네이버 블로그 연결 정보가 없습니다. 설정 탭에서 먼저 연결해주세요.' }, { status: 400 });
  }

  const cleanContent = sanitizeForNaver(content);
  const isPublish = status === 'publish';

  // ── 1순위: NAS 경유 발행 (쿠키 기반, 가정용 IP라 차단 없음) ─────────────────
  if (conn.nid_aut && conn.nid_ses) {
    const nasResult = await postViaNas({
      blogId: conn.blog_id,
      nidAut: conn.nid_aut,
      nidSes: conn.nid_ses,
      title: title.trim(),
      content: cleanContent,
      tags,
      categoryNo,
      isPublish,
      uploadSessionKey: conn.upload_session_key || '',
      naverUserId: conn.naver_user_id || '',
    });

    if (nasResult.errorCode === 'AUTH') {
      return NextResponse.json({
        error: '네이버 쿠키가 만료되었습니다. 설정 탭에서 NID_AUT / NID_SES를 다시 입력해주세요.',
        errorCode: 'AUTH',
      }, { status: 401 });
    }

    if (nasResult.postId || nasResult.postUrl) {
      await supabase.from('naver_publish_history').insert({
        user_id: user.id,
        blog_id: conn.blog_id,
        post_id: nasResult.postId || '',
        post_url: nasResult.postUrl || '',
        title: title.trim(),
        notion_page_id: notionPageId,
        status,
      });
      return NextResponse.json({ postId: nasResult.postId, postUrl: nasResult.postUrl, imgErrors: nasResult.imgErrors });
    }
    // parse fail 등 알려진 에러는 폴백 없이 반환 (OAuth/직접쿠키는 이미지 미지원)
    // SSH 연결 실패(UNKNOWN)만 폴백 허용
    if (nasResult.error && nasResult.errorCode && nasResult.errorCode !== 'UNKNOWN') {
      if (nasResult._debug) console.error('[NaverPublish Debug]', nasResult._debug);
      const debugHint = nasResult._debug ? '\n[Debug] ' + (nasResult._debug as string).slice(0, 800) : '';
      return NextResponse.json({ error: nasResult.error + debugHint, errorCode: nasResult.errorCode, imgErrors: nasResult.imgErrors }, { status: 500 });
    }
    console.warn('[Naver] NAS SSH error, falling back:', nasResult.error);
  }

  // ── 2순위: OAuth API (IP 무관하지만 권한 제한 있음) ──────────────────────────
  let accessToken = conn.access_token || '';
  const tokenExpiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : new Date(0);

  if (accessToken) {
    if (tokenExpiresAt <= new Date() && conn.refresh_token) {
      const refreshed = await refreshNaverToken(conn.refresh_token);
      if (refreshed.accessToken) {
        accessToken = refreshed.accessToken;
        await supabase.from('naver_connections').update({
          access_token: refreshed.accessToken,
          token_expires_at: refreshed.expiresAt,
        }).eq('user_id', user.id);
      } else {
        accessToken = '';
      }
    }
  }

  if (accessToken) {
    const result = await postToNaverBlogOAuth({
      accessToken,
      blogId: conn.blog_id,
      title: title.trim(),
      content: cleanContent,
      tags,
      categoryNo,
      isPublish,
    });

    if (result.errorCode === 'AUTH') {
      await supabase.from('naver_connections').update({
        access_token: null, refresh_token: null, token_expires_at: null,
      }).eq('user_id', user.id);
      return NextResponse.json({
        error: 'OAuth 토큰이 만료되었습니다. 설정 탭에서 네이버 재연결을 해주세요.',
        errorCode: 'AUTH',
      }, { status: 401 });
    }

    if (result.postId || result.postUrl) {
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
  }

  // ── 3순위: 직접 쿠키 (서버 IP 차단 가능성 있지만 최후 시도) ─────────────────
  if (conn.nid_aut && conn.nid_ses) {
    const result = await postToNaverBlog({
      blogId: conn.blog_id,
      nidAut: conn.nid_aut,
      nidSes: conn.nid_ses,
      title: title.trim(),
      content: cleanContent,
      tags,
      categoryNo,
      isPublish,
    });

    if (result.postId || result.postUrl) {
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

    if (result.errorCode === 'AUTH') {
      return NextResponse.json({ error: result.error, errorCode: result.errorCode }, { status: 401 });
    }

    return NextResponse.json({ error: result.error, errorCode: result.errorCode }, { status: 500 });
  }

  return NextResponse.json({
    error: '발행 방법 없음: NID_AUT/NID_SES 쿠키 또는 OAuth 토큰이 필요합니다.',
    errorCode: 'AUTH',
  }, { status: 400 });
}
