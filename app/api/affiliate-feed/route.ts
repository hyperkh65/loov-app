/**
 * 딸깍(맥) 상품 영상 공급: 점수 높은 순으로 아직 안 보낸 상품을 하나씩 내준다.
 * 상품 고르기(발굴·점수)는 LOOV가, 영상 제작은 딸깍이 한다. 쿠팡 등 인증 정보는 LOOV에만 둔다.
 * GET  ?n=1&peek=1  → 상품 목록(peek이면 보낸 표시를 하지 않는다)
 * DELETE ?id=      → 딸깍이 영상 제작을 마쳤다고 확인
 */
import { NextRequest, NextResponse } from 'next/server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { createAdminClient } from '@/lib/supabase-server';
import { uploadToR2, readFromR2 } from '@/lib/r2-storage';
import { createGoLink } from '@/lib/affiliate-tracking';

export const maxDuration = 60;
const SENT = 'affiliate/ddalkak-sent.json';
type Sent = Record<string, { taken: number; done?: number }>;
const readSent = async (): Promise<Sent> => { try { return JSON.parse((await readFromR2(SENT)) || '{}'); } catch { return {}; } };
const writeSent = (s: Sent) => uploadToR2(SENT, Buffer.from(JSON.stringify(s)), 'application/json');

export async function GET(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const n = Math.min(5, Math.max(1, Number(req.nextUrl.searchParams.get('n')) || 1)), peek = !!req.nextUrl.searchParams.get('peek');
  const owner = process.env.OWNER_USER_ID!, db = createAdminClient(), sent = await readSent(), now = Date.now();
  // 영상을 받아 갔는데 6시간 안에 확인이 없으면(맥이 꺼짐 등) 다시 내준다
  const blocked = (id: string) => !!sent[id] && (!!sent[id].done || now - sent[id].taken < 6 * 3600e3);

  const { data: scores } = await db.from('affiliate_product_scores')
    .select('product_id, opportunity_score, saturation_level, explanation, computed_at')
    .eq('user_id', owner).gte('computed_at', new Date(now - 45 * 86400e3).toISOString())
    .order('opportunity_score', { ascending: false }).limit(200);
  const seen = new Set<string>(), ranked = (scores || []).filter(s => !seen.has(s.product_id) && seen.add(s.product_id) && !blocked(s.product_id));

  const items = [];
  for (const s of ranked) {
    if (items.length >= n) break;
    const { data: p } = await db.from('affiliate_products').select('*').eq('id', s.product_id).maybeSingle();
    if (!p) continue;
    const { data: m } = await db.from('affiliate_product_matches')
      .select('match_confidence, affiliate_listings(network, network_product_id, product_name, product_url, affiliate_url, current_price, original_price, discount_rate, rating, review_count, image_url)')
      .eq('product_id', p.id).order('match_confidence', { ascending: false }).limit(1).maybeSingle();
    const l = (m?.affiliate_listings || null) as unknown as Record<string, unknown> | null;
    if (!l || !l.affiliate_url) continue; // 제휴 링크가 없는 상품은 영상 만들어도 수익이 없다
    const { data: aliases } = await db.from('affiliate_product_aliases').select('affiliate_source_items(url, thumbnail_url, raw_metrics)').eq('product_id', p.id).limit(5);
    const videos = (aliases || []).map(a => ((a.affiliate_source_items as unknown as { raw_metrics?: { video_url?: string } } | null)?.raw_metrics?.video_url)).filter(Boolean);
    const { data: sc } = await db.from('affiliate_scripts').select('hook_text, structure').eq('product_id', p.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const network = String(l.network || 'coupang');
    const link = network === 'coupang'
      ? await createGoLink({ platform: 'coupang', networkProductId: String(l.network_product_id || ''), productName: String(l.product_name || p.product_name), destinationUrl: String(l.affiliate_url), contentChannel: 'sns_comment', snsPlatform: 'shorts' })
      : String(l.affiliate_url);
    items.push({
      id: p.id, name: p.product_name, brand: p.brand, type: p.generic_product_type, category: p.category,
      features: p.features || [], problem: p.problem_solved, useCase: p.use_case, visual: p.visual_description,
      keywords: { ko: p.search_keywords_ko || [], en: p.search_keywords_en || [], zh: p.search_keywords_zh || [] },
      listing: { network, name: l.product_name, price: l.current_price, originalPrice: l.original_price, discountRate: l.discount_rate, rating: l.rating, reviewCount: l.review_count, image: l.image_url, productUrl: l.product_url },
      link, videos, script: sc ? { hook: sc.hook_text, ...(sc.structure as object || {}) } : null,
      score: { opportunity: s.opportunity_score, saturation: s.saturation_level, why: s.explanation },
    });
    if (!peek) sent[p.id] = { taken: now };
  }
  if (!peek && items.length) await writeSent(sent);
  return NextResponse.json({ items, candidates: ranked.length });
}

export async function DELETE(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id'); if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });
  const sent = await readSent(); sent[id] = { taken: sent[id]?.taken || Date.now(), done: Date.now() }; await writeSent(sent);
  return NextResponse.json({ ok: true });
}
