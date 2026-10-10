/**
 * 쿠팡/무신사는(토스와 달리) 실제 마감시간 같은 진짜 긴급성 신호가 없어서
 * "오늘 할인 중"이라고만 할 뿐 "평소보다 싼 건지"는 몰랐음 — 상품을 하루 1회
 * 스냅샷(가격만)해서 "어제보다 -12%" 같은 실데이터 긴급성 문구를 만들 수 있게
 * 한다. 스펙의 전체 Change Detector(30일 통계 등)는 불필요 — 하루치 비교로 충분.
 */
import { createAdminClient } from '@/lib/supabase-server';

export async function recordPriceSnapshot(
  platform: 'coupang' | 'musinsa',
  networkProductId: string,
  price: number,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('bossai_affiliate_price_snapshots').upsert({
      platform, network_product_id: networkProductId, price,
      snapshot_date: new Date().toISOString().slice(0, 10),
    }, { onConflict: 'platform,network_product_id,snapshot_date' });
  } catch (e) { console.error('[affiliate-price-history] 스냅샷 저장 실패:', e); }
}

/** 어제(혹은 가장 최근 과거) 스냅샷 대비 가격이 5% 이상 내렸을 때만 실데이터
 * 긴급성 문구를 반환 — 애매한 변동은 굳이 언급하지 않는다(가짜 긴급성 금지 원칙). */
export async function getPriceDropNote(
  platform: 'coupang' | 'musinsa',
  networkProductId: string,
  currentPrice: number,
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await admin
      .from('bossai_affiliate_price_snapshots')
      .select('price, snapshot_date')
      .eq('platform', platform)
      .eq('network_product_id', networkProductId)
      .lt('snapshot_date', today)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();
    if (!data?.price || data.price <= currentPrice) return null;
    const dropPct = Math.round((1 - currentPrice / data.price) * 100);
    if (dropPct < 5) return null;
    return `실데이터: ${data.snapshot_date} 대비 ${dropPct}% 하락(정확한 수치, 과장 없이 언급 가능)`;
  } catch { return null; }
}
