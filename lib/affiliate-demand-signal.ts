/**
 * 쿠팡/무신사/토스 상품 선택이 전부 공급 쪽 신호(할인율/예상수익/베스트셀링)만
 * 쓰고 있어서 "사람들이 실제로 사고 싶어하는 것"과는 무관했음 — 이미 있는
 * 키워드 발굴 캐시(bossai_keyword_opportunities, 구매의도 정규식 매칭 포함)를
 * 재사용해서 후보 상품에 수요 신호 가점을 준다. 새 발굴 로직 아님 — 기존
 * 캐시를 다른 파이프라인의 정렬 보너스로 재활용하는 것뿐.
 */
import { createAdminClient } from '@/lib/supabase-server';

export async function fetchDemandKeywords(): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('bossai_keyword_opportunities')
      .select('keyword')
      .gt('score', 100)
      .neq('category', 'twenties') // 상품 커머스와 무관한 20대 콘텐츠 카테고리 제외
      .order('score', { ascending: false })
      .limit(200);
    return (data || []).map(d => d.keyword as string);
  } catch { return []; }
}

/** 키워드의 핵심 명사(첫 토큰)가 상품명에 들어있는지로 대략 매칭 — "제습기 추천"의
 * "제습기"가 "샤오미 제습기 12L"에 있으면 매치. 정교한 NLP 아님, 저비용 휴리스틱. */
export function matchesDemand(productName: string, keywords: string[]): boolean {
  const name = productName.toLowerCase();
  return keywords.some(kw => {
    const core = kw.split(/\s+/)[0];
    return core.length >= 2 && name.includes(core.toLowerCase());
  });
}
