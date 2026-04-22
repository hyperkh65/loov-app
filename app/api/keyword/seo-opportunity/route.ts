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

// Naver blog/web 포화도
async function getNaverSaturation(keyword: string, clientId: string, clientSecret: string) {
  const headers = { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret };
  try {
    const [blogRes, webRes] = await Promise.all([
      fetch(`https://openapi.naver.com/v1/search/blog?query=${encodeURIComponent(keyword)}&display=1`, { headers, signal: AbortSignal.timeout(4000) }),
      fetch(`https://openapi.naver.com/v1/search/webkr?query=${encodeURIComponent(keyword)}&display=1`, { headers, signal: AbortSignal.timeout(4000) }),
    ]);
    const blogData = await blogRes.json() as { total?: number };
    const webData = await webRes.json() as { total?: number };
    return { blog: blogData.total || 0, web: webData.total || 0 };
  } catch {
    return { blog: 0, web: 0 };
  }
}

// Daum 블로그/카페 포화도 (Kakao API)
async function getDaumSaturation(keyword: string, kakaoKey: string) {
  const headers = { Authorization: `KakaoAK ${kakaoKey}` };
  try {
    const [blogRes, cafeRes] = await Promise.all([
      fetch(`https://dapi.kakao.com/v2/search/blog?query=${encodeURIComponent(keyword)}&size=1`, { headers, signal: AbortSignal.timeout(4000) }),
      fetch(`https://dapi.kakao.com/v2/search/cafe?query=${encodeURIComponent(keyword)}&size=1`, { headers, signal: AbortSignal.timeout(4000) }),
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

// Google 검색결과 수 추정 (server-side 스크래핑)
async function getGoogleCount(keyword: string): Promise<number> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&num=1&hl=ko&gl=kr`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return 0;
    const html = await res.text();
    // 한국어 "약 X개 결과" / 영어 "About X results"
    const m = html.match(/약\s*([\d,]+)\s*개/) ||
              html.match(/result-stats[^>]*>[^<]*?([\d,]+)\s*개/) ||
              html.match(/About ([\d,]+) results/i) ||
              html.match(/"([\d]{4,})"/); // fallback numeric
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

function calcDifficulty(naverBlog: number, daumBlog: number, googleCount: number): 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard' {
  const total = naverBlog + daumBlog * 0.5 + googleCount * 0.001;
  if (total < 5000)    return 'very_easy';
  if (total < 20000)   return 'easy';
  if (total < 80000)   return 'medium';
  if (total < 300000)  return 'hard';
  return 'very_hard';
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
    getSetting('KAKAO_REST_API_KEY') || process.env.KAKAO_REST_API_KEY,
  ]);

  const hasNaverApi = !!(naverClientId && naverClientSecret);
  const hasAdApi = !!(naverAdApiKey && naverAdSecret && naverAdCustomerId);

  // Step 1: 관련 키워드 수집 (Naver Ad API)
  let relatedKeywords: Array<{ keyword: string; monthlyPc: number; monthlyMobile: number }> = [];

  if (hasAdApi) {
    try {
      const headers = getNaverAdHeaders(naverAdApiKey, naverAdSecret, naverAdCustomerId);
      const res = await fetch(
        `https://api.naver.com/keywordstool?hintKeywords=${encodeURIComponent(keyword.trim())}&showDetail=1`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      const data = await res.json() as { keywordList?: Array<{ relKeyword: string; monthlyPcQcCnt: number | string; monthlyMobileQcCnt: number | string }> };
      relatedKeywords = (data.keywordList || []).slice(0, 20).map(k => ({
        keyword: k.relKeyword,
        monthlyPc: typeof k.monthlyPcQcCnt === 'number' ? k.monthlyPcQcCnt : (k.monthlyPcQcCnt === '< 10' ? 5 : parseInt(String(k.monthlyPcQcCnt)) || 0),
        monthlyMobile: typeof k.monthlyMobileQcCnt === 'number' ? k.monthlyMobileQcCnt : (k.monthlyMobileQcCnt === '< 10' ? 5 : parseInt(String(k.monthlyMobileQcCnt)) || 0),
      }));
    } catch (e) {
      return NextResponse.json({ error: `Naver Ad API 오류: ${e}` }, { status: 500 });
    }
  } else {
    // Ad API 없으면 시드 키워드만 분석
    relatedKeywords = [{ keyword: keyword.trim(), monthlyPc: 0, monthlyMobile: 0 }];
  }

  // Step 2: 각 키워드 포화도 병렬 분석 (최대 15개)
  const toAnalyze = relatedKeywords.slice(0, 15);

  const analysisResults = await Promise.all(
    toAnalyze.map(async (k) => {
      const [naverSat, daumSat, googleCount] = await Promise.all([
        hasNaverApi ? getNaverSaturation(k.keyword, naverClientId!, naverClientSecret!) : Promise.resolve({ blog: 0, web: 0 }),
        kakaoKey ? getDaumSaturation(k.keyword, kakaoKey) : Promise.resolve({ blog: 0, cafe: 0 }),
        getGoogleCount(k.keyword),
      ]);

      const monthlyTotal = k.monthlyPc + k.monthlyMobile;
      const totalSaturation = naverSat.blog + daumSat.blog + daumSat.cafe;
      const score = monthlyTotal > 0
        ? Math.round(monthlyTotal / Math.max(totalSaturation / 1000, 1) * 10) / 10
        : 0;

      const difficulty = calcDifficulty(naverSat.blog, daumSat.blog + daumSat.cafe, googleCount);
      const grade = calcGrade(score, monthlyTotal);

      return {
        keyword: k.keyword,
        monthlyPc: k.monthlyPc,
        monthlyMobile: k.monthlyMobile,
        monthlyTotal,
        naverBlog: naverSat.blog,
        naverWeb: naverSat.web,
        daumBlog: daumSat.blog,
        daumCafe: daumSat.cafe,
        googleCount,
        score,
        grade,
        difficulty,
        canRank1: difficulty === 'very_easy' || (difficulty === 'easy' && monthlyTotal >= 100),
      };
    })
  );

  // Step 3: 1등 가능 키워드 우선 정렬
  analysisResults.sort((a, b) => {
    const diffOrder = { very_easy: 0, easy: 1, medium: 2, hard: 3, very_hard: 4 };
    if (a.canRank1 !== b.canRank1) return a.canRank1 ? -1 : 1;
    return diffOrder[a.difficulty] - diffOrder[b.difficulty] || b.score - a.score;
  });

  return NextResponse.json({
    results: analysisResults,
    hasAdApi,
    hasNaverApi,
    hasDaumApi: !!kakaoKey,
  });
}
