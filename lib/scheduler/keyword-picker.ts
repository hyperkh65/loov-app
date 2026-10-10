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
import { KEYWORD_SEED_BANK } from '@/lib/keyword-seed-bank';

// 키워드 중복 절대 금지 — 전 스케줄/전 사이트 공용, 공백 제거·소문자 기준, 180일.
const norm = (k: string) => k.replace(/\s+/g, '').toLowerCase();
// ponytail: 동시 실행 경합은 프로세스 내 Set으로만 막음(단일 서버). 다중 인스턴스면 DB claim 테이블 필요.
const claimed = new Set<string>();

async function loadUsed(): Promise<Set<string>> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
  const used = new Set(claimed);
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('bossai_schedule_logs')
      .select('result')
      .gte('started_at', since)
      .in('status', ['success', 'running'])
      .not('result->>keyword', 'is', null)
      .range(from, from + 999);
    for (const l of data || []) {
      const k = (l.result as { keyword?: string })?.keyword;
      if (k) used.add(norm(k));
    }
    if (!data || data.length < 1000) break;
  }
  return used;
}

function claim(kw: string): string {
  claimed.add(norm(kw));
  return kw;
}

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
    // 구글이 <title>을 CDATA로 감싸지 않고 그냥 텍스트로 내려주는 경우(특수문자
    // 없는 제목, 예: "전현무")가 실사용 중 대부분이었음 — CDATA만 매칭하던 예전
    // 정규식은 이런 케이스를 전부 놓쳐서 사실상 항상 빈 배열을 반환하고 있었음
    // (구글트렌드 자체는 200 정상 응답인데도). 채널 제목("Daily Search Trends")은
    // 한글이 없어 isUsable()에서 자동으로 걸러짐.
    const re = /<title>(?:<!\[CDATA\[([^\]]+)\]\]>|([^<]+))<\/title>|<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const t = (m[1] || m[2] || '').trim();
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

// 고CPC 금융 키워드(연금/대출/보험 등)는 auto-discover에서 1.5x 가점을 받아
// 상위권을 독점하는데, "연금저축펀드", "IRP 세액공제", "퇴직연금 수령방법"처럼
// 리터럴 문자열은 매번 달라서 기존 exact-match 7일 회피로는 못 걸러지고, 실제로는
// 같은 주제(연금)가 계속 발행되는 스팸처럼 보이는 문제가 실사용 중 확인됨
// (2days.kr/aboda.kr에 "연금저축펀드 vs IRP" 류가 반복). 같은 주제 뿌리를 공유하면
// 리터럴이 달라도 최근 사용으로 취급해서 다른 주제로 강제 분산시킴.
const TOPIC_ROOTS = ['연금', '세액공제', 'IRP', '대출', '보험', '카드', '신용점수', '리볼빙', '저축은행', '환전', '절세', '금리', '증권', '펀드', '주식'];
function sharesTopicRoot(a: string, b: string): boolean {
  return TOPIC_ROOTS.some(root => a.includes(root) && b.includes(root));
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
async function findBestTrendingKeyword(used: Set<string>): Promise<string> {
  // 1. Google Trends에서 실시간 트렌딩 수집
  const [rss, daily] = await Promise.all([
    fetchGoogleTrendsRSS(),
    fetchGoogleDailyTrends(),
  ]);

  const allTrending = [...new Set([...rss, ...daily])].filter(k => isUsable(k) && !used.has(norm(k)));

  if (allTrending.length === 0) {
    // 트렌딩이 비었거나 전부 사용됨 → 시드뱅크에서 안 쓴 것만 무작위 (중복 절대 금지)
    const seeds = Object.values(KEYWORD_SEED_BANK)
      .flatMap(byMonth => Object.values(byMonth).flat())
      .filter(k => isUsable(k) && !used.has(norm(k)));
    if (!seeds.length) throw new Error('사용 가능한 미사용 키워드가 없음');
    return seeds[Math.floor(Math.random() * seeds.length)];
  }

  // 2. 상위 10개 Naver Ad API로 검색량 + 경쟁도 분석
  const topCandidates = allTrending.slice(0, 10);
  const adData = await fetchNaverAdData(topCandidates);

  // Ad API 데이터가 없으면 트렌딩 첫 번째 반환
  if (adData.length === 0) return allTrending[0];

  // 3. Money Score 계산 후 최고 점수 선택
  const scored = adData
    .filter(d => d.monthlyTotal >= 100 && isUsable(d.keyword) && !used.has(norm(d.keyword))) // 최소 월 100회 검색
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

// 고정 키워드 목록에서 선택 — 특정 카테고리(고CPC 등)를 노리는 스케줄용.
// 'rotate'는 인스타/숏츠/아고다 러너 등과 동일하게 schedule.keyword_index를 진짜
// 순환 커서로 써서 매번 다음 키워드로 넘어감 — 예전엔 "최근 7일 안 쓴 것 중
// 배열 맨 앞"이라 목록을 다 쓰고 나면 항상 keywords[0]에 고정되는 버그가
// 있었음(실사용 확인: 고CPC 스케줄이 하루도 안 돼 계속 같은 주제만 나옴).
// 'random'은 기존처럼 최근 7일 회피 + 무작위.
export async function pickFromKeywordList(
  schedule: { id: string; user_id: string; keyword_index: number },
  keywords: string[],
  mode: 'rotate' | 'random' = 'rotate',
): Promise<string | null> {
  if (!keywords.length) throw new Error('키워드 목록이 비어있음');
  const supabase = createAdminClient();
  const used = await loadUsed();
  const start = schedule.keyword_index % keywords.length;

  if (mode === 'rotate') {
    for (let i = 0; i < keywords.length; i++) {
      const idx = (start + i) % keywords.length;
      if (used.has(norm(keywords[idx]))) continue;
      await supabase.from('bossai_schedules').update({ keyword_index: (idx + 1) % keywords.length }).eq('id', schedule.id);
      return claim(keywords[idx]);
    }
    return null; // 목록 소진 → 호출 쪽이 동적/트렌딩 발굴로 넘어감
  }

  const fresh = keywords.filter(k => !used.has(norm(k)));
  return fresh.length ? claim(fresh[Math.floor(Math.random() * fresh.length)]) : null;
}

// 고CPC 등 특정 카테고리로 좁혀서 동적 발굴 — 대시보드/크론이 채워둔
// bossai_keyword_opportunities에서 그 카테고리만 가져옴. 후보가 없으면 null을
// 반환해서 호출 쪽이 정적 목록으로 폴백하게 함 — pickKeywordForUser()의 범용
// 폴백(findBestTrendingKeyword, 결국엔 "다이어트 보조제 추천" 등)은 카테고리와
// 무관해서 고CPC 전용 스케줄엔 안 맞음.
export async function pickDynamicKeywordByCategory(
  schedule: { user_id: string },
  category: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [{ data: cached }, { data: recentLogs }, used] = await Promise.all([
    supabase
      .from('bossai_keyword_opportunities')
      .select('keyword, score, can_rank1')
      .eq('user_id', schedule.user_id)
      .eq('category', category)
      .gte('created_at', since)
      .gt('score', 0)
      .order('can_rank1', { ascending: false })
      .order('score', { ascending: false })
      .limit(20),
    supabase
      .from('bossai_schedule_logs')
      .select('result')
      .eq('user_id', schedule.user_id)
      .gte('started_at', sevenDaysAgo)
      .eq('status', 'success'),
    loadUsed(),
  ]);
  const unused = (cached || []).filter(c => !used.has(norm(c.keyword)));
  if (!unused.length) return null;

  const recent = (recentLogs || []).map(l => (l.result as { keyword?: string })?.keyword).filter(Boolean) as string[];
  const pick = unused.find(c => !recent.some(u => sharesTopicRoot(u, c.keyword))) || unused[0];
  return claim(pick.keyword);
}

// 고CPC 스케줄이 목록/발굴 후보를 다 쓰면 무관한 범용 키워드(플리츠원피스 등)로 새는 걸
// 막기 위해, 같은 카테고리의 시드뱅크(3000+개 목록)에서 안 쓴 것을 이번 달 우선으로 순환.
export async function pickSeedByCategory(category: string): Promise<string | null> {
  const bank = KEYWORD_SEED_BANK[category];
  if (!bank) return null;
  const used = await loadUsed();
  const month = new Date().getMonth() + 1;
  const ordered = [...(bank[month] || []), ...Object.entries(bank).filter(([m]) => Number(m) !== month).flatMap(([, v]) => v)];
  const fresh = ordered.filter(k => isUsable(k) && !used.has(norm(k)));
  if (!fresh.length) return null;
  const top = fresh.slice(0, Math.max(1, Math.min(fresh.length, bank[month]?.filter(k => !used.has(norm(k))).length || fresh.length)));
  return claim(top[Math.floor(Math.random() * top.length)]);
}

// ── 메인 함수 ──────────────────────────────────────────────────────────────
export async function pickKeywordForUser(userId: string): Promise<string> {
  const supabase = createAdminClient();

  // 1. 대시보드에서 분석된 황금 키워드 우선 사용 (12시간 캐시)
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [{ data: cached }, { data: recentLogs }, used] = await Promise.all([
    supabase
      .from('bossai_keyword_opportunities')
      .select('keyword, score, can_rank1')
      .eq('user_id', userId)
      // 'twenties'는 yellow.2days.kr 전용 발굴(20대 연령 가점이 곱해져 score가
      // calcGoldenScore의 원래 상한(9999)을 넘어설 수 있음, 실사용 중 13999점
      // "대마도배편"이 발견됨) — 카테고리 구분 없는 이 함수가 그 점수를 그대로
      // 가져가면 여기서 상한을 뚫은 값이 항상 1등을 차지해버림.
      .neq('category', 'twenties')
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
    loadUsed(),
  ]);

  if (cached && cached.length > 0) {
    const recent = (recentLogs || [])
      .map(l => (l.result as { keyword?: string })?.keyword)
      .filter(Boolean) as string[];
    const unused = cached.filter(c => !used.has(norm(c.keyword)));
    const fresh = unused.find(c => !recent.some(u => sharesTopicRoot(u, c.keyword))) || unused[0];
    if (fresh) return claim(fresh.keyword);
  }

  // 2. 캐시 없음/전부 소진 → 실시간 트렌딩 + 수익 분석
  return claim(await findBestTrendingKeyword(used));
}
