/**
 * 토스쇼핑 쉐어링크 Open API 클라이언트.
 * 문서: https://sharelink-docs.toss.im/developers/open-api
 * 인증: OAuth2 client_credentials → Bearer 토큰(유효기간 약 1년, 매번 재발급하지 말고
 * 캐시해서 재사용 — 문서에서 명시적으로 권장). app_settings에 토큰+발급시각을 저장해 재사용한다.
 */
import { getSetting } from '@/lib/get-setting';
import { createAdminClient } from '@/lib/supabase-server';

const TOKEN_URL = 'https://oauth2.cert.toss.im/token';
const BASE_URL = 'https://sharelink.toss.im/openapi';

interface TossFailResponse {
  resultType: 'FAIL';
  error: { errorType: number; errorCode: string; reason: string };
}

export interface TossProduct {
  rank: number;
  tacaItemId: number;
  displayName: string;
  thumbnailUrl: string;
  productUrl: string;
  displayPrice: number;
  originalPrice: number;
  discountRate: number;
  isSoldOut: boolean;
  reviewScore: number;
  reviewCount: number;
  categoryIds: number[];
  endAt?: string; // 하루특가 전용 — 특가 종료 시각(ISO 8601, KST)
}

async function fetchNewToken(): Promise<{ token: string; expiresIn: number }> {
  const [accessKey, secretKey] = await Promise.all([
    getSetting('TOSS_ACCESS_KEY'),
    getSetting('TOSS_SECRET_KEY'),
  ]);
  if (!accessKey || !secretKey) throw new Error('TOSS_ACCESS_KEY/TOSS_SECRET_KEY 설정 없음');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: accessKey,
      client_secret: secretKey,
      scope: 'sharelink:read sharelink:write',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`토스 토큰 발급 실패: ${data.error || res.status} ${data.error_description || ''}`);
  }
  return { token: data.access_token, expiresIn: data.expires_in || 31_000_000 };
}

// 토큰이 만료 1일 전 이내면 재발급 — 문서가 "재사용하고 매번 새로 발급받지 말라"고
// 명시해서 app_settings에 캐시해 재사용한다(다른 설정값들과 같은 저장소 재사용).
async function getAccessToken(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from('app_settings').select('settings').eq('id', 1).single();
  const settings = (data?.settings || {}) as Record<string, string>;
  const cached = settings.TOSS_ACCESS_TOKEN;
  const cachedAt = settings.TOSS_ACCESS_TOKEN_AT ? new Date(settings.TOSS_ACCESS_TOKEN_AT).getTime() : 0;
  const cachedExpiresIn = parseInt(settings.TOSS_ACCESS_TOKEN_EXPIRES_IN || '0', 10);
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (cached && cachedAt && Date.now() - cachedAt < cachedExpiresIn * 1000 - oneDayMs) {
    return cached;
  }

  const { token, expiresIn } = await fetchNewToken();
  await admin.from('app_settings').update({
    settings: {
      ...settings,
      TOSS_ACCESS_TOKEN: token,
      TOSS_ACCESS_TOKEN_AT: new Date().toISOString(),
      TOSS_ACCESS_TOKEN_EXPIRES_IN: String(expiresIn),
    },
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  return token;
}

async function tossGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = await getAccessToken();
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE_URL}${path}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json() as { resultType: 'SUCCESS' | 'FAIL'; success?: T } & Partial<TossFailResponse>;
  if (data.resultType === 'FAIL' || !data.success) {
    throw new Error(`토스 API 오류(${path}): ${data.error?.errorCode || res.status} ${data.error?.reason || ''}`);
  }
  return data.success;
}

export async function fetchTodayDeals(size = 30): Promise<TossProduct[]> {
  const result = await tossGet<{ items: TossProduct[] }>('/products/today-deals', { size: String(size) });
  return result.items || [];
}

export async function fetchBestSelling(size = 30): Promise<TossProduct[]> {
  const result = await tossGet<{ items: TossProduct[] }>('/products/best-selling', { size: String(size) });
  return result.items || [];
}

export async function createShareLink(tacaItemId: number): Promise<{ shortUrl: string; originUrl: string }> {
  const [token, publisherId] = await Promise.all([getAccessToken(), getSetting('TOSS_MEMBER_ID')]);
  if (!publisherId) throw new Error('TOSS_MEMBER_ID 설정 없음');

  const res = await fetch(`${BASE_URL}/links`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tacaItemId, publisherId }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json() as { resultType: 'SUCCESS' | 'FAIL'; success?: { shortUrl: string; originUrl: string } } & Partial<TossFailResponse>;
  if (data.resultType === 'FAIL' || !data.success) {
    throw new Error(`토스 쉐어링크 발급 실패: ${data.error?.errorCode || res.status} ${data.error?.reason || ''}`);
  }
  return data.success;
}
