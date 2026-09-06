/**
 * Phase 6: 스코어링 — 바이럴/기회/포화 점수 계산
 * 결정론적 점수(매칭 신뢰도/경제성/포화도)는 코드로, 정성적 점수(시각효과/문제
 * 명확성/구매의도/제작난이도)는 AI로 계산해 opportunity_score로 종합한다.
 */
import { callAISimple } from '@/lib/ai-call';

export type MatchConfidence = 'EXACT_MATCH' | 'HIGH_CONFIDENCE_EQUIVALENT' | 'SIMILAR_PRODUCT' | 'LOW_CONFIDENCE' | 'NO_MATCH';
export type SaturationLevel = 'LOW' | 'RISING' | 'MEDIUM' | 'HIGH' | 'OVERUSED';

const MATCH_SCORE: Record<MatchConfidence, number> = {
  EXACT_MATCH: 100,
  HIGH_CONFIDENCE_EQUIVALENT: 80,
  SIMILAR_PRODUCT: 50,
  LOW_CONFIDENCE: 20,
  NO_MATCH: 0,
};

export function coupangMatchScore(matchConfidence: MatchConfidence | null): number {
  return matchConfidence ? MATCH_SCORE[matchConfidence] ?? 0 : 0;
}

/** 할인율 + 가격대로 제휴 경제성 추정 (할인 클수록, 너무 저가/고가 아닐수록 높음) */
export function affiliateEconomicsScore(discountRate: number | null, price: number | null): number {
  let score = 40; // 기본값(할인 정보 없음)
  if (discountRate != null) score = Math.min(100, Math.round(discountRate * 1.5) + 20);
  if (price != null) {
    // 너무 저가(1만원 미만)는 수수료 절대액이 작아 경제성 낮음, 너무 고가(30만원 초과)는 전환율 낮음
    if (price < 10_000) score -= 15;
    else if (price > 300_000) score -= 10;
  }
  return Math.max(0, Math.min(100, score));
}

const SATURATION_THRESHOLDS: Array<[number, SaturationLevel]> = [
  [0, 'LOW'], [2, 'RISING'], [5, 'MEDIUM'], [10, 'HIGH'], [Infinity, 'OVERUSED'],
];

/** 같은 상품유형을 이미 몇 개나 다뤘는지로 포화도 추정 */
export function saturationLevel(sameCategoryCount: number): SaturationLevel {
  for (const [threshold, level] of SATURATION_THRESHOLDS) {
    if (sameCategoryCount <= threshold) return level;
  }
  return 'OVERUSED';
}

export interface AIScores {
  viral_score: number;
  visual_impact_score: number;
  problem_clarity_score: number;
  korean_relevance_score: number;
  purchase_intent_score: number;
  production_feasibility_score: number;
  explanation: string;
}

function buildPrompt(input: {
  productName: string; brand: string | null; genericType: string | null;
  features: string[]; problemSolved: string | null; useCase: string | null;
}): string {
  return `다음 쇼핑몰 상품을 숏폼 영상 콘텐츠 소재로서 평가해서 JSON으로만 응답하세요. 0-100 점수로 채점하세요.

상품명: ${input.productName}
브랜드: ${input.brand || '미상'}
종류: ${input.genericType || '미상'}
특징: ${input.features.join(', ') || '정보 없음'}
해결하는 문제: ${input.problemSolved || '정보 없음'}
사용 상황: ${input.useCase || '정보 없음'}

JSON 형식(이 키만 사용, 다른 텍스트 없이 JSON만 출력):
{
  "viral_score": 영상으로 만들었을 때 확산될 잠재력 (0-100),
  "visual_impact_score": 화면에 보여줬을 때 시각적 임팩트 (0-100),
  "problem_clarity_score": 해결하는 문제가 얼마나 명확하고 공감되는지 (0-100),
  "korean_relevance_score": 한국 시청자에게 얼마나 와닿는지 (0-100),
  "purchase_intent_score": 영상 시청 후 구매로 이어질 가능성 (0-100),
  "production_feasibility_score": 저예산으로 영상 제작이 쉬운 정도 (0-100),
  "explanation": "이 점수를 매긴 핵심 이유 한 문장 (관리자용 요약)"
}`;
}

export async function computeAIScores(input: {
  productName: string; brand: string | null; genericType: string | null;
  features: string[]; problemSolved: string | null; useCase: string | null;
}): Promise<AIScores> {
  const raw = await callAISimple(buildPrompt(input));
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾지 못함');
  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  const asScore = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  };

  return {
    viral_score: asScore(parsed.viral_score),
    visual_impact_score: asScore(parsed.visual_impact_score),
    problem_clarity_score: asScore(parsed.problem_clarity_score),
    korean_relevance_score: asScore(parsed.korean_relevance_score),
    purchase_intent_score: asScore(parsed.purchase_intent_score),
    production_feasibility_score: asScore(parsed.production_feasibility_score),
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation.slice(0, 300) : '',
  };
}

// 기본 가중치 — 매칭 확정도(구매 가능성)와 구매의도를 가장 중요하게, 경제성/시각효과가 그다음
const DEFAULT_WEIGHTS: Record<string, number> = {
  coupang_match_score: 0.2,
  affiliate_economics_score: 0.15,
  purchase_intent_score: 0.2,
  viral_score: 0.15,
  visual_impact_score: 0.1,
  problem_clarity_score: 0.1,
  korean_relevance_score: 0.05,
  production_feasibility_score: 0.05,
};

export function computeOpportunityScore(
  scores: Record<string, number>,
  weights: Record<string, number> = DEFAULT_WEIGHTS,
): number {
  let total = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (typeof scores[key] === 'number') {
      total += scores[key] * weight;
      weightSum += weight;
    }
  }
  return weightSum > 0 ? Math.round(total / weightSum) : 0;
}

export { DEFAULT_WEIGHTS };
