/**
 * 스케줄러 실행 시 실제 수익 키워드를 선택합니다.
 *
 * 우선순위:
 * 1. bossai_keyword_opportunities 캐시 (12시간) — 대시보드에서 분석된 황금 키워드
 * 2. 캐시 없으면: Google Trends 실시간 트렌딩 + Naver Ad API 수익 분석 → 최고 Money Score 키워드
 */
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

// ── 필터 ───────────────────────────────────────────────────────────────────
const NEWS_BLOCK = /대통령|국회|검찰|경찰|재판|구속|선거|투표|사건|사고|사망|범죄|의혹|비리|갈등|폭락|탄핵|정부|여당|야당|주가|환율|전쟁|지진|태풍|홍수/;
const COMMERCIAL_BLOCK = /english|english|daily|search|trends/i; // 영문 트렌드 제목 제거

function isUsable(kw: string): boolean {
  return (
    kw.length >= 3 &&
    kw.length <= 15 &&
    !NEWS_BLOCK.test(kw) &&
    !COMMERCIAL_BLOCK.test(kw) &&
    /[가-힣]/.test(kw) // 한글 포함 필수
  );
}

// ── Google Trends RSS (API 키 불필요) ──────────────────────────────────────
async function fetchGoogleTrendsRSS(): Promise<string[]> {
  try {
    const res = await fetch('https://trends.google.com/trending/rss?geo=KR', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const titles: string[] = [];
    const re = /<title><!\[CDATA\[([^\]]+)\]\]><\/title>|<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const t = (m[1] || '').trim();
      if (t && !t.includes('Google') && isUsable(t)) titles.push(t);
    }
    return [...new Set(titles)].slice(0, 20);
  } catch { return []; }
}

// ── Google Trends 일별 트렌딩 ──────────────────────────────────────────────
async function fetchGoogleDailyTrends(): Promise<string[]> {
  try {
    const res = await fetch(
      'https://trends.google.com/trends/api/dailytrends?geo=KR&hl=ko&tz=-540&ns=15',
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000) }
    );
    const text = await res.text();
    const json = JSON.parse(text.replace(/^\)\]\}'/, '').trim()) as {
      default?: { trendingSearchesDays?: Array<{ trendingSearches?: Array<{ title?: { query?: string } }> }> };
    };
    const trends: string[] = [];
    for (const day of json.default?.trendingSearchesDays || []) {
      for (const t of day.trendingSearches || []) {
        const q = t.title?.query || '';
        if (isUsable(q)) trends.push(q);
      }
    }
    return [...new Set(trends)].slice(0, 20);
  } catch { return []; }
}

// ── Naver Ad API (검색량 + 경쟁도) ────────────────────────────────────────
async function fetchNaverAdData(keywords: string[]): Promise<Array<{
  keyword: string; monthlyTotal: number; competition: string;
}>> {
  const [apiKey, secret, customerId] = await Promise.all([
    getSetting('NAVER_AD_API_KEY'),
    getSetting('NAVER_AD_SECRET'),
    getSetting('NAVER_AD_CUSTOMER_ID'),
  ]);
  if (!apiKey || !secret || !customerId) return [];

  try {
    const timestamp = Date.now().toString();
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${timestamp}.GET./keywordstool`);
    const signature = hmac.digest('base64');

    const qs = keywords.slice(0, 5).map(k => `hintKeywords=${encodeURIComponent(k)}`).join('&') + '&showDetail=1';
    const res = await fetch(`https://api.naver.com/keywordstool?${qs}`, {
      headers: {
        'X-Timestamp': timestamp,
        'X-API-KEY': apiKey,
        'X-Customer': customerId,
        'X-Signature': signature,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const data = await res.json() as {
      keywordList?: Array<{ relKeyword: string; monthlyPcQcCnt: number | string; monthlyMobileQcCnt: number | string; compIdx: string }>;
    };

    return (data.keywordList || []).map(item => {
      const parse = (v: number | string) =>
        typeof v === 'number' ? v : v === '< 10' ? 5 : parseInt(String(v)) || 0;
      const pc = parse(item.monthlyPcQcCnt);
      const mobile = parse(item.monthlyMobileQcCnt);
      return { keyword: item.relKeyword, monthlyTotal: pc + mobile, competition: item.compIdx };
    });
  } catch { return []; }
}

// ── Money Score 계산 (advanced API와 동일) ─────────────────────────────────
function calcMoneyScore(kw: string, monthlyTotal: number, competition: string): number {
  const volScore = monthlyTotal < 100 ? monthlyTotal / 100 * 30
    : monthlyTotal < 1000 ? 30 + (monthlyTotal - 100) / 900 * 40
    : monthlyTotal < 10000 ? 70 + (monthlyTotal - 1000) / 9000 * 30
    : Math.max(55, 100 - (monthlyTotal - 10000) / 100000 * 45);

  const compScore = competition === 'high' ? 90 : competition === 'medium' ? 60 : 30;
  const cpcEst = competition === 'high' ? 1800 : competition === 'medium' ? 900 : 300;
  const cpcScore = Math.min(100, cpcEst / 18);

  const intentScore =
    /구매|주문|가격|얼마|할인|쿠폰|추천|후기|리뷰|최고|선택/.test(kw) ? 90
    : /방법|하는법|정보|꿀팁|팁/.test(kw) ? 65
    : /뜻|의미|란|이란|개념/.test(kw) ? 20
    : 50;

  return Math.round(volScore * 0.25 + compScore * 0.20 + cpcScore * 0.25 + intentScore * 0.20 + 30 * 0.10);
}

// ── 실시간 트렌딩 기반 최고 수익 키워드 발굴 ──────────────────────────────
async function findBestTrendingKeyword(): Promise<string> {
  // 1. Google Trends에서 실시간 트렌딩 수집
  const [rss, daily] = await Promise.all([
    fetchGoogleTrendsRSS(),
    fetchGoogleDailyTrends(),
  ]);

  const allTrending = [...new Set([...rss, ...daily])].filter(isUsable);

  if (allTrending.length === 0) {
    // 폴백: 상업성 높은 상시 키워드
    return '다이어트 보조제 추천';
  }

  // 2. 상위 10개 Naver Ad API로 검색량 + 경쟁도 분석
  const topCandidates = allTrending.slice(0, 10);
  const adData = await fetchNaverAdData(topCandidates);

  // Ad API 데이터가 없으면 트렌딩 첫 번째 반환
  if (adData.length === 0) return allTrending[0];

  // 3. Money Score 계산 후 최고 점수 선택
  const scored = adData
    .filter(d => d.monthlyTotal >= 100) // 최소 월 100회 검색
    .map(d => ({
      keyword: d.keyword,
      monthlyTotal: d.monthlyTotal,
      score: calcMoneyScore(d.keyword, d.monthlyTotal, d.competition),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) return scored[0].keyword;

  // 검색량 기준 미달이면 트렌딩 첫 번째
  return allTrending[0];
}

// ── 메인 함수 ──────────────────────────────────────────────────────────────
export async function pickKeywordForUser(userId: string): Promise<string> {
  const supabase = createAdminClient();

  // 1. 대시보드에서 분석된 황금 키워드 우선 사용 (12시간 캐시)
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [{ data: cached }, { data: recentLogs }] = await Promise.all([
    supabase
      .from('bossai_keyword_opportunities')
      .select('keyword, score, can_rank1')
      .eq('user_id', userId)
      .gte('created_at', since)
      .gt('score', 0)
      .order('can_rank1', { ascending: false })
      .order('score', { ascending: false })
      .limit(10),
    supabase
      .from('bossai_schedule_logs')
      .select('result')
      .eq('user_id', userId)
      .gte('started_at', sevenDaysAgo)
      .eq('status', 'success'),
  ]);

  if (cached && cached.length > 0) {
    const usedKeywords = new Set(
      (recentLogs || [])
        .map(l => (l.result as { keyword?: string })?.keyword)
        .filter(Boolean)
    );
    const fresh = cached.find(c => !usedKeywords.has(c.keyword));
    if (fresh) return fresh.keyword;
    return cached[0].keyword;
  }

  // 2. 캐시 없음 → 실시간 트렌딩 + 수익 분석
  return findBestTrendingKeyword();
}
