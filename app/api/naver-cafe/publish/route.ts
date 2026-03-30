import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 30;

async function refreshToken(token: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const res = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.NAVER_CLIENT_ID!,
        client_secret: process.env.NAVER_CLIENT_SECRET!,
        refresh_token: token,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token?: string; expires_in?: number };
    return data.access_token ? { access_token: data.access_token, expires_in: data.expires_in || 3600 } : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as {
    title: string;
    content: string;
    menu_id?: string;
    open_yn?: string;
    cover_image_url?: string;
  };
  const { title, content, menu_id, open_yn = 'Y', cover_image_url } = body;
  if (!title || !content) return NextResponse.json({ error: '제목과 내용 필요' }, { status: 400 });

  const { data: conn } = await supabase.from('naver_cafe_connections')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!conn) return NextResponse.json({ error: '카페 연결 필요' }, { status: 400 });
  if (!conn.club_id) return NextResponse.json({ error: '카페 ID 미설정' }, { status: 400 });

  let accessToken: string = conn.access_token;

  // 토큰 만료 체크 및 갱신
  if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date(Date.now() + 60_000)) {
    if (conn.refresh_token) {
      const refreshed = await refreshToken(conn.refresh_token);
      if (refreshed) {
        accessToken = refreshed.access_token;
        await supabase.from('naver_cafe_connections').update({
          access_token: refreshed.access_token,
          token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);
      }
    }
  }

  if (!accessToken) return NextResponse.json({ error: 'OAuth 토큰 없음. 재연결 필요' }, { status: 400 });

  const targetMenuId = menu_id || (conn.menu_list as { menuId: number }[] | null)?.[0]?.menuId;
  if (!targetMenuId) return NextResponse.json({ error: '게시판을 선택하거나 설정에서 게시판을 추가하세요' }, { status: 400 });

  // 커버 이미지를 content 맨 앞에 <img> 태그로 삽입
  let finalContent = content;
  if (cover_image_url) {
    finalContent = `<img src="${cover_image_url}" style="max-width:100%;margin-bottom:16px;" />\n` + content;
  }

  // FormData로 전송 (네이버 카페 API 스펙)
  // 각 필드를 Blob으로 명시해서 UTF-8 인코딩 보장
  const form = new FormData();
  form.append('subject', new Blob([title], { type: 'text/plain; charset=utf-8' }), '');
  form.append('content', new Blob([finalContent], { type: 'text/html; charset=utf-8' }), '');
  form.append('openYn', open_yn);

  const apiUrl = `https://openapi.naver.com/v1/cafe/${conn.club_id}/menu/${targetMenuId}/articles`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  const rawText = await res.text();
  let resData: { message?: { result?: { articleId?: number } }; errorCode?: string; errorMessage?: string } = {};
  try { resData = JSON.parse(rawText); } catch {}

  if (!res.ok || resData.errorCode) {
    const errMsg = resData.errorMessage || `HTTP ${res.status}: ${rawText.slice(0, 200)}`;
    return NextResponse.json({ error: `카페 발행 실패: ${errMsg}` }, { status: 400 });
  }

  const articleId = resData.message?.result?.articleId;
  const cafeSlug = conn.cafe_url || conn.club_id;
  const articleUrl = articleId
    ? `https://cafe.naver.com/${cafeSlug}/articles/${articleId}`
    : undefined;

  const menuItem = conn.menu_list && menu_id
    ? (conn.menu_list as { menuId: number; menuName: string }[]).find(
        (m) => String(m.menuId) === String(menu_id)
      )
    : null;

  try {
    await supabase.from('naver_cafe_history').insert({
      user_id: user.id,
      club_id: conn.club_id,
      article_id: articleId ? String(articleId) : null,
      article_url: articleUrl || null,
      title,
      menu_id: menu_id ? String(menu_id) : null,
      menu_name: menuItem?.menuName || null,
      open_yn,
    });
  } catch {}

  return NextResponse.json({ ok: true, article_id: articleId, url: articleUrl });
}
