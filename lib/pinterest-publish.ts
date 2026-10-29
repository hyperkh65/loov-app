/**
 * Pinterest 발행 공용 로직. app/api/backlink/pinterest(세션 사용자용 HTTP 엔드포인트)와
 * lib/rewrite-publish.ts(자동화 파이프라인)가 공유한다. tumblr-publish.ts와 동일한 패턴.
 */
import { withUtm } from '@/lib/utm';
import { getSetting, invalidateSettingsCache } from '@/lib/get-setting';
import { createAdminClient } from '@/lib/supabase-server';

export interface PinterestPublishParams {
  title: string;
  meta_description?: string;
  canonical_url: string;
  representative_image_url?: string | null;
}

export async function publishToPinterest(params: PinterestPublishParams): Promise<{ url?: string }> {
  const { title, meta_description, canonical_url, representative_image_url } = params;
  if (!title || !canonical_url) throw new Error('title, canonical_url 필요');
  if (!representative_image_url) throw new Error('Pinterest 핀 생성에 대표 이미지가 필요합니다');

  const [accessToken, boardId] = await Promise.all([
    getSetting('PINTEREST_ACCESS_TOKEN'),
    getSetting('PINTEREST_BOARD_ID'),
  ]);

  if (!accessToken || !boardId) {
    const missing = [!accessToken && 'Access Token', !boardId && 'Board ID'].filter(Boolean).join(', ');
    throw new Error(`Pinterest 설정 누락: ${missing}`);
  }

  const createPin = (token: string) => fetch('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      board_id: boardId,
      title: title.slice(0, 100),
      description: (meta_description || '').slice(0, 800),
      link: withUtm(canonical_url, 'pinterest'),
      media_source: { source_type: 'image_url', url: representative_image_url },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  let res = await createPin(accessToken);
  if (res.status === 401) { // 토큰 만료 → 갱신 토큰이 있으면 한 번 갱신하고 다시(2026-10-29)
    const fresh = await refreshPinterestToken().catch(() => null);
    if (fresh) res = await createPin(fresh);
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Pinterest 오류 (${res.status}): ${data.message || JSON.stringify(data)}`);
  }

  const pinId = data.id;
  const url = pinId ? `https://www.pinterest.com/pin/${pinId}/` : undefined;
  return { url };
}

/** 갱신 토큰으로 새 액세스 토큰을 받아 저장한다. 앱 비밀 키·갱신 토큰이 없으면 null */
async function refreshPinterestToken(): Promise<string | null> {
  const [secret, refresh] = await Promise.all([getSetting('PINTEREST_APP_SECRET'), getSetting('PINTEREST_REFRESH_TOKEN')]);
  if (!secret || !refresh) return null;
  const r = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`1583709:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
    signal: AbortSignal.timeout(20_000),
  });
  const d = await r.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!r.ok || !d.access_token) return null;
  const admin = await createAdminClient();
  const { data: cur } = await admin.from('app_settings').select('settings').eq('id', 1).single();
  const next: Record<string, string> = { ...((cur?.settings as Record<string, string>) || {}), PINTEREST_ACCESS_TOKEN: d.access_token, PINTEREST_TOKEN_EXPIRES: String(Date.now() + (d.expires_in || 0) * 1000) };
  if (d.refresh_token) next.PINTEREST_REFRESH_TOKEN = d.refresh_token;
  await admin.from('app_settings').update({ settings: next, updated_at: new Date().toISOString() }).eq('id', 1);
  invalidateSettingsCache();
  return d.access_token;
}
