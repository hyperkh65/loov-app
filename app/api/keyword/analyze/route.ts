import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import crypto from 'crypto';

// Naver Search Ad API HMAC auth
function getNaverAdHeaders(apiKey: string, secret: string, customerId: string, method = 'GET', path = '/keywordstool') {
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${method}.${path}`);
  const signature = hmac.digest('base64');
  return {
    'X-Timestamp': timestamp,
    'X-API-KEY': apiKey,
    'X-Customer': customerId,
    'X-Signature': signature,
    'Content-Type': 'application/json',
  };
}

function getGrade(score: number, monthly: number): 'diamond' | 'gold' | 'silver' | 'bronze' | 'normal' {
  if (score > 200 && monthly > 5000) return 'diamond';
  if (score > 100 && monthly > 1000) return 'gold';
  if (score > 50 && monthly > 200) return 'silver';
  if (score > 10) return 'bronze';
  return 'normal';
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as { keywords: string[]; mode?: 'golden' | 'batch' };
  const { keywords = [], mode = 'golden' } = body;

  if (!keywords.length) return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 });

  const naverClientId = await getSetting('NAVER_CLIENT_ID');
  const naverClientSecret = await getSetting('NAVER_CLIENT_SECRET');
  const naverAdApiKey = await getSetting('NAVER_AD_API_KEY');
  const naverAdSecret = await getSetting('NAVER_AD_SECRET');
  const naverAdCustomerId = await getSetting('NAVER_AD_CUSTOMER_ID');

  const naverHeaders: Record<string, string> = {};
  if (naverClientId && naverClientSecret) {
    naverHeaders['X-Naver-Client-Id'] = naverClientId;
    naverHeaders['X-Naver-Client-Secret'] = naverClientSecret;
  }

  const hasNaverApi = !!(naverClientId && naverClientSecret);
  const hasAdApi = !!(naverAdApiKey && naverAdSecret && naverAdCustomerId);

  interface KeywordResult {
    keyword: string;
    monthlyPc: number;
    monthlyMobile: number;
    monthlyTotal: number;
    competition: number;
    blogCompetition: number;
    score: number;
    grade: 'diamond' | 'gold' | 'silver' | 'bronze' | 'normal';
    isRelated?: boolean;
  }

  const results: KeywordResult[] = [];

  // Golden keyword mode: seed keyword → get related + score
  if (mode === 'golden' && hasAdApi) {
    const seedKeyword = keywords[0];
    try {
      const adHeaders = getNaverAdHeaders(naverAdApiKey, naverAdSecret, naverAdCustomerId);
      const adRes = await fetch(
        `https://api.naver.com/keywordstool?hintKeywords=${encodeURIComponent(seedKeyword)}&showDetail=1`,
        { headers: adHeaders }
      );
      const adData = await adRes.json() as { keywordList?: Array<{ relKeyword: string; monthlyPcQcCnt: number | string; monthlyMobileQcCnt: number | string }> };

      if (adData.keywordList) {
        // Process top keywords (limit to avoid rate limits)
        const keywordsToProcess = adData.keywordList.slice(0, 20);

        for (const k of keywordsToProcess) {
          const monthlyPc = typeof k.monthlyPcQcCnt === 'number' ? k.monthlyPcQcCnt : (k.monthlyPcQcCnt === '< 10' ? 5 : parseInt(String(k.monthlyPcQcCnt)) || 0);
          const monthlyMobile = typeof k.monthlyMobileQcCnt === 'number' ? k.monthlyMobileQcCnt : (k.monthlyMobileQcCnt === '< 10' ? 5 : parseInt(String(k.monthlyMobileQcCnt)) || 0);
          const monthlyTotal = monthlyPc + monthlyMobile;

          let blogCompetition = 0;
          let webCompetition = 0;

          if (hasNaverApi) {
            try {
              const blogRes = await fetch(
                `https://openapi.naver.com/v1/search/blog?query=${encodeURIComponent(k.relKeyword)}&display=1`,
                { headers: naverHeaders }
              );
              const blogData = await blogRes.json() as { total?: number };
              blogCompetition = blogData.total || 0;

              const webRes = await fetch(
                `https://openapi.naver.com/v1/search/webkr?query=${encodeURIComponent(k.relKeyword)}&display=1`,
                { headers: naverHeaders }
              );
              const webData = await webRes.json() as { total?: number };
              webCompetition = webData.total || 0;
            } catch { /* ignore */ }
          }

          const competition = blogCompetition || webCompetition;
          const score = monthlyTotal > 0 ? monthlyTotal / Math.max(competition / 1000, 1) : 0;

          results.push({
            keyword: k.relKeyword,
            monthlyPc,
            monthlyMobile,
            monthlyTotal,
            competition: webCompetition,
            blogCompetition,
            score: Math.round(score * 10) / 10,
            grade: getGrade(score, monthlyTotal),
            isRelated: k.relKeyword !== seedKeyword,
          });

          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 50));
        }
      }
    } catch (e) {
      return NextResponse.json({ error: `Search Ad API 오류: ${String(e)}` }, { status: 500 });
    }
  } else {
    // Batch mode: analyze given keywords with Naver Search API only
    for (const kw of keywords.slice(0, 20)) {
      let blogCompetition = 0;
      let webCompetition = 0;
      let monthlyPc = 0;
      let monthlyMobile = 0;

      if (hasNaverApi) {
        try {
          const [blogRes, webRes] = await Promise.all([
            fetch(`https://openapi.naver.com/v1/search/blog?query=${encodeURIComponent(kw)}&display=1`, { headers: naverHeaders }),
            fetch(`https://openapi.naver.com/v1/search/webkr?query=${encodeURIComponent(kw)}&display=1`, { headers: naverHeaders }),
          ]);
          blogCompetition = ((await blogRes.json()) as { total?: number }).total || 0;
          webCompetition = ((await webRes.json()) as { total?: number }).total || 0;
        } catch { /* ignore */ }
      }

      if (hasAdApi) {
        try {
          const adHeaders = getNaverAdHeaders(naverAdApiKey, naverAdSecret, naverAdCustomerId);
          const adRes = await fetch(
            `https://api.naver.com/keywordstool?hintKeywords=${encodeURIComponent(kw)}&showDetail=1`,
            { headers: adHeaders }
          );
          const adData = await adRes.json() as { keywordList?: Array<{ relKeyword: string; monthlyPcQcCnt: number | string; monthlyMobileQcCnt: number | string }> };
          if (adData.keywordList) {
            const match = adData.keywordList.find(k => k.relKeyword === kw);
            if (match) {
              monthlyPc = typeof match.monthlyPcQcCnt === 'number' ? match.monthlyPcQcCnt : (match.monthlyPcQcCnt === '< 10' ? 5 : parseInt(String(match.monthlyPcQcCnt)) || 0);
              monthlyMobile = typeof match.monthlyMobileQcCnt === 'number' ? match.monthlyMobileQcCnt : (match.monthlyMobileQcCnt === '< 10' ? 5 : parseInt(String(match.monthlyMobileQcCnt)) || 0);
            }
          }
        } catch { /* ignore */ }
      }

      const monthlyTotal = monthlyPc + monthlyMobile;
      const competition = blogCompetition || webCompetition;
      const score = monthlyTotal > 0 ? monthlyTotal / Math.max(competition / 1000, 1) : 0;

      results.push({
        keyword: kw,
        monthlyPc,
        monthlyMobile,
        monthlyTotal,
        competition: webCompetition,
        blogCompetition,
        score: Math.round(score * 10) / 10,
        grade: getGrade(score, monthlyTotal),
      });

      await new Promise(r => setTimeout(r, 50));
    }
  }

  return NextResponse.json({
    results: results.sort((a, b) => b.score - a.score),
    hasAdApi,
    hasNaverApi,
  });
}
