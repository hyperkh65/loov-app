import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import crypto from 'crypto';

export const maxDuration = 60;

/*
-- DB Tables (run in Supabase SQL editor):

create table if not exists bossai_keyword_opportunities (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  keyword text not null,
  source text default 'auto', -- 'trend','seasonal','news','shopping'
  monthly_total int default 0,
  monthly_pc int default 0,
  monthly_mobile int default 0,
  naver_blog int default 0,
  daum_total int default 0,
  google_count int default 0,
  competition_score int default 0,
  power_blog_ratio int default 0,
  difficulty text default 'medium',
  can_rank1 boolean default false,
  can_rank1_reason text default '',
  score numeric default 0,
  grade text default 'normal',
  article_id text,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '6 hours')
);
create index if not exists idx_kw_opp_user on bossai_keyword_opportunities(user_id, expires_at);

create table if not exists bossai_keyword_tracking (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  keyword text not null,
  article_id text,
  article_title text,
  article_url text,
  created_at timestamptz default now(),
  last_checked_at timestamptz,
  current_rank int,
  current_page int,
  best_rank int,
  check_count int default 0,
  is_active boolean default true
);

create table if not exists bossai_keyword_rank_history (
  id bigserial primary key,
  tracking_id bigint references bossai_keyword_tracking not null,
  rank int,
  page int,
  checked_at timestamptz default now()
);
*/

// ── 월별 블로그 친화적 시드 키워드 ────────────────────────────────────────────
// 뉴스성 X, 정보 탐색형 O (방법/추천/이유/효능 등 블로그 검색 패턴)
const MONTHLY_SEEDS: Record<number, string[]> = {
  1:  ['다이어트 방법', '새해 목표', '겨울 피부 관리', '독감 예방', '체중 감량', '신년 운동'],
  2:  ['봄맞이 다이어트', '밸런타인 선물', '봄 화장품', '건강 검진', '운동 루틴', '피부 보습'],
  3:  ['봄 여행지', '봄 코디', '미세먼지 마스크', '알레르기 치료', '봄 다이어트 식단', '벚꽃 여행'],
  4:  ['봄 나들이', '황사 대비', '봄 인테리어', '꽃가루 알레르기', '봄 캠핑', '체중 관리'],
  5:  ['어버이날 선물', '어린이날 선물', '가정의달 여행', '봄 등산 코스', '캠핑 요리', '건강 보조제'],
  6:  ['여름 다이어트', '에어컨 청소', '모기 퇴치', '여름 스킨케어', '장마철 건강', '냉방병 예방'],
  7:  ['여름 휴가지', '자외선 차단제 추천', '물놀이 안전', '여름 식단', '더위 해소 음식', '피서지'],
  8:  ['휴가 준비', '여름 운동', '가을 여행 준비', '더위 탈출', '수분 보충', '야외 활동'],
  9:  ['추석 선물 추천', '가을 여행지', '단풍 명소', '가을 코디', '추석 음식', '면역력 강화'],
  10: ['단풍 여행', '독감 예방접종', '가을 다이어트', '겨울 준비', '건강 검진 항목', '핼러윈'],
  11: ['겨울 코트 추천', '김장 레시피', '수능 선물', '연말 선물', '겨울 피부', '보일러 관리'],
  12: ['크리스마스 선물', '연말 여행', '연말 다이어트', '새해 계획', '겨울 여행지', '크리스마스 케이크'],
};

// 블로그 1등 먹기 좋은 롱테일 확장 패턴
const LONGTAIL_PATTERNS = [
  '{seed} 방법',
  '{seed} 추천',
  '{seed} 효과',
  '{seed} 이유',
  '{seed} 주의사항',
  '{seed} 후기',
  '{seed} 가격',
  '{seed} 비교',
  '{seed} 종류',
  '{seed} 선택 기준',
];

function expandToLongtail(seed: string): string[] {
  // 이미 패턴이 붙어있으면 그대로, 없으면 확장
  const hasPattern = /방법|추천|효과|이유|후기|가격|비교|종류|주의/.test(seed);
  if (hasPattern) return [seed];
  return LONGTAIL_PATTERNS.slice(0, 4).map(p => p.replace('{seed}', seed));
}

// 네이버 자동완성 API (진짜 사람들이 검색하는 쿼리)
async function getNaverAutocomplete(seed: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(seed)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return [];
    const text = await res.text();
    // 응답 형식: [[["keyword1","keyword2",...]], ...]
    const match = text.match(/\[\[(\[.*?\])/s);
    if (!match) return [];
    const arr = JSON.parse(match[1]) as string[][];
    return arr.flat().filter(k => typeof k === 'string' && k.length > 2 && k.length < 20);
  } catch {
    return [];
  }
}

// 뉴스 키워드 여부 사전 필터 (뉴스 도메인 키워드 제거)
const NEWS_STOP_PATTERNS = [
  /^(대통령|국회|정부|청와대|검찰|경찰|법원|재판|판결|기소|구속|체포|사건|사고|사망|부상|화재|지진|태풍)/,
  /조작|스캔들|의혹|의혹|비리|부패|논란|갈등|충돌|폭행|범죄|살인|강도/,
  /선거|투표|후보|당선|낙선|공천|정당|여당|야당/,
  /주가|코스피|코스닥|환율|금리|채권|주식 급등|주식 폭락/,
];

function isNewsDominated(keyword: string): boolean {
  return NEWS_STOP_PATTERNS.some(p => p.test(keyword));
}

function getNaverAdHeaders(apiKey: string, secret: string, customerId: string) {
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.GET./keywordstool`);
  return {
    'X-Timestamp': timestamp,
    'X-API-KEY': apiKey,
    'X-Customer': customerId,
    'X-Signature': hmac.digest('base64'),
    'Content-Type': 'application/json',
  };
}

async function getMonthlyVolume(
  keyword: string, apiKey: string, secret: string, customerId: string
): Promise<{ pc: number; mobile: number }> {
  try {
    const headers = getNaverAdHeaders(apiKey, secret, customerId);
    const res = await fetch(
      `https://api.naver.com/keywordstool?hintKeywords=${encodeURIComponent(keyword)}&showDetail=1`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return { pc: 0, mobile: 0 };
    const data = await res.json() as { keywordList?: Array<{ relKeyword: string; monthlyPcQcCnt: number | string; monthlyMobileQcCnt: number | string }> };
    const match = (data.keywordList || []).find(k => k.relKeyword === keyword) || data.keywordList?.[0];
    if (!match) return { pc: 0, mobile: 0 };
    const pc = typeof match.monthlyPcQcCnt === 'number' ? match.monthlyPcQcCnt : (match.monthlyPcQcCnt === '< 10' ? 5 : parseInt(String(match.monthlyPcQcCnt)) || 0);
    const mobile = typeof match.monthlyMobileQcCnt === 'number' ? match.monthlyMobileQcCnt : (match.monthlyMobileQcCnt === '< 10' ? 5 : parseInt(String(match.monthlyMobileQcCnt)) || 0);
    return { pc, mobile };
  } catch {
    return { pc: 0, mobile: 0 };
  }
}

async function getNaverSaturation(keyword: string, clientId: string, clientSecret: string) {
  const headers = { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret };
  try {
    const [blogRes, webRes, newsRes] = await Promise.all([
      fetch(`https://openapi.naver.com/v1/search/blog?query=${encodeURIComponent(keyword)}&display=10&sort=date`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`https://openapi.naver.com/v1/search/webkr?query=${encodeURIComponent(keyword)}&display=1`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`https://openapi.naver.com/v1/search/news?query=${encodeURIComponent(keyword)}&display=1`, { headers, signal: AbortSignal.timeout(5000) }),
    ]);
    const blogData = await blogRes.json() as { total?: number; items?: Array<{ bloggername?: string; bloggerlink?: string }> };
    const webData = await webRes.json() as { total?: number };
    const newsData = await newsRes.json() as { total?: number };

    const topItems = blogData.items || [];
    const powerBlogDomains = ['blog.naver.com', 'tistory.com', 'brunch.co.kr'];
    const powerBlogCount = topItems.filter(item =>
      powerBlogDomains.some(d => (item.bloggerlink || '').includes(d))
    ).length;

    return {
      blog: blogData.total || 0,
      web: webData.total || 0,
      news: newsData.total || 0,
      powerBlogRatio: topItems.length > 0 ? Math.round(powerBlogCount / topItems.length * 100) : 0,
    };
  } catch {
    return { blog: 0, web: 0, news: 0, powerBlogRatio: 0 };
  }
}

async function getDaumSaturation(keyword: string, kakaoKey: string) {
  const headers = { Authorization: `KakaoAK ${kakaoKey}` };
  try {
    const [blogRes, cafeRes] = await Promise.all([
      fetch(`https://dapi.kakao.com/v2/search/blog?query=${encodeURIComponent(keyword)}&size=1`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`https://dapi.kakao.com/v2/search/cafe?query=${encodeURIComponent(keyword)}&size=1`, { headers, signal: AbortSignal.timeout(5000) }),
    ]);
    const blogData = await blogRes.json() as { meta?: { total_count?: number } };
    const cafeData = await cafeRes.json() as { meta?: { total_count?: number } };
    return { blog: blogData.meta?.total_count || 0, cafe: cafeData.meta?.total_count || 0 };
  } catch {
    return { blog: 0, cafe: 0 };
  }
}

async function getGoogleCount(keyword: string): Promise<number> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&num=1&hl=ko&gl=kr`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 0;
    const html = await res.text();
    const m = html.match(/약\s*([\d,]+)\s*개/) || html.match(/About ([\d,]+) results/i);
    if (m?.[1]) return parseInt(m[1].replace(/,/g, ''), 10);
    return 0;
  } catch { return 0; }
}

function calcDifficulty(naverBlog: number, daumTotal: number, googleCount: number, naverNews: number) {
  const weighted = naverBlog + daumTotal * 0.4 + googleCount * 0.0008 + naverNews * 0.8;
  if (weighted < 3000)   return 'very_easy';
  if (weighted < 15000)  return 'easy';
  if (weighted < 60000)  return 'medium';
  if (weighted < 200000) return 'hard';
  return 'very_hard';
}

function calcGrade(score: number, monthly: number): 'diamond' | 'gold' | 'silver' | 'bronze' | 'normal' {
  if (score >= 300 && monthly >= 3000) return 'diamond';
  if (score >= 100 && monthly >= 500)  return 'gold';
  if (score >= 40  && monthly >= 100)  return 'silver';
  if (score >= 10)                     return 'bronze';
  return 'normal';
}

function calcCanRank1(
  difficulty: string, monthlyTotal: number, naverBlog: number, powerBlogRatio: number, naverNews: number
): { canRank1: boolean; reason: string } {
  // 뉴스 도메인 장악
  if (naverNews > 10000) return { canRank1: false, reason: '언론사 뉴스 도배 — 블로그 노출 불가' };
  if (naverNews > 3000 && naverNews > naverBlog * 2) return { canRank1: false, reason: '뉴스 기사 압도적 — 블로그 밀림' };
  if (naverNews > 1000 && naverBlog < 500) return { canRank1: false, reason: '뉴스 키워드 — 언론사 경쟁' };

  // 검색량·포화도 모두 0 = 수요 불확실
  if (monthlyTotal === 0 && naverBlog < 100 && naverNews < 100) {
    return { canRank1: false, reason: '검색량·포화도 모두 없음 — 수요 불확실' };
  }

  if (difficulty === 'very_easy') {
    if (monthlyTotal >= 500) return { canRank1: true, reason: '경쟁 매우 낮음 + 충분한 검색량' };
    if (monthlyTotal >= 100) return { canRank1: true, reason: '경쟁 매우 낮음 (틈새시장)' };
    // Ad API 없을 때는 블로그 포화도로 판단
    if (monthlyTotal === 0 && naverBlog > 0 && naverBlog < 5000) return { canRank1: true, reason: '블로그 경쟁 낮음 (검색량 미확인)' };
    return { canRank1: false, reason: '검색량 없음 — 1등해도 유입 없음' };
  }
  if (difficulty === 'easy') {
    if (monthlyTotal >= 1000 && powerBlogRatio < 50) return { canRank1: true, reason: '쉬운 경쟁 + 검색량 풍부 + 파워블로그 少' };
    if (monthlyTotal >= 200)  return { canRank1: true, reason: '적당한 검색량 + 낮은 경쟁' };
    if (naverBlog < 5000 && monthlyTotal >= 50) return { canRank1: true, reason: '블로그 포화도 낮음' };
    if (monthlyTotal === 0 && naverBlog < 10000) return { canRank1: true, reason: '경쟁 낮음 (검색량 미확인)' };
  }
  if (difficulty === 'medium' && monthlyTotal >= 2000 && powerBlogRatio < 30) {
    return { canRank1: true, reason: '검색량 높음 + 파워블로그 적음 (도전 가능)' };
  }
  const reasons: string[] = [];
  if (difficulty === 'hard' || difficulty === 'very_hard') reasons.push('포화도 높음');
  if (powerBlogRatio >= 70) reasons.push('파워블로거 상위권 장악');
  if (monthlyTotal > 0 && monthlyTotal < 50) reasons.push('검색량 너무 낮음');
  return { canRank1: false, reason: reasons.join(' / ') || '경쟁 심함' };
}

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const [naverClientId, naverClientSecret, naverAdApiKey, naverAdSecret, naverAdCustomerId, kakaoKey] = await Promise.all([
    getSetting('NAVER_CLIENT_ID'),
    getSetting('NAVER_CLIENT_SECRET'),
    getSetting('NAVER_AD_API_KEY'),
    getSetting('NAVER_AD_SECRET'),
    getSetting('NAVER_AD_CUSTOMER_ID'),
    getSetting('KAKAO_REST_API_KEY'),
  ]);

  const hasNaverApi = !!(naverClientId && naverClientSecret);
  const hasAdApi = !!(naverAdApiKey && naverAdSecret && naverAdCustomerId);
  const hasDaumApi = !!kakaoKey;

  const currentMonth = new Date().getMonth() + 1;
  const monthSeeds = (MONTHLY_SEEDS[currentMonth] || []);

  // ── Step 1: 시드 키워드 수집 ──────────────────────────────────────────────
  // 계절성 시드 → 롱테일 확장 + 네이버 자동완성으로 실제 검색어 발굴
  const seen = new Set<string>();
  const candidates: Array<{ keyword: string; source: 'seasonal' | 'autocomplete' | 'longtail' }> = [];

  const addCandidate = (keyword: string, source: 'seasonal' | 'autocomplete' | 'longtail') => {
    const kw = keyword.trim();
    if (!kw || seen.has(kw) || isNewsDominated(kw) || kw.length > 25) return;
    seen.add(kw);
    candidates.push({ keyword: kw, source });
  };

  // 계절성 키워드 직접 추가
  for (const seed of monthSeeds) addCandidate(seed, 'seasonal');

  // 시드 키워드 일부를 자동완성으로 확장 (병렬, 최대 4개 시드)
  const autocompleteResults = await Promise.all(
    monthSeeds.slice(0, 4).map(seed => getNaverAutocomplete(seed))
  );
  for (const suggestions of autocompleteResults) {
    for (const kw of suggestions.slice(0, 6)) {
      if (!isNewsDominated(kw)) addCandidate(kw, 'autocomplete');
    }
  }

  // 짧은 시드(2어절 이하)는 롱테일 패턴으로 확장
  for (const seed of monthSeeds.slice(0, 6)) {
    const words = seed.split(' ');
    if (words.length <= 2) {
      for (const expanded of expandToLongtail(seed)) {
        if (expanded !== seed) addCandidate(expanded, 'longtail');
      }
    }
  }

  // ── Step 2: 포화도 분석 (최대 20개) ──────────────────────────────────────
  const toAnalyze = candidates.slice(0, 20);

  const results = await Promise.all(
    toAnalyze.map(async ({ keyword, source }) => {
      const [naverSat, daumSat, googleCount, volume] = await Promise.all([
        hasNaverApi ? getNaverSaturation(keyword, naverClientId!, naverClientSecret!) : Promise.resolve({ blog: 0, web: 0, news: 0, powerBlogRatio: 0 }),
        hasDaumApi ? getDaumSaturation(keyword, kakaoKey!) : Promise.resolve({ blog: 0, cafe: 0 }),
        getGoogleCount(keyword),
        hasAdApi ? getMonthlyVolume(keyword, naverAdApiKey!, naverAdSecret!, naverAdCustomerId!) : Promise.resolve({ pc: 0, mobile: 0 }),
      ]);

      const monthlyTotal = volume.pc + volume.mobile;
      const daumTotal = daumSat.blog + daumSat.cafe;
      const totalSaturation = naverSat.blog + daumTotal;
      const score = monthlyTotal > 0
        ? Math.round(monthlyTotal / Math.max(totalSaturation / 1000, 1) * 10) / 10
        : (naverSat.blog > 0 ? Math.round(10000 / Math.max(naverSat.blog / 100, 1) * 10) / 10 : 0);

      const difficulty = calcDifficulty(naverSat.blog, daumTotal, googleCount, naverSat.news);
      const grade = calcGrade(score, monthlyTotal);
      const { canRank1, reason } = calcCanRank1(difficulty, monthlyTotal, naverSat.blog, naverSat.powerBlogRatio, naverSat.news);
      const competitionScore = Math.min(100, Math.round(
        (naverSat.blog / 100000 * 40) +
        (daumTotal / 50000 * 20) +
        (googleCount / 10000000 * 30) +
        (naverSat.powerBlogRatio * 0.1)
      ));

      return {
        keyword, source,
        monthlyPc: volume.pc, monthlyMobile: volume.mobile, monthlyTotal,
        naverBlog: naverSat.blog, naverWeb: naverSat.web, naverNews: naverSat.news,
        naverPowerBlogRatio: naverSat.powerBlogRatio,
        daumBlog: daumSat.blog, daumCafe: daumSat.cafe,
        googleCount, score, grade, difficulty, canRank1, canRank1Reason: reason, competitionScore,
      };
    })
  );

  // ── Step 3: 정렬 — 1등 가능 우선 → 난이도 → 점수 ────────────────────────
  const diffOrder: Record<string, number> = { very_easy: 0, easy: 1, medium: 2, hard: 3, very_hard: 4 };
  results.sort((a, b) => {
    if (a.canRank1 !== b.canRank1) return a.canRank1 ? -1 : 1;
    const dd = (diffOrder[a.difficulty] || 0) - (diffOrder[b.difficulty] || 0);
    if (dd !== 0) return dd;
    return b.score - a.score || b.monthlyTotal - a.monthlyTotal;
  });

  // ── Step 4: DB 저장 ───────────────────────────────────────────────────────
  const adminDb = await createAdminClient();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  for (const r of results) {
    await adminDb.from('bossai_keyword_opportunities').upsert({
      user_id: user.id, keyword: r.keyword, source: r.source,
      monthly_total: r.monthlyTotal, monthly_pc: r.monthlyPc, monthly_mobile: r.monthlyMobile,
      naver_blog: r.naverBlog, daum_total: r.daumBlog + r.daumCafe,
      google_count: r.googleCount, competition_score: r.competitionScore,
      power_blog_ratio: r.naverPowerBlogRatio, difficulty: r.difficulty,
      can_rank1: r.canRank1, can_rank1_reason: r.canRank1Reason,
      score: r.score, grade: r.grade, created_at: now, expires_at: expiresAt,
    }, { onConflict: 'user_id,keyword' });
  }

  return NextResponse.json({ results, hasAdApi, hasNaverApi, hasDaumApi, discoveredAt: now });
}
