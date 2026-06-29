import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// 한글을 HTML 엔티티(&#44032;)로 인코딩 → ASCII → Naver API 수용 + 상세보기에서 한글 렌더링
function toHtmlEntities(text: string): string {
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? char.charCodeAt(0);
    if (code > 0x7E) {
      result += `&#${code};`;
    } else {
      result += char;
    }
  }
  return result;
}

export const maxDuration = 30;

async function refreshNaverToken(token: string): Promise<{ access_token: string; expires_in: number; refresh_token?: string } | null> {
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
    const data = await res.json() as { access_token?: string; expires_in?: number; refresh_token?: string };
    return data.access_token ? {
      access_token: data.access_token,
      expires_in: data.expires_in || 3600,
      refresh_token: data.refresh_token,
    } : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, content, menu_id, open_yn = 'Y', blog_url } = await req.json() as {
    title: string;
    content: string;
    menu_id?: string;
    open_yn?: string;
    cover_image_url?: string;
    blog_url?: string;
  };
  if (!title || !content) return NextResponse.json({ error: '제목과 내용 필요' }, { status: 400 });

  const { data: conn } = await supabase.from('naver_cafe_connections')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!conn) return NextResponse.json({ error: '카페 연결 필요' }, { status: 400 });
  if (!conn.club_id) return NextResponse.json({ error: '카페 ID 미설정' }, { status: 400 });

  let accessToken: string = conn.access_token;

  const needsRefresh = !conn.token_expires_at || new Date(conn.token_expires_at) < new Date(Date.now() + 60_000);
  if (needsRefresh) {
    if (!conn.refresh_token) {
      return NextResponse.json({ error: '네이버 카페 재연결 필요 (refresh token 없음)' }, { status: 401 });
    }
    const refreshed = await refreshNaverToken(conn.refresh_token);
    if (!refreshed) {
      return NextResponse.json({ error: '네이버 카페 토큰 갱신 실패 — 설정에서 재연결해주세요.' }, { status: 401 });
    }
    accessToken = refreshed.access_token;
    const payload: Record<string, string> = {
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (refreshed.refresh_token) payload.refresh_token = refreshed.refresh_token;
    await supabase.from('naver_cafe_connections').update(payload).eq('user_id', user.id);
  }

  const targetMenuId = menu_id || (conn.menu_list as { menuId: number }[] | null)?.[0]?.menuId;
  if (!targetMenuId) return NextResponse.json({ error: '게시판을 선택하거나 설정에서 게시판을 추가하세요' }, { status: 400 });

  // HTML → plain text
  const stripped = content
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
    .replace(/<h[1-3][^>]*>/gi, '\n').replace(/<\/h[1-3]>/gi, '\n')
    .replace(/<li>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();

  const excerpt = stripped.slice(0, 400) + (stripped.length > 400 ? '...' : '');
  const linkLine = blog_url ? `\n\n▶ 원문 보기: ${blog_url}` : '';
  const textContent = excerpt + linkLine;

  const apiUrl = `https://openapi.naver.com/v1/cafe/${conn.club_id}/menu/${targetMenuId}/articles`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams([
      ['subject', toHtmlEntities(title)],
      ['content', toHtmlEntities(textContent)],
      ['openYn', open_yn],
    ]),
  });

  const rawText = await res.text();
  let resData: { message?: { result?: { articleId?: number; code?: string; message?: string } }; errorCode?: string; errorMessage?: string } = {};
  try { resData = JSON.parse(rawText); } catch {}

  if (!res.ok || resData.errorCode) {
    const errCode = resData.errorCode || resData.message?.result?.code || 'none';
    const errDetail = resData.errorMessage || resData.message?.result?.message || rawText.slice(0, 500);
    return NextResponse.json({ error: `카페 발행 실패: HTTP ${res.status} | ${errCode} | ${errDetail}` }, { status: 400 });
  }

  const articleId = resData.message?.result?.articleId;
  const cafeSlug = conn.cafe_url || conn.club_id;
  const articleUrl = articleId ? `https://cafe.naver.com/${cafeSlug}/articles/${articleId}` : undefined;

  const menuItem = (conn.menu_list as { menuId: number; menuName: string }[] | null)
    ?.find(m => String(m.menuId) === String(menu_id));

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
