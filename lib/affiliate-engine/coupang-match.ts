/**
 * 쿠팡 검색 결과 1건을 affiliate_listings/affiliate_products/affiliate_product_matches에
 * upsert하는 공용 로직. app/api/affiliate-engine/discover/coupang와
 * app/api/affiliate-engine/discover/aliexpress-video가 공유한다 — 원래 discover/coupang
 * 안에 인라인으로만 있던 걸 뽑아냄(같은 매칭 로직을 다른 발굴 소스에서도 그대로 써야 해서).
 */
import { createAdminClient } from '@/lib/supabase-server';
import type { CoupangProduct } from '@/lib/coupang/api';
import { createAffiliateLinks } from '@/lib/coupang/api';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface MatchResult {
  status: 'CREATED' | 'UPDATED' | 'FAILED';
  productId?: string;
  listingId?: string;
  name: string;
  error?: string;
}

export async function upsertCoupangMatch(
  supabase: AdminClient,
  userId: string,
  p: CoupangProduct,
  accessKey: string,
  secretKey: string,
): Promise<MatchResult> {
  const { data: existingListing } = await supabase
    .from('affiliate_listings')
    .select('id')
    .eq('network', 'coupang')
    .eq('network_product_id', String(p.productId))
    .maybeSingle();

  let affiliateUrl = p.productUrl;
  try {
    const links = await createAffiliateLinks([p.productUrl], accessKey, secretKey);
    if (links[0]) affiliateUrl = links[0];
  } catch { /* 실패 시 원본 URL 폴백 */ }

  if (existingListing) {
    await supabase.from('affiliate_listings').update({
      current_price: p.productPrice,
      discount_rate: p.discountRate || 0,
      affiliate_url: affiliateUrl,
      last_checked_at: new Date().toISOString(),
    }).eq('id', existingListing.id);

    const { data: match } = await supabase
      .from('affiliate_product_matches')
      .select('product_id')
      .eq('listing_id', existingListing.id)
      .maybeSingle();

    return { status: 'UPDATED', listingId: existingListing.id, productId: match?.product_id, name: p.productName };
  }

  const { data: listing, error: listingErr } = await supabase.from('affiliate_listings').insert({
    user_id: userId, network: 'coupang', network_product_id: String(p.productId),
    product_name: p.productName, product_url: p.productUrl, affiliate_url: affiliateUrl,
    current_price: p.productPrice, discount_rate: p.discountRate || 0,
    category: p.categoryName || null, image_url: p.productImage,
  }).select().single();
  if (listingErr || !listing) return { status: 'FAILED', name: p.productName, error: listingErr?.message };

  const { data: product, error: productErr } = await supabase.from('affiliate_products').insert({
    user_id: userId,
    product_name: p.productName,
    normalized_product_name: p.productName.trim(),
    category: p.categoryName || null,
    estimated_price_min: p.productPrice,
    estimated_price_max: p.productPrice,
    status: 'MATCHED',
  }).select().single();
  if (productErr || !product) return { status: 'FAILED', name: p.productName, error: productErr?.message };

  await supabase.from('affiliate_product_matches').insert({
    user_id: userId, product_id: product.id, listing_id: listing.id,
    match_confidence: 'EXACT_MATCH',
    match_evidence: { reason: '쿠팡 자체 발굴 — 발견된 상품과 리스팅이 동일 객체' },
  });

  return { status: 'CREATED', productId: product.id, listingId: listing.id, name: p.productName };
}
