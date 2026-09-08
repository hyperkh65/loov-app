/**
 * 네이버 카페 발행 공용 로직. app/api/naver-cafe/publish(세션 사용자용 HTTP 엔드포인트)와
 * lib/rewrite-publish.ts(자동화 파이프라인, admin 클라이언트 + 고정 userId)가 공유한다.
 */
import { createAdminClient } from '@/lib/supabase-server';

type AdminClient = ReturnType<typeof createAdminClient>;

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
      signal: AbortSignal.timeout(15_000),
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

function htmlToPlainText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
    .replace(/<h[1-3][^>]*>/gi, '\n').replace(/<\/h[1-3]>/gi, '\n')
    .replace(/<li>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
}

export interface NaverCafePublishParams {
  userId: string;
  title: string;
  content: string; // HTML 또는 평문 — 내부에서 평문으로 변환
  menuId?: string | number;
  openYn?: 'Y' | 'N';
  blogUrl?: string; // 있으면 "원문 보기" 링크로 덧붙임
}

export async function publishToNaverCafe(
  admin: AdminClient,
  params: NaverCafePublishParams,
): Promise<{ articleUrl: string | null }> {
  const { userId, title, content, blogUrl, openYn = 'Y' } = params;

  const { data: conn } = await admin.from('naver_cafe_connections')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (!conn) throw new Error('네이버 카페 연결 필요');
  if (!conn.club_id) throw new Error('카페 ID 미설정');

  let accessToken: string = conn.access_token;
  const needsRefresh = !conn.token_expires_at || new Date(conn.token_expires_at) < new Date(Date.now() + 60_000);
  if (needsRefresh) {
    if (!conn.refresh_token) throw new Error('네이버 카페 재연결 필요 (refresh token 없음)');
    const refreshed = await refreshNaverToken(conn.refresh_token);
    if (!refreshed) throw new Error('네이버 카페 토큰 갱신 실패 — 설정에서 재연결해주세요.');
    accessToken = refreshed.access_token;
    const payload: Record<string, string> = {
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (refreshed.refresh_token) payload.refresh_token = refreshed.refresh_token;
    await admin.from('naver_cafe_connections').update(payload).eq('user_id', userId);
  }

  const targetMenuId = params.menuId || (conn.menu_list as { menuId: number }[] | null)?.[0]?.menuId;
  if (!targetMenuId) throw new Error('게시판을 선택하거나 설정에서 게시판을 추가하세요');

  const stripped = htmlToPlainText(content);
  const excerpt = stripped.slice(0, 400) + (stripped.length > 400 ? '...' : '');
  const linkLine = blogUrl ? `\n\n▶ 원문 보기: ${blogUrl}` : '';
  const textContent = excerpt + linkLine;

  const apiUrl = `https://openapi.naver.com/v1/cafe/${conn.club_id}/menu/${targetMenuId}/articles`;

  // 네이버 카페 글쓰기 API는 multipart(FormData)로 보내면 한글이 깨짐(실사용 중 확인:
  // 자동발행 글만 깨지고 수동 발행은 멀쩡했음) — 커뮤니티에서 확인된 이 엔드포인트 특유의
  // 해결법대로 x-www-form-urlencoded + 값을 한 번 더 encodeURIComponent(이중 인코딩)해야
  // 정상 표시됨. URLSearchParams가 직렬화하면서 인코딩을 한 번 더 걸어줌.
  const body = new URLSearchParams({
    subject: encodeURIComponent(title),
    content: encodeURIComponent(textContent),
    openYn,
  });

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
    signal: AbortSignal.timeout(20_000),
  });

  const rawText = await res.text();
  let resData: { message?: { result?: { articleId?: number; code?: string; message?: string } }; errorCode?: string; errorMessage?: string } = {};
  try { resData = JSON.parse(rawText); } catch { /* non-JSON error body */ }

  const errCode = resData.errorCode || resData.message?.result?.code;
  const errDetail = resData.errorMessage || resData.message?.result?.message;
  if (!res.ok || errCode) {
    throw new Error(`카페 발행 실패: HTTP ${res.status}${errCode ? ` | ${errCode}` : ''}${errDetail ? ` | ${errDetail}` : ` | ${rawText.slice(0, 300)}`}`);
  }

  const articleId = resData.message?.result?.articleId;
  const cafeSlug = conn.cafe_url || conn.club_id;
  const articleUrl = articleId ? `https://cafe.naver.com/${cafeSlug}/articles/${articleId}` : null;

  const menuItem = (conn.menu_list as { menuId: number; menuName: string }[] | null)
    ?.find(m => String(m.menuId) === String(targetMenuId));

  try {
    await admin.from('naver_cafe_history').insert({
      user_id: userId,
      club_id: conn.club_id,
      article_id: articleId ? String(articleId) : null,
      article_url: articleUrl,
      title,
      menu_id: targetMenuId ? String(targetMenuId) : null,
      menu_name: menuItem?.menuName || null,
      open_yn: openYn,
    });
  } catch { /* 기록 실패는 무시 — 발행 자체는 이미 성공 */ }

  return { articleUrl };
}
