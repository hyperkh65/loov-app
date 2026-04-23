import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import crypto from 'crypto';

export const maxDuration = 60;

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

async function getNaverSaturation(keyword: string, clientId: string, clientSecret: string) {
  const headers = { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret };
  try {
    const [blogRes, webRes, newsRes] = await Promise.all([
      fetch(`https://openapi.naver.com/v1/search/blog?query=${encodeURIComponent(keyword)}&display=10&sort=date`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`https://openapi.naver.com/v1/search/webkr?query=${encodeURIComponent(keyword)}&display=1`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`https://openapi.naver.com/v1/search/news?query=${encodeURIComponent(keyword)}&display=1`, { headers, signal: AbortSignal.timeout(5000) }),
    ]);
    const blogData = await blogRes.json() as { total?: number; items?: Array<{ bloggername?: string; bloggerlink?: string; postdate?: string }> };
    const webData = await webRes.json() as { total?: number };
    const newsData = await newsRes.json() as { total?: number };

    // 상위 블로그 링크 분석 (파워블로거 비율)
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
    return {
      blog: blogData.meta?.total_count || 0,
      cafe: cafeData.meta?.total_count || 0,
    };
  } catch {
    return { blog: 0, cafe: 0 };
  }
}

async function getGoogleCount(keyword: string): Promise<number> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&num=1&hl=ko&gl=kr`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 0;
    const html = await res.text();
    const m = html.match(/약\s*([\d,]+)\s*개/) ||
              html.match(/About ([\d,]+) results/i) ||
              html.match(/"([\d]{5,})"/);
    if (m?.[1]) return parseInt(m[1].replace(/,/g, ''), 10);
    return 0;
  } catch {
    return 0;
  }
}

function calcGrade(score: number, monthly: number): 'diamond' | 'gold' | 'silver' | 'bronze' | 'normal' {
  if (score >= 300 && monthly >= 3000) return 'diamond';
  if (score >= 100 && monthly >= 500)  return 'gold';
  if (score >= 40  && monthly >= 100)  return 'silver';
  if (score >= 10)                     return 'bronze';
  return 'normal';
}

function calcDifficulty(naverBlog: number, daumTotal: number, googleCount: number) {
  const weighted = naverBlog + daumTotal * 0.4 + googleCount * 0.0008;
  if (weighted < 3000)   return 'very_easy';
  if (weighted < 15000)  return 'easy';
  if (weighted < 60000)  return 'medium';
  if (weighted < 200000) return 'hard';
  return 'very_hard';
}

function calcCanRank1(
  difficulty: string,
  monthlyTotal: number,
  naverBlog: number,
  powerBlogRatio: number,
): { canRank1: boolean; reason: string } {
  if (difficulty === 'very_easy') {
    if (monthlyTotal >= 500) return { canRank1: true, reason: '경쟁 매우 낮음 + 충분한 검색량' };
    if (monthlyTotal > 0)    return { canRank1: true, reason: '경쟁 매우 낮음 (틈새시장)' };
    return { canRank1: true, reason: '경쟁 매우 낮음 — 독점 가능' };
  }
  if (difficulty === 'easy') {
    if (monthlyTotal >= 1000 && powerBlogRatio < 50) return { canRank1: true, reason: '쉬운 경쟁 + 검색량 풍부 + 파워블로그 少' };
    if (monthlyTotal >= 200)  return { canRank1: true, reason: '적당한 검색량 + 낮은 경쟁' };
    if (naverBlog < 5000)     return { canRank1: true, reason: '블로그 포화도 낮음' };
  }
  if (difficulty === 'medium' && monthlyTotal >= 2000 && powerBlogRatio < 30) {
    return { canRank1: true, reason: '검색량 높음 + 파워블로그 적음 (도전 가능)' };
  }
  const reasons: string[] = [];
  if (difficulty === 'hard' || difficulty === 'very_hard') reasons.push('포화도 높음');
  if (powerBlogRatio >= 70) reasons.push('파워블로거 상위권 장악');
  return { canRank1: false, reason: reasons.join(' / ') || '경쟁 심함' };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { keyword } = await req.json() as { keyword: string };
  if (!keyword?.trim()) return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 });

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

  // Step 1: 관련 키워드 수집
  let relatedKeywords: Array<{ keyword: string; monthlyPc: number; monthlyMobile: number }> = [];

  if (hasAdApi) {
    try {
      const headers = getNaverAdHeaders(naverAdApiKey!, naverAdSecret!, naverAdCustomerId!);
      const res = await fetch(
        `https://api.naver.com/keywordstool?hintKeywords=${encodeURIComponent(keyword.trim())}&showDetail=1`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      const data = await res.json() as { keywordList?: Array<{ relKeyword: string; monthlyPcQcCnt: number | string; monthlyMobileQcCnt: number | string }> };
      relatedKeywords = (data.keywordList || []).slice(0, 25).map(k => ({
        keyword: k.relKeyword,
        monthlyPc: typeof k.monthlyPcQcCnt === 'number' ? k.monthlyPcQcCnt : (k.monthlyPcQcCnt === '< 10' ? 5 : parseInt(String(k.monthlyPcQcCnt)) || 0),
        monthlyMobile: typeof k.monthlyMobileQcCnt === 'number' ? k.monthlyMobileQcCnt : (k.monthlyMobileQcCnt === '< 10' ? 5 : parseInt(String(k.monthlyMobileQcCnt)) || 0),
      }));
    } catch (e) {
      return NextResponse.json({ error: `Naver Ad API 오류: ${e}` }, { status: 500 });
    }
  } else {
    relatedKeywords = [{ keyword: keyword.trim(), monthlyPc: 0, monthlyMobile: 0 }];
  }

  // Step 2: 병렬 포화도 분석 (최대 20개)
  const toAnalyze = relatedKeywords.slice(0, 20);

  const analysisResults = await Promise.all(
    toAnalyze.map(async (k) => {
      const [naverSat, daumSat, googleCount] = await Promise.all([
        hasNaverApi ? getNaverSaturation(k.keyword, naverClientId!, naverClientSecret!) : Promise.resolve({ blog: 0, web: 0, news: 0, powerBlogRatio: 0 }),
        hasDaumApi ? getDaumSaturation(k.keyword, kakaoKey!) : Promise.resolve({ blog: 0, cafe: 0 }),
        getGoogleCount(k.keyword),
      ]);

      const monthlyTotal = k.monthlyPc + k.monthlyMobile;
      const daumTotal = daumSat.blog + daumSat.cafe;
      const totalSaturation = naverSat.blog + daumTotal;
      const score = monthlyTotal > 0
        ? Math.round(monthlyTotal / Math.max(totalSaturation / 1000, 1) * 10) / 10
        : 0;

      const difficulty = calcDifficulty(naverSat.blog, daumTotal, googleCount);
      const grade = calcGrade(score, monthlyTotal);
      const { canRank1, reason } = calcCanRank1(difficulty, monthlyTotal, naverSat.blog, naverSat.powerBlogRatio);

      // 경쟁강도 0-100
      const competitionScore = Math.min(100, Math.round(
        (naverSat.blog / 100000 * 40) +
        (daumTotal / 50000 * 20) +
        (googleCount / 10000000 * 30) +
        (naverSat.powerBlogRatio * 0.1)
      ));

      return {
        keyword: k.keyword,
        monthlyPc: k.monthlyPc,
        monthlyMobile: k.monthlyMobile,
        monthlyTotal,
        naverBlog: naverSat.blog,
        naverWeb: naverSat.web,
        naverNews: naverSat.news,
        naverPowerBlogRatio: naverSat.powerBlogRatio,
        daumBlog: daumSat.blog,
        daumCafe: daumSat.cafe,
        googleCount,
        score,
        grade,
        difficulty,
        canRank1,
        canRank1Reason: reason,
        competitionScore,
      };
    })
  );

  // Step 3: 정렬 — 1등 가능 우선 → 기회점수 → 검색량
  const diffOrder = { very_easy: 0, easy: 1, medium: 2, hard: 3, very_hard: 4 };
  analysisResults.sort((a, b) => {
    if (a.canRank1 !== b.canRank1) return a.canRank1 ? -1 : 1;
    const dd = diffOrder[a.difficulty] - diffOrder[b.difficulty];
    if (dd !== 0) return dd;
    return b.score - a.score || b.monthlyTotal - a.monthlyTotal;
  });

  return NextResponse.json({
    results: analysisResults,
    hasAdApi,
    hasNaverApi,
    hasDaumApi,
    seedKeyword: keyword.trim(),
  });
}
