/**
 * 스케줄러 실행 시 자동으로 수익 키워드를 선택합니다.
 * 1. bossai_keyword_opportunities 캐시 확인 (12시간)
 * 2. 캐시 없으면 네이버 자동완성 기반 즉석 발굴
 */
import { createAdminClient } from '@/lib/supabase-server';

const MONTHLY_SEEDS: Record<number, string[]> = {
  1:  ['겨울 건강 관리', '새해 다이어트', '독감 예방법', '피부 건조 해결'],
  2:  ['봄맞이 준비', '건강검진 항목', '미세먼지 마스크', '봄 피부 관리'],
  3:  ['꽃가루 알레르기', '봄 여행지 추천', '봄 다이어트 방법', '체중 감량'],
  4:  ['황사 대처법', '봄 캠핑 준비', '벚꽃 명소', '봄 코디 방법'],
  5:  ['어린이날 선물 추천', '가정의달 선물', '봄 등산 코스', '자외선차단제 추천'],
  6:  ['에어컨 관리법', '장마 대비', '여름 다이어트', '모기 퇴치'],
  7:  ['피서지 추천', '여름 여행지', '자외선 차단 방법', '더위 해소 음식'],
  8:  ['보양식 추천', '여름 피부 관리', '가을 여행 준비', '면역력 강화'],
  9:  ['단풍 여행지 추천', '추석 선물 추천', '환절기 건강', '가을 캠핑'],
  10: ['독감 예방접종 시기', '단풍 명소', '가을 등산 코스', '겨울 준비'],
  11: ['수능 선물 추천', '겨울 패션 코디', '보일러 관리', '연말 선물'],
  12: ['크리스마스 선물', '연말 여행지', '겨울 다이어트', '신년 계획'],
};

async function naverAutocomplete(seed: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(seed)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return [];
    const text = await res.text();
    const idx = text.indexOf('[[');
    if (idx === -1) return [];
    const inner = text.slice(idx + 1);
    const end = inner.indexOf(']]');
    if (end === -1) return [];
    const arr = JSON.parse(inner.slice(0, end + 1)) as unknown[];
    const NEWS_BLOCK = /대통령|국회|검찰|경찰|재판|구속|선거|사건|사고|범죄|의혹|비리|폭락|탄핵/;
    return (arr as string[])
      .filter(k => typeof k === 'string' && k.length >= 4 && k.length <= 20 && !NEWS_BLOCK.test(k))
      .slice(0, 6);
  } catch { return []; }
}

export async function pickKeywordForUser(userId: string): Promise<string> {
  const supabase = createAdminClient();

  // 1. 최근 12시간 캐시 확인
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { data: cached } = await supabase
    .from('bossai_keyword_opportunities')
    .select('keyword, score, can_rank1')
    .eq('user_id', userId)
    .gte('created_at', since)
    .gt('score', 0)
    .order('can_rank1', { ascending: false })
    .order('score', { ascending: false })
    .limit(1)
    .single();

  if (cached?.keyword) return cached.keyword;

  // 2. 캐시 없음 → 네이버 자동완성으로 즉석 발굴
  const month = new Date().getMonth() + 1;
  const seeds = MONTHLY_SEEDS[month] || MONTHLY_SEEDS[5];

  const acResults = await Promise.all(seeds.slice(0, 3).map(s => naverAutocomplete(s)));
  const keywords = acResults.flat();

  if (keywords.length > 0) return keywords[0];

  // 3. 완전 폴백
  return seeds[0];
}
