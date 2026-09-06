/**
 * POST /api/affiliate-engine/score
 * Phase 6: MATCHED 상품 중 아직 점수가 없는 것을 골라 스코어링.
 * Body: { limit?: number } (기본 5, 최대 20)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import {
  coupangMatchScore, affiliateEconomicsScore, saturationLevel,
  computeAIScores, computeOpportunityScore, DEFAULT_WEIGHTS,
  type MatchConfidence,
} from '@/lib/affiliate-engine/scoring';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(body.limit || 5, 20);

  // 이미 점수가 있는 상품 id 목록 (재계산 방지 — 최신 이력 하나만 있으면 스킵)
  const { data: scored } = await supabase
    .from('affiliate_product_scores')
    .select('product_id')
    .eq('user_id', user.id);
  const scoredIds = new Set((scored || []).map(s => s.product_id));

  const { data: products, error } = await supabase
    .from('affiliate_products')
    .select('id, product_name, brand, generic_product_type, category, features, problem_solved, use_case, status')
    .eq('user_id', user.id)
    .eq('status', 'MATCHED')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const targets = (products || []).filter(p => !scoredIds.has(p.id)).slice(0, limit);
  if (!targets.length) return NextResponse.json({ processed: 0, results: [] });

  const results: Array<{ id: string; name: string; status: string; opportunity_score?: number }> = [];

  for (const p of targets) {
    try {
      const { data: match } = await supabase
        .from('affiliate_product_matches')
        .select('match_confidence, affiliate_listings(discount_rate, current_price)')
        .eq('product_id', p.id)
        .maybeSingle();

      const listing = (match?.affiliate_listings as unknown as { discount_rate: number | null; current_price: number | null } | null);
      const matchScore = coupangMatchScore((match?.match_confidence as MatchConfidence) || null);
      const economicsScore = affiliateEconomicsScore(listing?.discount_rate ?? null, listing?.current_price ?? null);

      const { count: sameCategoryCount } = await supabase
        .from('affiliate_products')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('generic_product_type', p.generic_product_type || '__none__')
        .neq('id', p.id);
      const saturation = saturationLevel(sameCategoryCount || 0);

      const aiScores = await computeAIScores({
        productName: p.product_name,
        brand: p.brand,
        genericType: p.generic_product_type,
        features: p.features || [],
        problemSolved: p.problem_solved,
        useCase: p.use_case,
      });

      const allScores: Record<string, number> = {
        coupang_match_score: matchScore,
        affiliate_economics_score: economicsScore,
        viral_score: aiScores.viral_score,
        visual_impact_score: aiScores.visual_impact_score,
        problem_clarity_score: aiScores.problem_clarity_score,
        korean_relevance_score: aiScores.korean_relevance_score,
        purchase_intent_score: aiScores.purchase_intent_score,
        production_feasibility_score: aiScores.production_feasibility_score,
      };
      // engagement_velocity_score: 소셜 트렌드 데이터 없는 쿠팡 자체 발굴이라 중립값
      const opportunityScore = computeOpportunityScore(allScores);

      await supabase.from('affiliate_product_scores').insert({
        user_id: user.id,
        product_id: p.id,
        viral_score: aiScores.viral_score,
        visual_impact_score: aiScores.visual_impact_score,
        problem_clarity_score: aiScores.problem_clarity_score,
        engagement_velocity_score: null,
        korean_relevance_score: aiScores.korean_relevance_score,
        purchase_intent_score: aiScores.purchase_intent_score,
        coupang_match_score: matchScore,
        affiliate_economics_score: economicsScore,
        production_feasibility_score: aiScores.production_feasibility_score,
        saturation_level: saturation,
        opportunity_score: opportunityScore,
        score_weights: DEFAULT_WEIGHTS,
        explanation: aiScores.explanation,
      });

      await supabase.from('affiliate_products').update({ status: 'SCORED', updated_at: new Date().toISOString() }).eq('id', p.id);

      results.push({ id: p.id, name: p.product_name, status: 'SCORED', opportunity_score: opportunityScore });
    } catch (e) {
      results.push({ id: p.id, name: p.product_name, status: `실패: ${String(e).slice(0, 150)}` });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
