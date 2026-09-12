/**
 * WordPress.com(무료 위성 블로그) 발행 — OAuth2 기반. Blogger/네이버 카페와 같은
 * "백링크용 위성 블로그" 역할: 요약 + 원문 링크만 올려서 실제 사이트로 유입을 유도.
 */
import { getSetting, invalidateSettingsCache } from '@/lib/get-setting';
import { createAdminClient } from '@/lib/supabase-server';

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string } | null> {
  try {
    const clientId = await getSetting('WORDPRESS_COM_CLIENT_ID');
    const clientSecret = await getSetting('WORDPRESS_COM_CLIENT_SECRET');
    const res = await fetch('https://public-api.wordpress.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token?: string };
    return data.access_token ? { access_token: data.access_token } : null;
  } catch {
    return null;
  }
}

function htmlToPlainText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
}

export interface WordpressComPublishParams {
  title: string;
  content: string; // HTML — 내부에서 평문 요약으로 변환
  articleUrl?: string; // 있으면 "전체 내용 보기" 링크로 덧붙임
}

/** WordPress.com에 요약+링크 형태로 발행. 연결 안 돼있으면 에러. */
export async function publishToWordpressCom(
  params: WordpressComPublishParams,
): Promise<{ url: string | null }> {
  const { title, content, articleUrl } = params;

  let accessToken = await getSetting('WORDPRESS_COM_ACCESS_TOKEN');
  const site = await getSetting('WORDPRESS_COM_SITE');
  if (!accessToken || !site) throw new Error('WordPress.com 연결 필요 (OAuth 인증 안 됨)');

  const stripped = htmlToPlainText(content);
  const excerpt = stripped.slice(0, 500) + (stripped.length > 500 ? '...' : '');
  const linkLine = articleUrl ? `\n\n▶ 전체 내용 보기: ${articleUrl}` : '';
  const body = excerpt + linkLine;

  async function tryPost(token: string) {
    return fetch(`https://public-api.wordpress.com/rest/v1.1/sites/${site}/posts/new`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title, content: body, status: 'publish' }),
      signal: AbortSignal.timeout(20_000),
    });
  }

  let res = await tryPost(accessToken);

  if (res.status === 401) {
    const refreshToken = await getSetting('WORDPRESS_COM_REFRESH_TOKEN');
    if (!refreshToken) throw new Error('WordPress.com 토큰 만료 — 재연결 필요');
    const refreshed = await refreshAccessToken(refreshToken);
    if (!refreshed) throw new Error('WordPress.com 토큰 갱신 실패 — 재연결 필요');
    accessToken = refreshed.access_token;
    const admin = createAdminClient();
    const { data: row } = await admin.from('app_settings').select('settings').eq('id', 1).single();
    const settings = (row?.settings as Record<string, string>) || {};
    settings.WORDPRESS_COM_ACCESS_TOKEN = accessToken;
    await admin.from('app_settings').update({ settings }).eq('id', 1);
    invalidateSettingsCache();
    res = await tryPost(accessToken);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WordPress.com 발행 실패: HTTP ${res.status} | ${errText.slice(0, 200)}`);
  }
  const data = await res.json() as { URL?: string };
  return { url: data.URL || null };
}
