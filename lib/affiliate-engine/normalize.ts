/**
 * Phase 4: 정규화 — 발굴된 상품(affiliate_products)의 골격 정보(이름/카테고리/가격)만으로
 * 브랜드·특징·문제해결·사용상황·검색키워드 등 풍부한 필드를 AI로 채운다.
 */
import { callAISimple } from '@/lib/ai-call';

export interface NormalizedFields {
  brand: string | null;
  generic_product_type: string | null;
  subcategory: string | null;
  features: string[];
  problem_solved: string | null;
  use_case: string | null;
  country_of_origin: string | null;
  visual_description: string | null;
  search_keywords_ko: string[];
  search_keywords_en: string[];
}

function buildPrompt(productName: string, category: string | null, priceMin: number | null, priceMax: number | null): string {
  const price = priceMin ? `${priceMin.toLocaleString()}${priceMax && priceMax !== priceMin ? `~${priceMax.toLocaleString()}` : ''}원` : '미상';
  return `다음 쇼핑몰 상품 정보를 분석해서 JSON으로만 응답하세요. 존재하지 않는 정보는 null로 두고, 절대 지어내지 마세요.

상품명: ${productName}
카테고리: ${category || '미상'}
가격대: ${price}

JSON 형식(이 키만 사용, 다른 텍스트 없이 JSON만 출력):
{
  "brand": "브랜드명 또는 null",
  "generic_product_type": "일반명사형 상품 종류 (예: 무선 이어폰)",
  "subcategory": "세부 카테고리",
  "features": ["핵심 특징 3-5개"],
  "problem_solved": "이 상품이 해결하는 문제 1문장",
  "use_case": "주 사용 상황 1문장",
  "country_of_origin": "제조국 또는 null",
  "visual_description": "숏폼 영상 제작 참고용 외관 묘사 1문장",
  "search_keywords_ko": ["한국어 검색 키워드 5개"],
  "search_keywords_en": ["영어 검색 키워드 3개"]
}`;
}

export async function normalizeProduct(
  productName: string,
  category: string | null,
  priceMin: number | null,
  priceMax: number | null,
): Promise<NormalizedFields> {
  const raw = await callAISimple(buildPrompt(productName, category, priceMin, priceMax));
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾지 못함');
  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  const asStringArray = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const asStringOrNull = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null;

  return {
    brand: asStringOrNull(parsed.brand),
    generic_product_type: asStringOrNull(parsed.generic_product_type),
    subcategory: asStringOrNull(parsed.subcategory),
    features: asStringArray(parsed.features),
    problem_solved: asStringOrNull(parsed.problem_solved),
    use_case: asStringOrNull(parsed.use_case),
    country_of_origin: asStringOrNull(parsed.country_of_origin),
    visual_description: asStringOrNull(parsed.visual_description),
    search_keywords_ko: asStringArray(parsed.search_keywords_ko),
    search_keywords_en: asStringArray(parsed.search_keywords_en),
  };
}
