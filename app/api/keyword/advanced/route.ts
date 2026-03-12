/**
 * 고급 키워드 분석 API
 * localchat/KeywordPulse 기법을 LOOV에 통합 & 고도화
 *
 * actions:
 *   GET  ?action=trending          → 실시간 트렌딩 (Google + Naver + Daum)
 *   POST action=analyze   keyword  → 딥 키워드 분석 (Money Score)
 *   GET  ?action=blog-rank&keyword → 블로그 상위 랭킹 (Naver + Daum)
 *   POST action=content-guide kw   → Gemini AI 콘텐츠 전략
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
export const runtime = 'edge';
export const preferredRegion = ['icn1', 'hnd1'];

// ── Money Score 계산 ────────────────────────────────────────────────────────
function calcMoneyScore(p: {
  monthlyTotal: number;
  competition: string;   // 'high' | 'medium' | 'low'
  blogPosts: number;     // 해당 키워드 블로그 문서수
  keyword: string;
}): { score: number; grade: 'S'|'A'|'B'|'C'|'D'; detail: Record<string, number> } {
  const { monthlyTotal: vol, competition, blogPosts, keyword } = p;

  // 1) 검색량 점수 (25%) - 1,000~10,000 최적
  const volScore = vol < 100 ? vol / 100 * 30
    : vol < 1000 ? 30 + (vol - 100) / 900 * 40
    : vol < 10000 ? 70 + (vol - 1000) / 9000 * 30
    : Math.max(55, 100 - (vol - 10000) / 100000 * 45);

  // 2) 광고 경쟁도 점수 (20%) - 높은 경쟁 = 높은 CPC = 돈이 됨
  const compScore = competition === 'high' ? 90 : competition === 'medium' ? 60 : 30;

  // 3) CPC 추정 점수 (25%)
  const cpcEst = competition === 'high' ? 1800 : competition === 'medium' ? 900 : 300;
  const cpcScore = Math.min(100, cpcEst / 18);

  // 4) 구매 의도 점수 (20%)
  const kw = keyword.toLowerCase();
  const intentScore =
    /구매|주문|가격|얼마|할인|쿠폰|추천|후기|리뷰|best|최고|좋은|선택/.test(kw) ? 90
    : /방법|방식|하는법|알아보기|정보|꿀팁|팁/.test(kw) ? 65
    : /뜻|의미|란|이란|개념|정의/.test(kw) ? 20
    : 50;

  // 5) 포화도 역수 점수 (10%) - 블루오션일수록 높음
  const satRatio = vol > 0 ? blogPosts / vol : 99;
  const satScore = satRatio < 0.5 ? 100 : satRatio < 2 ? 80 : satRatio < 10 ? 50 : 20;

  const total = volScore * 0.25 + compScore * 0.20 + cpcScore * 0.25 + intentScore * 0.20 + satScore * 0.10;
  const score = Math.round(total * 10) / 10;
  const grade = score >= 90 ? 'S' : score >= 70 ? 'A' : score >= 50 ? 'B' : score >= 30 ? 'C' : 'D';
  return { score, grade, detail: { volScore: Math.round(volScore), compScore, cpcScore: Math.round(cpcScore), intentScore, satScore } };
}

// ── 네이버 검색광고 API ─────────────────────────────────────────────────────
async function naverAdSign(timestamp: number, method: string, path: string, secret: string) {
  const msg = `${timestamp}.${method}.${path}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function fetchNaverAd(keywords: string[]): Promise<Array<{
  relKeyword: string; monthlyPcQcCnt: number; monthlyMobileQcCnt: number;
  compIdx: string; plAvgDepth: number;
}>> {
  const [apiKey, secret, customerId] = await Promise.all([
    getSetting('NAVER_AD_API_KEY'), getSetting('NAVER_AD_SECRET'), getSetting('NAVER_AD_CUSTOMER_ID'),
  ]);
  if (!apiKey || !secret || !customerId) return [];

  const timestamp = Date.now();
  const path = '/keywordstool';
  const sig = await naverAdSign(timestamp, 'GET', path, secret);
  const qs = keywords.map(k => `hintKeywords=${encodeURIComponent(k)}`).join('&') + '&showDetail=1';
  try {
    const res = await fetch(`https://api.searchad.naver.com${path}?${qs}`, {
      headers: {
        'X-Timestamp': String(timestamp),
        'X-API-KEY': apiKey,
        'X-Customer': customerId,
        'X-Signature': sig,
      },
    });
    if (!res.ok) return [];
    const data = await res.json() as { keywordList?: Array<{ relKeyword: string; monthlyPcQcCnt: number; monthlyMobileQcCnt: number; compIdx: string; plAvgDepth: number }> };
    return data.keywordList || [];
  } catch { return []; }
}

async function fetchNaverSearch(endpoint: 'news' | 'blog' | 'shop', query: string, sort = 'sim', display = 20): Promise<Array<{title: string; link: string; description?: string; bloggername?: string; postdate?: string; pubDate?: string; lprice?: string; mallName?: string;}>> {
  const [clientId, clientSecret] = await Promise.all([
    getSetting('NAVER_CLIENT_ID'), getSetting('NAVER_CLIENT_SECRET'),
  ]);
  if (!clientId || !clientSecret) return [];
  const qs = new URLSearchParams({ query, display: String(display), sort });
  try {
    const res = await fetch(`https://openapi.naver.com/v1/search/${endpoint}.json?${qs}`, {
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
    });
    if (!res.ok) return [];
    const d = await res.json() as { items?: Array<{title: string; link: string; description?: string; bloggername?: string; postdate?: string; pubDate?: string; lprice?: string; mallName?: string}> };
    return d.items || [];
  } catch { return []; }
}

// ── 카카오/다음 API ──────────────────────────────────────────────────────────
async function fetchKakao(type: 'blog' | 'web' | 'cafe', query: string, size = 10): Promise<Array<{title: string; url: string; contents?: string; blogname?: string; datetime?: string;}>> {
  const kakaoKey = await getSetting('KAKAO_REST_API_KEY');
  if (!kakaoKey) return [];
  const qs = new URLSearchParams({ query, size: String(size), sort: 'recency' });
  try {
    const res = await fetch(`https://dapi.kakao.com/v2/search/${type}?${qs}`, {
      headers: { Authorization: `KakaoAK ${kakaoKey}` },
    });
    if (!res.ok) return [];
    const d = await res.json() as { documents?: Array<{title: string; url: string; contents?: string; blogname?: string; datetime?: string}> };
    return d.documents || [];
  } catch { return []; }
}

// ── Google Trends 스크래핑 (API 키 불필요) ───────────────────────────────────
const UA_POOL = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
];
function randomUA() { return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]; }

async function fetchGoogleDailyTrends(): Promise<string[]> {
  try {
    const res = await fetch(
      'https://trends.google.com/trends/api/dailytrends?geo=KR&hl=ko&tz=-540&ns=15',
      { headers: { 'User-Agent': randomUA(), 'Accept-Language': 'ko-KR,ko;q=0.9' } }
    );
    const text = await res.text();
    const json = JSON.parse(text.replace(/^\)\]\}'/, '').trim()) as {
      default?: { trendingSearchesDays?: Array<{ trendingSearches?: Array<{ title?: { query?: string } }> }> };
    };
    const trends: string[] = [];
    for (const day of json.default?.trendingSearchesDays || []) {
      for (const t of day.trendingSearches || []) {
        if (t.title?.query) trends.push(t.title.query);
      }
    }
    return trends.slice(0, 20);
  } catch { return []; }
}

async function fetchGoogleRealtimeTrends(): Promise<string[]> {
  try {
    const res = await fetch(
      'https://trends.google.com/trends/api/realtimetrends?geo=KR&hl=ko&tz=-540&cat=all&fi=0&fs=0&ri=300&rs=20&sort=0',
      { headers: { 'User-Agent': randomUA(), 'Accept-Language': 'ko-KR,ko;q=0.9' } }
    );
    const text = await res.text();
    const json = JSON.parse(text.replace(/^\)\]\}'/, '').trim()) as {
      storySummaries?: { trendingStories?: Array<{ entityNames?: string[] }> };
    };
    const trends: string[] = [];
    for (const story of json.storySummaries?.trendingStories || []) {
      for (const name of story.entityNames || []) trends.push(name);
    }
    return [...new Set(trends)].slice(0, 20);
  } catch { return []; }
}

async function fetchGoogleTrendsRSS(): Promise<string[]> {
  try {
    const res = await fetch('https://trends.google.com/trending/rss?geo=KR', {
      headers: { 'User-Agent': randomUA() },
    });
    const xml = await res.text();
    const titles: string[] = [];
    const re = /<title><!\[CDATA\[([^\]]+)\]\]><\/title>|<title>([^<]+)<\/title>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const t = m[1] || m[2];
      if (t && !t.includes('Google') && t.trim()) titles.push(t.trim());
    }
    return titles.slice(0, 20);
  } catch { return []; }
}

// ── Gemini AI 분석 ───────────────────────────────────────────────────────────
async function askGemini(prompt: string): Promise<string | null> {
  const key = await getSetting('GEMINI_API_KEY');
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const d = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

function cleanTitle(t: string) {
  return t.replace(/<\/?b>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

// ════════════════════════════════════════════════════════════════════════════
// GET handler
// ════════════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  // ── 실시간 트렌딩 ─────────────────────────────────────────────────────────
  if (action === 'trending') {
    try {
      // 모든 소스 병렬 수집
      const [googleDaily, googleRealtime, googleRSS, naverNewsItems, daumWebItems] = await Promise.allSettled([
        fetchGoogleDailyTrends(),
        fetchGoogleRealtimeTrends(),
        fetchGoogleTrendsRSS(),
        fetchNaverSearch('news', '오늘 이슈 화제', 'date', 30),
        fetchKakao('web', '실시간 인기 트렌드', 15),
      ]);

      // 키워드 빈도 카운팅
      const freq: Record<string, { count: number; sources: Set<string> }> = {};
      function addKw(kw: string, source: string, weight = 1) {
        const k = kw.trim().replace(/\s+/g, ' ');
        if (k.length < 2 || k.length > 20) return;
        if (!freq[k]) freq[k] = { count: 0, sources: new Set() };
        freq[k].count += weight;
        freq[k].sources.add(source);
      }

      // Google Trends 키워드 (가중치 높음)
      for (const kw of (googleDaily.status === 'fulfilled' ? googleDaily.value : [])) addKw(kw, 'google', 10);
      for (const kw of (googleRealtime.status === 'fulfilled' ? googleRealtime.value : [])) addKw(kw, 'google_rt', 12);
      for (const kw of (googleRSS.status === 'fulfilled' ? googleRSS.value : [])) addKw(kw, 'google_rss', 8);

      // 네이버 뉴스 제목에서 키워드 추출
      const naverNews = naverNewsItems.status === 'fulfilled' ? naverNewsItems.value : [];
      for (const item of naverNews) {
        const title = cleanTitle(item.title || '');
        // 2~4 어절 구문 추출
        const words = title.split(/[\s·,\[\]()]/g).filter(w => w.length >= 2 && w.length <= 10);
        for (let i = 0; i < words.length - 1; i++) {
          addKw(`${words[i]} ${words[i+1]}`, 'naver_news', 3);
        }
        for (const w of words) if (w.length >= 3) addKw(w, 'naver_news', 1);
      }

      // 다음/카카오 웹 검색
      const daumWeb = daumWebItems.status === 'fulfilled' ? daumWebItems.value : [];
      for (const item of daumWeb) {
        const title = cleanTitle(item.title || '');
        const words = title.split(/[\s·,\[\]()]/g).filter(w => w.length >= 2 && w.length <= 10);
        for (let i = 0; i < words.length - 1; i++) addKw(`${words[i]} ${words[i+1]}`, 'daum', 2);
        for (const w of words) if (w.length >= 3) addKw(w, 'daum', 1);
      }

      // 상위 50 정렬
      const sorted = Object.entries(freq)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 50);

      // 네이버 Ad API로 상위 20개 검색량 보강
      const top20 = sorted.slice(0, 20).map(([kw]) => kw);
      const adData = await fetchNaverAd(top20);
      const adMap: Record<string, { pc: number; mobile: number; total: number; comp: string }> = {};
      for (const item of adData) {
        const pc = Number(item.monthlyPcQcCnt) || 0;
        const mobile = Number(item.monthlyMobileQcCnt) || 0;
        adMap[item.relKeyword] = { pc, mobile, total: pc + mobile, comp: item.compIdx };
      }

      const results = sorted.map(([kw, { count, sources }]) => {
        const ad = adMap[kw];
        const ms = ad ? calcMoneyScore({
          monthlyTotal: ad.total, competition: ad.comp as 'high'|'medium'|'low',
          blogPosts: 0, keyword: kw,
        }) : null;
        return {
          keyword: kw,
          score: count,
          sources: [...sources],
          monthlyTotal: ad?.total || 0,
          monthlyPc: ad?.pc || 0,
          monthlyMobile: ad?.mobile || 0,
          competition: ad?.comp || '',
          moneyScore: ms?.score || 0,
          moneyGrade: ms?.grade || '',
        };
      });

      // 소스별 통계
      const sourceStat = {
        google: (googleDaily.status === 'fulfilled' ? googleDaily.value.length : 0)
               + (googleRealtime.status === 'fulfilled' ? googleRealtime.value.length : 0),
        googleRSS: googleRSS.status === 'fulfilled' ? googleRSS.value.length : 0,
        naverNews: naverNews.length,
        daum: daumWeb.length,
      };

      return NextResponse.json({ results, sourceStat, fetchedAt: new Date().toISOString() });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  // ── 블로그 랭킹 ───────────────────────────────────────────────────────────
  if (action === 'blog-rank') {
    const keyword = searchParams.get('keyword') || '';
    const myBlog = searchParams.get('myblog') || '';
    if (!keyword) return NextResponse.json({ error: '키워드 필요' }, { status: 400 });

    const [naverBlogs, daumBlogs] = await Promise.all([
      fetchNaverSearch('blog', keyword, 'sim', 30),
      fetchKakao('blog', keyword, 20),
    ]);

    const posts = [
      ...naverBlogs.map((b, i) => ({
        rank: i + 1,
        title: cleanTitle(b.title || ''),
        url: b.link || '',
        author: b.bloggername || '',
        date: b.postdate || '',
        source: '네이버' as const,
        isMyBlog: myBlog ? (b.link || '').includes(myBlog) : false,
      })),
      ...daumBlogs.map((b, i) => ({
        rank: naverBlogs.length + i + 1,
        title: cleanTitle(b.title || ''),
        url: b.url || '',
        author: b.blogname || '',
        date: b.datetime ? b.datetime.slice(0, 10) : '',
        source: '다음' as const,
        isMyBlog: myBlog ? (b.url || '').includes(myBlog) : false,
      })),
    ];

    // 플랫폼 분포 분석
    const naverCount = posts.filter(p => p.source === '네이버').length;
    const daumCount = posts.filter(p => p.source === '다음').length;
    const myRank = myBlog ? posts.findIndex(p => p.isMyBlog) + 1 || null : null;

    // 제목 패턴 분석
    const titleWords: Record<string, number> = {};
    for (const p of posts.slice(0, 10)) {
      for (const w of p.title.split(/\s+/)) {
        if (w.length >= 2) titleWords[w] = (titleWords[w] || 0) + 1;
      }
    }
    const topWords = Object.entries(titleWords).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w, c]) => ({ word: w, count: c }));

    return NextResponse.json({ posts, naverCount, daumCount, myRank, topWords, totalCount: posts.length });
  }

  return NextResponse.json({ error: 'action 파라미터 필요 (trending|blog-rank)' }, { status: 400 });
}

// ════════════════════════════════════════════════════════════════════════════
// POST handler
// ════════════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as { action: string; keyword?: string; keywords?: string[] };
  const { action, keyword } = body;

  // ── 딥 키워드 분석 ─────────────────────────────────────────────────────────
  if (action === 'analyze') {
    if (!keyword?.trim()) return NextResponse.json({ error: '키워드 필요' }, { status: 400 });
    const kw = keyword.trim();

    // 병렬로 모든 소스 수집
    const [adResults, naverBlogs, naverNews, daumBlogs, daumWeb, googleSuggest] = await Promise.allSettled([
      fetchNaverAd([kw]),
      fetchNaverSearch('blog', kw, 'sim', 30),
      fetchNaverSearch('news', kw, 'date', 10),
      fetchKakao('blog', kw, 15),
      fetchKakao('web', kw, 10),
      fetchGoogleTrendsSuggestions(kw),
    ]);

    // 검색량 및 경쟁도
    const adList = adResults.status === 'fulfilled' ? adResults.value : [];
    const mainAd = adList.find(a => a.relKeyword === kw) || adList[0];
    const monthlyPc = Number(mainAd?.monthlyPcQcCnt) || 0;
    const monthlyMobile = Number(mainAd?.monthlyMobileQcCnt) || 0;
    const monthlyTotal = monthlyPc + monthlyMobile;
    const competition = mainAd?.compIdx || 'low';

    // 관련 키워드 (광고 API 반환)
    const relatedKeywords = adList.slice(0, 15).map(a => ({
      keyword: a.relKeyword,
      pc: Number(a.monthlyPcQcCnt) || 0,
      mobile: Number(a.monthlyMobileQcCnt) || 0,
      total: (Number(a.monthlyPcQcCnt) || 0) + (Number(a.monthlyMobileQcCnt) || 0),
      competition: a.compIdx,
    }));

    // 블로그 포화도
    const naverBlogCount = naverBlogs.status === 'fulfilled' ? naverBlogs.value.length : 0;
    const daumBlogCount = daumBlogs.status === 'fulfilled' ? daumBlogs.value.length : 0;
    const totalBlogPosts = naverBlogCount + daumBlogCount;

    // Money Score
    const { score: moneyScore, grade: moneyGrade, detail } = calcMoneyScore({
      monthlyTotal, competition: competition as 'high'|'medium'|'low', blogPosts: totalBlogPosts, keyword: kw,
    });

    // 소스별 최신 콘텐츠
    const latestNaverBlogs = (naverBlogs.status === 'fulfilled' ? naverBlogs.value : []).slice(0, 5).map(b => ({
      title: cleanTitle(b.title || ''),
      url: b.link || '',
      author: b.bloggername || '',
      date: b.postdate || '',
      source: '네이버블로그',
    }));
    const latestDaumBlogs = (daumBlogs.status === 'fulfilled' ? daumBlogs.value : []).slice(0, 5).map(b => ({
      title: cleanTitle(b.title || ''),
      url: b.url || '',
      author: b.blogname || '',
      date: b.datetime?.slice(0, 10) || '',
      source: '다음블로그',
    }));
    const latestNews = (naverNews.status === 'fulfilled' ? naverNews.value : []).slice(0, 5).map(n => ({
      title: cleanTitle(n.title || ''),
      url: n.link || '',
      date: n.pubDate || '',
      source: '네이버뉴스',
    }));

    // Google 연관 검색어
    const googleRelated = googleSuggest.status === 'fulfilled' ? googleSuggest.value : [];

    // CPC 추정
    const cpcEstimate = competition === 'high' ? 1800 : competition === 'medium' ? 900 : 300;

    // 트렌드 곡선 (DataLab)
    const trendCurve = await fetchNaverDataLab(kw);

    return NextResponse.json({
      keyword: kw,
      monthlyPc, monthlyMobile, monthlyTotal,
      competition, cpcEstimate,
      moneyScore, moneyGrade, detail,
      relatedKeywords,
      totalBlogPosts, naverBlogCount, daumBlogCount,
      latestContent: [...latestNaverBlogs, ...latestDaumBlogs, ...latestNews],
      googleRelated,
      trendCurve,
      hasAdApi: !!mainAd,
    });
  }

  // ── AI 콘텐츠 가이드 ───────────────────────────────────────────────────────
  if (action === 'content-guide') {
    if (!keyword?.trim()) return NextResponse.json({ error: '키워드 필요' }, { status: 400 });
    const kw = keyword.trim();

    const prompt = `당신은 네이버 블로그 SEO 전문가입니다. 키워드 "${kw}"에 대한 블로그 콘텐츠 전략을 JSON으로 작성해주세요.

다음 형식으로 응답하세요 (JSON만, 설명 없이):
{
  "title": "최적 블로그 제목 (키워드 포함, 클릭 유도)",
  "titleVariants": ["대안 제목 1", "대안 제목 2", "대안 제목 3"],
  "contentStructure": ["H2 섹션 1", "H2 섹션 2", "H2 섹션 3", "H2 섹션 4", "H2 섹션 5"],
  "wordCount": 1500,
  "targetAudience": "타겟 독자층 설명",
  "seoTips": ["SEO 팁 1", "SEO 팁 2", "SEO 팁 3"],
  "relatedKeywords": ["롱테일 키워드 1", "롱테일 키워드 2", "롱테일 키워드 3", "롱테일 키워드 4", "롱테일 키워드 5"],
  "hashtags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "intro": "도입부 샘플 문장 2~3문장",
  "postingTime": "최적 포스팅 시간대",
  "contentType": "정보형/리뷰형/후기형/비교형 중 가장 적합한 유형",
  "difficulty": "쉬움/보통/어려움",
  "estimatedTraffic": "예상 월 유입 수 (예: 500~1,000)"
}`;

    const result = await askGemini(prompt);
    if (!result) return NextResponse.json({ error: 'Gemini API 키를 설정해주세요.' }, { status: 400 });

    try {
      const jsonStr = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const guide = JSON.parse(jsonStr);
      return NextResponse.json({ keyword: kw, guide });
    } catch {
      return NextResponse.json({ keyword: kw, rawGuide: result });
    }
  }

  // ── 트렌딩 키워드 일괄 분석 (AI 종합) ──────────────────────────────────────
  if (action === 'analyze-trending') {
    const keywords: string[] = body.keywords || [];
    if (!keywords.length) return NextResponse.json({ error: '키워드 목록 필요' }, { status: 400 });

    const prompt = `당신은 디지털 마케팅 전문가입니다. 다음 트렌딩 키워드들을 분석해주세요:
${keywords.slice(0, 20).join(', ')}

다음 JSON 형식으로 응답하세요:
{
  "summary": "현재 트렌드 종합 분석 (2~3문장)",
  "topPicks": [
    {"keyword": "키워드1", "reason": "선택 이유", "contentIdea": "콘텐츠 아이디어"},
    {"keyword": "키워드2", "reason": "선택 이유", "contentIdea": "콘텐츠 아이디어"},
    {"keyword": "키워드3", "reason": "선택 이유", "contentIdea": "콘텐츠 아이디어"}
  ],
  "categories": [
    {"name": "카테고리명", "keywords": ["kw1", "kw2"]}
  ],
  "opportunity": "지금 당장 써야 할 가장 좋은 기회 키워드와 이유"
}`;

    const result = await askGemini(prompt);
    if (!result) return NextResponse.json({ error: 'Gemini API 키 필요' }, { status: 400 });
    try {
      const jsonStr = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return NextResponse.json({ analysis: JSON.parse(jsonStr) });
    } catch {
      return NextResponse.json({ rawAnalysis: result });
    }
  }

  return NextResponse.json({ error: 'action 파라미터 필요 (analyze|content-guide|analyze-trending)' }, { status: 400 });
}

// ── 네이버 DataLab 트렌드 곡선 ────────────────────────────────────────────────
async function fetchNaverDataLab(keyword: string): Promise<Array<{ period: string; ratio: number }>> {
  const [clientId, clientSecret] = await Promise.all([
    getSetting('NAVER_CLIENT_ID'), getSetting('NAVER_CLIENT_SECRET'),
  ]);
  if (!clientId || !clientSecret) return [];
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.setMonth(now.getMonth() - 6)).toISOString().slice(0, 10);
  try {
    const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: start, endDate: end, timeUnit: 'week',
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
      }),
    });
    const d = await res.json() as { results?: Array<{ data: Array<{ period: string; ratio: number }> }> };
    return d.results?.[0]?.data || [];
  } catch { return []; }
}

// ── Google Trends 자동완성 ────────────────────────────────────────────────────
async function fetchGoogleTrendsSuggestions(keyword: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://trends.google.com/trends/api/autocomplete/${encodeURIComponent(keyword)}?hl=ko&geo=KR`,
      { headers: { 'User-Agent': randomUA() } }
    );
    const text = await res.text();
    const json = JSON.parse(text.replace(/^\)\]\}'/, '').trim()) as {
      default?: { topics?: Array<{ mid?: string; title?: string; type?: string }> };
    };
    return (json.default?.topics || []).map(t => t.title || '').filter(Boolean).slice(0, 10);
  } catch { return []; }
}
