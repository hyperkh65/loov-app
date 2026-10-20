/**
 * POST /api/affiliate-feed/trend — 딸깍이 Threads 등에서 찾은 "지금 바이럴인 상품"을 넘긴다.
 * 쿠팡에서 같은 상품군을 검색해 리스팅·상품·매칭을 만들고, 실제 반응 수로 점수를 매긴다.
 * (AI 추정 점수 대신 실제 바이럴 신호라 engagement_velocity_score를 채운다.)
 * Body: { items: [{ keyword: '쿠팡 검색어', why: '왜 뜨는지 한 줄', source_url, likes, replies, reposts, posted_at }] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { createAdminClient } from '@/lib/supabase-server';
import { searchProducts, createAffiliateLinks } from '@/lib/coupang/api';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 120;
interface Item { keyword?: string; why?: string; source_url?: string; likes?: number; replies?: number; reposts?: number; posted_at?: string }

export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { items?: Item[] };
  const items = (b.items || []).filter(i => i.keyword && i.keyword.length <= 40).slice(0, 10);
  const [ak, sk] = await Promise.all([getSetting('COUPANG_ACCESS_KEY'), getSetting('COUPANG_SECRET_KEY')]);
  if (!ak || !sk) return NextResponse.json({ error: '쿠팡 키 없음' }, { status: 400 });
  const db = createAdminClient(), owner = process.env.OWNER_USER_ID!, out: Array<{ keyword: string; status: string; name?: string }> = [];

  for (const it of items) {
    try {
      const engagement = (it.likes || 0) + 3 * (it.replies || 0) + 5 * (it.reposts || 0);
      // 반응 0~1만 이상을 55~95점으로(로그 스케일). 좋아요 수천이면 80점대
      const opportunity = Math.round(Math.min(95, 55 + 10 * Math.log10(1 + engagement)));
      const p = (await searchProducts(it.keyword!, ak, sk)).find(x => x.productImage);
      if (!p) { out.push({ keyword: it.keyword!, status: '쿠팡에 없음' }); continue; }
      const { data: dup } = await db.from('affiliate_listings').select('id').eq('network', 'coupang').eq('network_product_id', String(p.productId)).maybeSingle();
      if (dup) { out.push({ keyword: it.keyword!, status: '이미 있음', name: p.productName }); continue; }
      let aff = p.productUrl; try { const l = await createAffiliateLinks([p.productUrl], ak, sk); if (l[0]) aff = l[0]; } catch {}
      const { data: listing } = await db.from('affiliate_listings').insert({
        user_id: owner, network: 'coupang', network_product_id: String(p.productId), product_name: p.productName, product_url: p.productUrl,
        affiliate_url: aff, current_price: p.productPrice, original_price: p.productOldPrice || null, discount_rate: p.discountRate || 0,
        category: p.categoryName || null, image_url: p.productImage,
      }).select().single();
      const { data: product } = await db.from('affiliate_products').insert({
        user_id: owner, product_name: p.productName, normalized_product_name: p.productName.trim(), category: p.categoryName || null,
        use_case: it.why || null, search_keywords_ko: [it.keyword!], estimated_price_min: p.productPrice, estimated_price_max: p.productPrice, status: 'MATCHED',
      }).select().single();
      if (!listing || !product) { out.push({ keyword: it.keyword!, status: '저장 실패' }); continue; }
      await db.from('affiliate_product_matches').insert({ user_id: owner, product_id: product.id, listing_id: listing.id, match_confidence: 'SIMILAR_PRODUCT', match_evidence: { reason: 'Threads 바이럴 상품군 → 쿠팡 검색 1순위', source_url: it.source_url, keyword: it.keyword } });
      await db.from('affiliate_product_scores').insert({
        user_id: owner, product_id: product.id, engagement_velocity_score: Math.min(100, Math.round(20 * Math.log10(1 + engagement))), opportunity_score: opportunity,
        saturation_level: 'RISING', score_weights: { source: 'threads_trend', likes: it.likes || 0, replies: it.replies || 0, reposts: it.reposts || 0 },
        explanation: `Threads 바이럴(좋아요 ${it.likes || 0}·답글 ${it.replies || 0}·리포스트 ${it.reposts || 0}) — ${it.why || ''} ${it.source_url || ''}`.slice(0, 500),
      });
      out.push({ keyword: it.keyword!, status: '추가', name: p.productName });
    } catch (e) { out.push({ keyword: it.keyword || '', status: '오류: ' + (e as Error).message.slice(0, 80) }); }
  }
  return NextResponse.json({ results: out });
}
