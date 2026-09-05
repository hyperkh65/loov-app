import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getGoldboxProducts, searchProducts, createAffiliateLinks } from '@/lib/coupang/api';
import { getSetting } from '@/lib/get-setting';

/** 쿠팡은 우리 시스템에서 유일하게 "발굴 소스 = 제휴 네트워크"가 동시에 성립하는 채널이라
 * 발굴→정규화→매칭이 사실상 한 단계로 끝난다(같은 상품이므로 EXACT_MATCH 확정).
 * 다른 발굴 소스(틱톡 등)는 나중에 별도 매칭 단계를 거쳐야 함 — 그건 Phase 5 몫. */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const keyword: string | undefined = body.keyword;
  const limit: number = Math.min(body.limit || 10, 20);

  const accessKey = await getSetting('COUPANG_ACCESS_KEY');
  const secretKey = await getSetting('COUPANG_SECRET_KEY');
  if (!accessKey || !secretKey) return NextResponse.json({ error: '쿠팡파트너스 API 키가 설정되지 않았습니다' }, { status: 400 });

  const { data: job } = await supabase.from('affiliate_automation_jobs').insert({
    user_id: user.id, job_type: 'DISCOVER', status: 'running', target_type: 'source',
    started_at: new Date().toISOString(),
  }).select().single();

  try {
    const products = keyword
      ? await searchProducts(keyword, accessKey, secretKey)
      : await getGoldboxProducts(accessKey, secretKey);

    const candidates = (products || []).filter(p => p.productImage).slice(0, limit);
    const results: Array<{ product_id: string; name: string; status: string }> = [];

    for (const p of candidates) {
      // 중복 방지: 같은 쿠팡 상품이 이미 리스팅에 있으면 가격/재고만 갱신
      const { data: existingListing } = await supabase
        .from('affiliate_listings')
        .select('id, user_id')
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
        results.push({ product_id: String(p.productId), name: p.productName, status: 'UPDATED' });
        continue;
      }

      const { data: listing, error: listingErr } = await supabase.from('affiliate_listings').insert({
        user_id: user.id, network: 'coupang', network_product_id: String(p.productId),
        product_name: p.productName, product_url: p.productUrl, affiliate_url: affiliateUrl,
        current_price: p.productPrice, discount_rate: p.discountRate || 0,
        category: p.categoryName || null, image_url: p.productImage,
      }).select().single();
      if (listingErr || !listing) { results.push({ product_id: String(p.productId), name: p.productName, status: `실패: ${listingErr?.message}` }); continue; }

      // 정규화 상품 개념 — 상세 특징 추출은 Phase 4(정규화)에서 AI로 채움. 여기선 골격만.
      const { data: product, error: productErr } = await supabase.from('affiliate_products').insert({
        user_id: user.id,
        product_name: p.productName,
        normalized_product_name: p.productName.trim(),
        category: p.categoryName || null,
        estimated_price_min: p.productPrice,
        estimated_price_max: p.productPrice,
        status: 'MATCHED', // 쿠팡 발굴은 발견 즉시 매칭 확정
      }).select().single();
      if (productErr || !product) { results.push({ product_id: String(p.productId), name: p.productName, status: `실패: ${productErr?.message}` }); continue; }

      await supabase.from('affiliate_product_matches').insert({
        user_id: user.id, product_id: product.id, listing_id: listing.id,
        match_confidence: 'EXACT_MATCH',
        match_evidence: { reason: '쿠팡 자체 발굴 — 발견된 상품과 리스팅이 동일 객체' },
      });

      results.push({ product_id: String(p.productId), name: p.productName, status: 'CREATED' });
    }

    await supabase.from('affiliate_automation_jobs').update({
      status: 'completed', finished_at: new Date().toISOString(),
      logs: `${results.length}건 처리 (${results.filter(r => r.status === 'CREATED').length} 신규)`,
    }).eq('id', job?.id);

    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    await supabase.from('affiliate_automation_jobs').update({
      status: 'failed', finished_at: new Date().toISOString(),
      error_message: (err as Error).message?.slice(0, 500),
    }).eq('id', job?.id);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
