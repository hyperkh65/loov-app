/**
 * Bing Webmaster Tools API 연동
 * 키 발급: Bing Webmaster Tools → 설정(⚙️) → API 액세스 → API 키
 * 앱 설정(app_settings)의 BING_API_KEY 에 저장해두고 쓴다.
 *
 * 주의: AddSite로 사이트를 추가해도 "소유 확인"은 별도다. 빙의 소유확인
 * 메타태그(msvalidate.01)는 사이트별이 아니라 계정당 하나라서, 그 태그를 모든
 * 사이트 <head>에 심어두면 한 번에 전부 인증된다(verification-tag 라우트 활용).
 */
const API = 'https://ssl.bing.com/webmaster/api.svc/json';

async function bingPost(apiKey: string, method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API}/${method}?apikey=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) {
    // 빙은 실패해도 200에 ErrorCode를 싣는 경우가 있어 본문을 그대로 넘긴다
    throw new Error(`Bing ${method} ${res.status}: ${text.slice(0, 300)}`);
  }
  let json: unknown;
  try { json = JSON.parse(text); } catch { return {}; }
  const j = json as { ErrorCode?: number; Message?: string };
  if (j?.ErrorCode) throw new Error(`Bing ${method} 오류(${j.ErrorCode}): ${j.Message || ''}`);
  return json;
}

async function bingGet(apiKey: string, method: string, params: Record<string, string> = {}): Promise<unknown> {
  const qs = new URLSearchParams({ apikey: apiKey, ...params });
  const res = await fetch(`${API}/${method}?${qs}`, { signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bing ${method} ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

/** 빙 계정에 사이트 추가 (소유 확인은 별도) */
export async function bingAddSite(apiKey: string, siteUrl: string): Promise<void> {
  await bingPost(apiKey, 'AddSite', { siteUrl });
}

/** 사이트맵 제출 */
export async function bingSubmitSitemap(apiKey: string, siteUrl: string, feedUrl: string): Promise<void> {
  await bingPost(apiKey, 'SubmitSitemap', { siteUrl, feedUrl });
}

export interface BingSite { Url: string; IsVerified?: boolean }

/** 계정에 등록된 사이트 목록 */
export async function bingGetUserSites(apiKey: string): Promise<BingSite[]> {
  const json = await bingGet(apiKey, 'GetUserSites') as { d?: BingSite[] };
  return json?.d || [];
}
