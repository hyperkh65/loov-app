/** 무신사 큐레이터 내부 API(api.one.musinsa.com) — 로그인 쿠키(MUSINSA_COOKIE)로 인증. 스케줄러의 무신사 자동발행과 같은 방식. */
import { getSetting } from '@/lib/get-setting';

export interface MusinsaProduct { goodsNo: number; goodsName: string; brandName: string | null; imageUrl: string; originalPrice: number; finalPrice: number; finalDiscount: number; expectedEarnings: number; isSoldOut: boolean }

async function api(path: string, method: 'GET' | 'POST' = 'GET'): Promise<Record<string, unknown>> {
  const cookie = await getSetting('MUSINSA_COOKIE');
  if (!cookie) throw new Error('MUSINSA_COOKIE 없음');
  const res = await fetch(`https://api.one.musinsa.com${path}`, { method, headers: { 'X-Platform': 'MUSINSA', Cookie: cookie }, signal: AbortSignal.timeout(15_000) });
  const j = await res.json().catch(() => null) as { data?: Record<string, unknown>; meta?: { result?: string; message?: string } } | null;
  if (!res.ok || j?.meta?.result !== 'SUCCESS') throw new Error(`무신사 API 실패(${res.status}): ${j?.meta?.message || res.statusText}`);
  return j.data || {};
}
export const searchMusinsa = async (keyword: string, size = 10) => ((await api(`/api2/affiliate/v2/products/search?keyword=${encodeURIComponent(keyword)}&page=1&size=${size}`)).list || []) as MusinsaProduct[];
export const musinsaLink = async (goodsNo: number) => (await api(`/api2/affiliate/v2/link/product/${goodsNo}`, 'POST')).link as string;
