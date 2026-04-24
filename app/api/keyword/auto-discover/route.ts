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

const SEASONAL: Record<number, string[]> = {
  1:  ['신년 다짐 방법', '새해 다이어트 시작', '겨울 여행지 추천', '설날 선물 추천', '한파 건강관리 방법', '겨울 피부 관리'],
  2:  ['설날 음식 만들기', '발렌타인데이 초콜릿 만들기', '봄 준비 운동법', '겨울 마무리 피부관리', '2월 여행지 추천'],
  3:  ['봄 여행지 추천', '벚꽃 개화 시기', '새학기 준비물 목록', '봄 코디 추천', '미세먼지 마스크 추천', '봄 다이어트'],
  4:  ['봄 나들이 장소 추천', '벚꽃 명소 추천', '봄 다이어트 방법', '황사 마스크 추천', '봄 인테리어 아이디어', '꽃가루 알레르기'],
  5:  ['어버이날 선물 추천', '어린이날 선물 추천', '5월 여행지 추천', '스승의날 선물 아이디어', '봄 캠핑 준비물', '가정의달 이벤트'],
  6:  ['여름 준비 운동', '에어컨 청소 방법', '여름 코디 추천', '6월 여행지 추천', '장마 대비 방법', '모기 퇴치 방법'],
  7:  ['여름 휴가지 추천', '물놀이 용품 추천', '자외선 차단제 추천', '여름 다이어트 식단', '피서지 추천', '더위 극복 방법'],
  8:  ['여름 마무리 피부관리', '가을 준비 방법', '광복절 여행 추천', '여름 끝 다이어트', '8월 나들이 장소'],
  9:  ['추석 선물 추천', '가을 여행지 추천', '단풍 명소 추천', '추석 음식 만들기', '가을 코디 추천', '신학기 용품'],
  10: ['단풍 여행지 추천', '가을 나들이 장소', '독감 예방 방법', '가을 인테리어', '핼러윈 파티 준비', '수능 응원 선물'],
  11: ['수능 선물 추천', '김장 재료 가격', '겨울 코트 추천', '연말 뷰티 세일', '겨울 준비 방법', '김장 레시피'],
  12: ['크리스마스 선물 추천', '연말 여행지 추천', '겨울 여행지 추천', '새해 준비 방법', '연말 다이어트', '크리스마스 케이크'],
};

const STOP_WORDS = new Set(['이번', '지난', '현재', '최근', '오늘', '어제', '내일', '올해', '지금', '해당', '관련', '이라', '있어', '되어', '하는', '하고', '에서', '으로', '때문', '위해', '이후', '이전', '매우', '더욱', '또한', '그리고', '하지만', '그러나', '따라서', '실제', '다양한', '여러', '함께', '바로', '이미', '아직', '계속', '점점', '통해', '대한', '대해', '부터', '까지', '없이', '없는', '있는', '없다', '있다']);

async function extractNewsKeywords(naverClientId: string, naverClientSecret: string): Promise<string[]> {
  const queries = ['이슈', '화제', '트렌드', '생활정보'];
  const headers = { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret };

  const freqMap = new Map<string, number>();

  await Promise.all(queries.map(async (q) => {
    try {
      const res = await fetch(
        `https://openapi.naver.com/v1/search/news?query=${encodeURIComponent(q)}&display=30&sort=date`,
        { headers, signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return;
      const data = await res.json() as { items?: Array<{ title: string }> };
      const items = data.items || [];

      for (const item of items) {
        // Strip HTML tags
        const title = item.title.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim();
        // Extract Korean words (2-6 chars)
        const words = (title.match(/[가-힣]{2,6}/g) || []).filter(w => !STOP_WORDS.has(w));

        // 2-word combos
        for (let i = 0; i < words.length - 1; i++) {
          const phrase = `${words[i]} ${words[i + 1]}`;
          if (words[i].length >= 2 && words[i + 1].length >= 2) {
            freqMap.set(phrase, (freqMap.get(phrase) || 0) + 1);
          }
        }
        // 3-word combos
        for (let i = 0; i < words.length - 2; i++) {
          const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
          if (words[i].length >= 2 && words[i + 1].length >= 2 && words[i + 2].length >= 2) {
            freqMap.set(phrase, (freqMap.get(phrase) || 0) + 1);
          }
        }
      }
    } catch { /* ignore */ }
  }));

  // Filter count >= 2 and sort by frequency
  return Array.from(freqMap.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([phrase]) => phrase);
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
  keyword: string,
  apiKey: string,
  secret: string,
  customerId: string
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
    return { canRank1: false, reason: '검색량 없음 — 1등해도 유입 없음' };
  }
  if (difficulty === 'easy') {
    if (monthlyTotal >= 1000 && powerBlogRatio < 50) return { canRank1: true, reason: '쉬운 경쟁 + 검색량 풍부 + 파워블로그 少' };
    if (monthlyTotal >= 200)  return { canRank1: true, reason: '적당한 검색량 + 낮은 경쟁' };
    if (naverBlog < 5000 && monthlyTotal >= 50) return { canRank1: true, reason: '블로그 포화도 낮음' };
  }
  if (difficulty === 'medium' && monthlyTotal >= 2000 && powerBlogRatio < 30) {
    return { canRank1: true, reason: '검색량 높음 + 파워블로그 적음 (도전 가능)' };
  }
  const reasons: string[] = [];
  if (difficulty === 'hard' || difficulty === 'very_hard') reasons.push('포화도 높음');
  if (powerBlogRatio >= 70) reasons.push('파워블로거 상위권 장악');
  if (monthlyTotal < 50) reasons.push('검색량 너무 낮음');
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
  const seasonalKeywords = (SEASONAL[currentMonth] || []).slice(0, 8).map(kw => ({ keyword: kw, source: 'seasonal' as const }));

  // Extract news keywords
  let newsKeywords: Array<{ keyword: string; source: 'news' }> = [];
  if (hasNaverApi) {
    try {
      const extracted = await extractNewsKeywords(naverClientId!, naverClientSecret!);
      newsKeywords = extracted.slice(0, 12).map(kw => ({ keyword: kw, source: 'news' as const }));
    } catch { /* ignore */ }
  }

  // Combine candidates (deduplicate)
  const seen = new Set<string>();
  const candidates: Array<{ keyword: string; source: 'seasonal' | 'news' | 'trend' }> = [];
  for (const item of [...seasonalKeywords, ...newsKeywords]) {
    if (!seen.has(item.keyword)) {
      seen.add(item.keyword);
      candidates.push(item);
    }
  }

  // Parallel saturation analysis
  const results = await Promise.all(
    candidates.slice(0, 20).map(async ({ keyword, source }) => {
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
        : 0;

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
        keyword,
        source,
        monthlyPc: volume.pc,
        monthlyMobile: volume.mobile,
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

  // Sort: canRank1 first, then by score
  const diffOrder: Record<string, number> = { very_easy: 0, easy: 1, medium: 2, hard: 3, very_hard: 4 };
  results.sort((a, b) => {
    if (a.canRank1 !== b.canRank1) return a.canRank1 ? -1 : 1;
    const dd = (diffOrder[a.difficulty] || 0) - (diffOrder[b.difficulty] || 0);
    if (dd !== 0) return dd;
    return b.score - a.score || b.monthlyTotal - a.monthlyTotal;
  });

  // Save to DB (upsert by user_id + keyword)
  const adminDb = await createAdminClient();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  for (const r of results) {
    await adminDb.from('bossai_keyword_opportunities').upsert({
      user_id: user.id,
      keyword: r.keyword,
      source: r.source,
      monthly_total: r.monthlyTotal,
      monthly_pc: r.monthlyPc,
      monthly_mobile: r.monthlyMobile,
      naver_blog: r.naverBlog,
      daum_total: r.daumBlog + r.daumCafe,
      google_count: r.googleCount,
      competition_score: r.competitionScore,
      power_blog_ratio: r.naverPowerBlogRatio,
      difficulty: r.difficulty,
      can_rank1: r.canRank1,
      can_rank1_reason: r.canRank1Reason,
      score: r.score,
      grade: r.grade,
      created_at: now,
      expires_at: expiresAt,
    }, { onConflict: 'user_id,keyword' });
  }

  return NextResponse.json({
    results,
    hasAdApi,
    hasNaverApi,
    hasDaumApi,
    discoveredAt: now,
  });
}
