import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { scrapeProductData, extractProductId, extractFromAffiliateUrl } from '@/lib/coupang/api';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { productId, productUrl, affiliateUrl } = await req.json();

  // URL에서 productId 추출 (일반 URL, 제휴 링크 모두 지원)
  const id = productId
    || (productUrl ? extractProductId(productUrl) : null)
    || (affiliateUrl ? extractProductId(affiliateUrl) : null);
  if (!id) return NextResponse.json({ error: '상품 ID 또는 URL이 필요합니다' }, { status: 400 });

  // 제휴 링크에서 itemId 추출 (리뷰 API 직접 호출에 사용)
  let itemId: string | undefined;
  if (affiliateUrl) {
    const extracted = extractFromAffiliateUrl(affiliateUrl);
    itemId = extracted.itemId || undefined;
  }
  // productUrl에도 itemId가 있을 수 있음
  if (!itemId && productUrl) {
    try {
      const u = new URL(productUrl);
      itemId = u.searchParams.get('itemId') || undefined;
    } catch { /* ignore */ }
  }

  try {
    const result = await scrapeProductData(id, itemId ? { itemId } : undefined);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
