/**
 * POST /api/affiliate-feed/trend — 딸깍이 Threads(아마존 제휴)·알리 등에서 찾은 "지금 바이럴인 상품"을 넘긴다.
 * 쿠팡·무신사·토스를 모두 찾아 상품명이 가장 잘 맞는 곳의 제휴 링크로 넣고, 실제 반응 수로 점수를 매긴다.
 * 원본 영상(video_url: 딸깍 로컬 local:… 또는 공개 URL)은 매칭 근거에 남겨 영상 소스로 쓴다.
 * Body: { items: [{ keyword, why, fashion?, source_url, video_url?, likes, replies, reposts, posted_at }] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { createAdminClient } from '@/lib/supabase-server';
import { searchProducts, createAffiliateLinks } from '@/lib/coupang/api';
import { fetchBestSelling, fetchTodayDeals, createShareLink } from '@/lib/toss-sharelink';
import { searchMusinsa, musinsaLink } from '@/lib/musinsa-affiliate';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 300;
interface Item { keyword?: string; why?: string; fashion?: boolean; source_url?: string; video_url?: string; likes?: number; replies?: number; reposts?: number; posted_at?: string }
interface Cand { network: 'coupang' | 'musinsa' | 'toss'; id: string; name: string; url: string; image: string; price: number; old?: number; discount?: number; rating?: number; reviews?: number; category?: string; fit: number; link: () => Promise<string> }

// 검색어 낱말이 상품명에 얼마나 들어 있나(0~1). 쿠팡·무신사는 검색 결과라 기본으로 잘 맞고, 토스는 목록에서 고르므로 이걸로 거른다
const fit = (kw: string, name: string) => { const ws = kw.split(/\s+/).filter(w => w.length >= 2), n = name.replace(/\s/g, ''); return ws.length ? ws.filter(w => n.includes(w)).length / ws.length : 0; };

export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { items?: Item[] };
  const items = (b.items || []).filter(i => i.keyword && i.keyword.length <= 40).slice(0, 10);
  const [ak, sk] = await Promise.all([getSetting('COUPANG_ACCESS_KEY'), getSetting('COUPANG_SECRET_KEY')]);
  const toss = await Promise.all([fetchBestSelling(50), fetchTodayDeals(50)]).then(r => r.flat()).catch(() => []);
  const db = createAdminClient(), owner = process.env.OWNER_USER_ID!, out: Array<{ keyword: string; status: string; network?: string; name?: string }> = [];

  for (const it of items) {
    try {
      const kw = it.keyword!, cands: Cand[] = [];
      if (ak && sk) for (const p of (await searchProducts(kw, ak, sk).catch(() => [])).filter(x => x.productImage).slice(0, 3))
        cands.push({ network: 'coupang', id: String(p.productId), name: p.productName, url: p.productUrl, image: p.productImage, price: p.productPrice, old: p.productOldPrice, discount: p.discountRate, category: p.categoryName, fit: fit(kw, p.productName),
          link: async () => (await createAffiliateLinks([p.productUrl], ak, sk).catch(() => []))[0] || p.productUrl });
      if (it.fashion) for (const p of (await searchMusinsa(kw, 5).catch(() => [])).filter(x => !x.isSoldOut).slice(0, 3))
        cands.push({ network: 'musinsa', id: String(p.goodsNo), name: `${p.brandName ? p.brandName + ' ' : ''}${p.goodsName}`, url: `https://www.musinsa.com/products/${p.goodsNo}`, image: p.imageUrl, price: p.finalPrice, old: p.originalPrice, discount: p.finalDiscount, fit: fit(kw, p.goodsName) + 0.05,
          link: () => musinsaLink(p.goodsNo) });
      for (const p of toss.filter(x => !x.isSoldOut && fit(kw, x.displayName) >= 0.6))
        cands.push({ network: 'toss', id: String(p.tacaItemId), name: p.displayName, url: p.productUrl, image: p.thumbnailUrl, price: p.displayPrice, old: p.originalPrice, discount: p.discountRate, rating: p.reviewScore, reviews: p.reviewCount, fit: fit(kw, p.displayName) + 0.1,
          link: async () => (await createShareLink(p.tacaItemId)).shortUrl });
      const c = cands.sort((x, y) => y.fit - x.fit)[0];
      if (!c) { out.push({ keyword: kw, status: '3곳 모두 없음' }); continue; }
      const { data: dup } = await db.from('affiliate_listings').select('id').eq('network', c.network).eq('network_product_id', c.id).maybeSingle();
      if (dup) { out.push({ keyword: kw, status: '이미 있음', network: c.network, name: c.name }); continue; }
      const aff = await c.link();
      const engagement = (it.likes || 0) + 3 * (it.replies || 0) + 5 * (it.reposts || 0);
      const { data: listing } = await db.from('affiliate_listings').insert({
        user_id: owner, network: c.network, network_product_id: c.id, product_name: c.name, product_url: c.url, affiliate_url: aff,
        current_price: c.price, original_price: c.old || null, discount_rate: c.discount || 0, rating: c.rating || null, review_count: c.reviews || null, category: c.category || null, image_url: c.image,
      }).select().single();
      const { data: product } = await db.from('affiliate_products').insert({
        user_id: owner, product_name: c.name, normalized_product_name: c.name.trim(), category: c.category || null, use_case: it.why || null,
        search_keywords_ko: [kw], estimated_price_min: c.price, estimated_price_max: c.price, status: 'MATCHED',
      }).select().single();
      if (!listing || !product) { out.push({ keyword: kw, status: '저장 실패' }); continue; }
      await db.from('affiliate_product_matches').insert({ user_id: owner, product_id: product.id, listing_id: listing.id, match_confidence: c.fit >= 0.99 ? 'HIGH_CONFIDENCE_EQUIVALENT' : 'SIMILAR_PRODUCT',
        match_evidence: { reason: '바이럴 상품 → 쿠팡·무신사·토스 중 상품명 일치율 최고', fit: Math.round(c.fit * 100) / 100, keyword: kw, source_url: it.source_url, video_url: it.video_url || null } });
      await db.from('affiliate_product_scores').insert({
        user_id: owner, product_id: product.id, engagement_velocity_score: Math.min(100, Math.round(20 * Math.log10(1 + engagement))),
        opportunity_score: Math.round(Math.min(95, 55 + 10 * Math.log10(1 + engagement))), saturation_level: 'RISING',
        score_weights: { source: 'viral_trend', likes: it.likes || 0, replies: it.replies || 0, reposts: it.reposts || 0 },
        explanation: `바이럴(좋아요 ${it.likes || 0}·답글 ${it.replies || 0}·리포스트 ${it.reposts || 0}) — ${it.why || ''} ${it.source_url || ''}`.slice(0, 500),
      });
      out.push({ keyword: kw, status: '추가', network: c.network, name: c.name });
    } catch (e) { out.push({ keyword: it.keyword || '', status: '오류: ' + (e as Error).message.slice(0, 80) }); }
  }
  return NextResponse.json({ results: out });
}
