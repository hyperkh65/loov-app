import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import iconv from 'iconv-lite';

// 멀티파트 바디를 CP949 raw bytes로 직접 구성
// 서버가 multipart raw bytes를 CP949로 읽음이 확인됨 (UTF-8 multipart → 蹂좎괶◆)
// per-part charset 지정 없이 CP949 bytes 삽입 → 서버가 CP949로 정상 해석
function buildMultipartCp949(params: [string, string][], boundary: string): Blob {
  const parts: Buffer[] = [];
  for (const [key, value] of params) {
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n`,
      'ascii'
    );
    const encoded = key === 'openYn'
      ? Buffer.from(value, 'ascii')
      : iconv.encode(value, 'CP949');
    parts.push(header, encoded, Buffer.from('\r\n', 'ascii'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'ascii'));
  return new Blob([Buffer.concat(parts)], { type: `multipart/form-data; boundary=${boundary}` });
}

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

async function uploadImageToNaverCafe(
  imageUrl: string,
  clubId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imgRes.ok) return null;
    const imgBuf = await imgRes.arrayBuffer();
    const ct = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'jpg';
    const form = new FormData();
    form.append('image', new Blob([imgBuf], { type: ct }), `image.${ext}`);
    const uploadRes = await fetch(`https://openapi.naver.com/v1/cafe/${clubId}/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!uploadRes.ok) return null;
    const data = await uploadRes.json() as { message?: { result?: { imageUrl?: string } } };
    return data.message?.result?.imageUrl || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const reqBody = await req.json() as {
    title: string;
    content: string;
    menu_id?: string;
    open_yn?: string;
    cover_image_url?: string;
    blog_url?: string;
  };
  const { title, content, menu_id, open_yn = 'Y', cover_image_url, blog_url } = reqBody;
  if (!title || !content) return NextResponse.json({ error: '제목과 내용 필요' }, { status: 400 });

  const { data: conn } = await supabase.from('naver_cafe_connections')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!conn) return NextResponse.json({ error: '카페 연결 필요' }, { status: 400 });
  if (!conn.club_id) return NextResponse.json({ error: '카페 ID 미설정' }, { status: 400 });

  let accessToken: string = conn.access_token;

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

  // 이미지 업로드
  let naverImageUrl: string | null = null;
  if (cover_image_url) {
    naverImageUrl = await uploadImageToNaverCafe(cover_image_url, String(conn.club_id), accessToken);
  }

  // HTML → plain text
  const stripped = content
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
    .replace(/<h[1-3][^>]*>/gi, '\n').replace(/<\/h[1-3]>/gi, '\n')
    .replace(/<li>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();

  const excerpt = stripped.slice(0, 400) + (stripped.length > 400 ? '...' : '');
  const linkLine = blog_url ? `\n\n[원문 보기] ${blog_url}` : '';
  let textContent = excerpt + linkLine;
  if (naverImageUrl) textContent = `<img src="${naverImageUrl}"><br><br>${textContent}`;

  const apiUrl = `https://openapi.naver.com/v1/cafe/${conn.club_id}/menu/${targetMenuId}/articles`;
  const boundary = `----NaverCafeBoundary${Date.now()}`;
  const multipartBlob = buildMultipartCp949([
    ['subject', title],
    ['content', textContent],
    ['openYn', open_yn],
  ], boundary);
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: multipartBlob,
  });

  const rawText = await res.text();
  let resData: { message?: { result?: { articleId?: number } }; errorCode?: string; errorMessage?: string } = {};
  try { resData = JSON.parse(rawText); } catch {}

  if (!res.ok || resData.errorCode) {
    const errMsg = `HTTP ${res.status} | errorCode: ${resData.errorCode || 'none'} | ${resData.errorMessage || rawText.slice(0, 300)}`;
    return NextResponse.json({ error: `카페 발행 실패: ${errMsg}` }, { status: 400 });
  }

  const articleId = resData.message?.result?.articleId;
  const cafeSlug = conn.cafe_url || conn.club_id;
  const articleUrl = articleId ? `https://cafe.naver.com/${cafeSlug}/articles/${articleId}` : undefined;

  const menuItem = conn.menu_list && menu_id
    ? (conn.menu_list as { menuId: number; menuName: string }[]).find(m => String(m.menuId) === String(menu_id))
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
