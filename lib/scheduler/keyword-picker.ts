/**
 * 스케줄러 실행 시 실제 수익 키워드를 선택합니다.
 *
 * 우선순위:
 * 1. bossai_keyword_opportunities 캐시 (12시간) — 이미 분석된 황금 키워드
 * 2. 캐시 없으면: 상업성 높은 시드로 자동완성 수집 → 빠른 포화도 분석 → 최고 점수 키워드 선택
 */
import { createAdminClient } from '@/lib/supabase-server';

// ── 항상 수익이 나는 상업성 높은 시드 (계절 무관) ─────────────────────────────
// 계절성 키워드(어린이날, 추석 등)는 제외 — 항상 구매 의도가 있는 카테고리만
const COMMERCIAL_SEEDS = [
  // 건강·미용 (CPC 높음, 상시 수요)
  '다이어트 보조제', '탈모 샴푸 추천', '피부 미백', '콜라겐 효능', '프로바이오틱스 추천',
  '유산균 추천', '눈 영양제', '오메가3 추천', '마그네슘 효능',
  // 반려동물 (구매 의도 강함)
  '강아지 사료 추천', '고양이 사료 추천', '강아지 영양제', '고양이 간식',
  // 가전·생활 (비교 검색 많음)
  '공기청정기 추천', '로봇청소기 추천', '안마의자 추천', '전기난로 추천',
  '무선청소기 추천', '식기세척기 추천',
  // 금융·보험 (CPC 최고)
  '실손보험 비교', '자동차보험 다이렉트', '신용카드 추천', '청약통장 혜택',
  '개인사업자 대출', '전세자금대출',
  // IT·디지털
  '노트북 추천', '무선이어폰 추천', '태블릿 추천', '스마트워치 비교',
  // 여행 (항공·숙박 수익)
  '동남아 여행지 추천', '제주도 숙소 추천', '국내 여행지',
  // 다이어트·운동 (상시)
  '간헐적 단식 방법', '홈트레이닝 방법', '단백질 쉐이크 추천',
];

// 뉴스·정치 필터
const NEWS_BLOCK = /대통령|국회|검찰|경찰|재판|구속|선거|사건|사고|범죄|의혹|비리|폭락|탄핵|정부|여당|야당/;

async function autocomplete(seed: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(seed)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return [];
    const text = await res.text();
    const idx = text.indexOf('[[');
    if (idx === -1) return [];
    const inner = text.slice(idx + 1);
    const end = inner.indexOf(']]');
    if (end === -1) return [];
    const arr = JSON.parse(inner.slice(0, end + 1)) as unknown[];
    return (arr as string[])
      .filter(k => typeof k === 'string' && k.length >= 4 && k.length <= 20 && !NEWS_BLOCK.test(k))
      .slice(0, 6);
  } catch { return []; }
}

// 네이버 블로그 포화도 빠른 체크 (스크래핑)
async function naverBlogCount(kw: string): Promise<number> {
  try {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
    const res = await fetch(
      `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw)}`,
      { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return 999999;
    const html = await res.text();
    const patterns = [/총\s*([\d,]+)\s*건/, /"blogTotal"\s*:\s*(\d+)/, /"total"\s*:\s*(\d+)/];
    for (const p of patterns) {
      const m = html.match(p);
      if (m?.[1]) return parseInt(m[1].replace(/,/g, ''), 10);
    }
    return 999999;
  } catch { return 999999; }
}

interface ScoredKeyword {
  keyword: string;
  blogCount: number;
  score: number;
}

async function findBestKeyword(): Promise<string> {
  // 랜덤으로 시드 5개 선택 (매번 다른 키워드 발굴)
  const shuffled = [...COMMERCIAL_SEEDS].sort(() => Math.random() - 0.5);
  const selectedSeeds = shuffled.slice(0, 5);

  // 자동완성으로 후보 수집
  const acResults = await Promise.all(selectedSeeds.map(s => autocomplete(s)));
  const candidates = new Set<string>();
  acResults.flat().forEach(kw => {
    if (kw && !NEWS_BLOCK.test(kw)) candidates.add(kw);
  });

  // 후보가 없으면 시드 자체를 사용
  if (candidates.size === 0) return selectedSeeds[0];

  // 상위 8개만 포화도 분석 (속도 우선)
  const toAnalyze = [...candidates].slice(0, 8);
  const scored: ScoredKeyword[] = await Promise.all(
    toAnalyze.map(async (kw) => {
      const blogCount = await naverBlogCount(kw);
      // 포화도 점수: 블로그 수 적을수록 좋음
      // 10만 이하 = 진입 가능, 5만 이하 = 쉬움, 1만 이하 = 매우 쉬움
      let score = 0;
      if (blogCount < 10000)  score = 100;
      else if (blogCount < 30000)  score = 70;
      else if (blogCount < 60000)  score = 50;
      else if (blogCount < 100000) score = 30;
      else if (blogCount < 200000) score = 10;
      return { keyword: kw, blogCount, score };
    })
  );

  // 점수 높은 순 정렬
  scored.sort((a, b) => b.score - a.score || a.blogCount - b.blogCount);

  // 점수 0 이하(너무 포화)면 시드 자체 반환
  const best = scored[0];
  if (!best || best.score === 0) return selectedSeeds[0];

  return best.keyword;
}

export async function pickKeywordForUser(userId: string): Promise<string> {
  const supabase = createAdminClient();

  // 1. 최근 12시간 분석된 황금 키워드 우선 사용
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { data: cached } = await supabase
    .from('bossai_keyword_opportunities')
    .select('keyword, score, can_rank1')
    .eq('user_id', userId)
    .gte('created_at', since)
    .gt('score', 0)
    .order('can_rank1', { ascending: false })
    .order('score', { ascending: false })
    .limit(5)
    .not('keyword', 'is', null);

  if (cached && cached.length > 0) {
    // 이미 사용한 키워드 제외 (최근 7일 로그 확인)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: recentLogs } = await supabase
      .from('bossai_schedule_logs')
      .select('result')
      .eq('user_id', userId)
      .gte('started_at', sevenDaysAgo)
      .eq('status', 'success');

    const usedKeywords = new Set(
      (recentLogs || [])
        .map(l => (l.result as { keyword?: string })?.keyword)
        .filter(Boolean)
    );

    // 사용하지 않은 최고 점수 키워드 선택
    const fresh = cached.find(c => !usedKeywords.has(c.keyword));
    if (fresh) return fresh.keyword;
    // 모두 사용됐으면 첫 번째 반환 (중복 허용)
    return cached[0].keyword;
  }

  // 2. 캐시 없음 → 실시간 포화도 분석으로 최적 키워드 발굴
  return findBestKeyword();
}
