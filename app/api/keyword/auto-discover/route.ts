import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import crypto from 'crypto';

export const maxDuration = 60;

// ── 월별 진입 시드 (최종 키워드 아님 — 자동완성 입력용 출발점) ─────────────
// 카테고리를 다양하게 섞어 편향 없이 발굴
const ENTRY_SEEDS: Record<number, string[]> = {
  1:  ['독감 증상', '겨울 다이어트', '새해 운동 방법', '피부 건조', '보일러 수리', '적금 추천', '강아지 겨울'],
  2:  ['봄 준비', '건강검진 종류', '미세먼지 마스크', '봄 다이어트', '가습기 추천', '고양이 봄'],
  3:  ['꽃가루 알레르기', '봄 여행지', '봄 코디 방법', '미세먼지 심한날', '봄 식단', '체중 감량'],
  4:  ['황사 예보', '벚꽃 명소', '봄 캠핑', '봄 다이어트 식단', '황사 대처', '봄 아웃도어', '강아지 산책'],
  5:  ['어린이날 선물', '가정의달 선물', '봄 등산 코스', '여름 준비', '자외선차단제', '다이어트 운동'],
  6:  ['에어컨 설치', '장마 대비', '모기 퇴치', '여름 다이어트', '냉방병', '여름 운동법'],
  7:  ['여름 휴가지', '자외선차단제 추천', '피서지 추천', '더위 해소', '여름 피부 관리'],
  8:  ['보양식 추천', '여름 운동', '가을 준비', '환절기 건강', '면역력 강화'],
  9:  ['단풍 여행지', '추석 선물 추천', '가을 코디', '면역력', '환절기 피부'],
  10: ['단풍 명소 추천', '독감 예방접종', '겨울 준비', '가을 다이어트', '보습 크림'],
  11: ['수능 선물', '겨울 패션 코디', '김장 방법', '보일러 관리', '연말 선물'],
  12: ['크리스마스 선물', '연말 여행', '신년 목표', '겨울 다이어트', '연말 정산'],
};

// 뉴스·정치 필터
const NEWS_BLOCK = /대통령|국회|검찰|경찰|재판|구속|선거|투표|주가|환율|사건|사고|사망|폭행|범죄|조작|의혹|비리|갈등|폭락|급등|탄핵|정부|여당|야당/;

function isBlocked(kw: string): boolean {
  return NEWS_BLOCK.test(kw) || kw.length < 4 || kw.length > 20;
}

// ── Naver 자동완성 (API 키 불필요, 실제 검색어만 반환) ───────────────────────
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
    return (arr as string[]).filter(k => typeof k === 'string' && !isBlocked(k)).slice(0, 8);
  } catch { return []; }
}

// ── Naver 검색 API (키 있을 때) ───────────────────────────────────────────────
async function naverSatApi(kw: string, cid: string, secret: string) {
  const h = { 'X-Naver-Client-Id': cid, 'X-Naver-Client-Secret': secret };
  try {
    const [blog, news] = await Promise.all([
      fetch(`https://openapi.naver.com/v1/search/blog?query=${encodeURIComponent(kw)}&display=10&sort=date`, { headers: h, signal: AbortSignal.timeout(5000) }),
      fetch(`https://openapi.naver.com/v1/search/news?query=${encodeURIComponent(kw)}&display=1`, { headers: h, signal: AbortSignal.timeout(5000) }),
    ]);
    const bd = await blog.json() as { total?: number; items?: Array<{ bloggerlink?: string }> };
    const nd = await news.json() as { total?: number };
    const top = bd.items || [];
    const power = top.filter(i => /(blog\.naver\.com|tistory\.com|brunch\.co\.kr)/.test(i.bloggerlink || '')).length;
    return { blog: bd.total || 0, news: nd.total || 0, powerRatio: top.length > 0 ? Math.round(power / top.length * 100) : 0 };
  } catch { return { blog: 0, news: 0, powerRatio: 0 }; }
}

// ── Naver 블로그 스크래핑 폴백 (API 키 없을 때) ───────────────────────────────
async function naverBlogScrape(kw: string): Promise<{ blog: number; news: number; powerRatio: number }> {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  try {
    const [blogRes, newsRes] = await Promise.all([
      fetch(`https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(kw)}`,
        { headers: { 'User-Agent': ua, 'Accept-Language': 'ko-KR,ko;q=0.9' }, signal: AbortSignal.timeout(7000) }),
      fetch(`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(kw)}`,
        { headers: { 'User-Agent': ua, 'Accept-Language': 'ko-KR,ko;q=0.9' }, signal: AbortSignal.timeout(7000) }),
    ]);

    let blogCount = 0;
    let newsCount = 0;

    if (blogRes.ok) {
      const html = await blogRes.text();
      const blogPatterns = [
        /총\s*([\d,]+)\s*건/,
        /"blogTotal"\s*:\s*(\d+)/,
        /blCnt['":\s]+["']?([\d,]+)/,
        /"total"\s*:\s*(\d+)/,
        /class="[^"]*title_num[^"]*"[^>]*>[^<]*?([\d,]+)/,
      ];
      for (const p of blogPatterns) {
        const m = html.match(p);
        if (m?.[1]) { blogCount = parseInt(m[1].replace(/,/g, ''), 10); break; }
      }
    }

    if (newsRes.ok) {
      const html = await newsRes.text();
      const m = html.match(/총\s*([\d,]+)\s*건/) || html.match(/"newsTotal"\s*:\s*(\d+)/);
      if (m?.[1]) newsCount = parseInt(m[1].replace(/,/g, ''), 10);
    }

    return { blog: blogCount, news: newsCount, powerRatio: 0 };
  } catch { return { blog: 0, news: 0, powerRatio: 0 }; }
}

// ── Daum 포화도 (API 우선 → 스크래핑 폴백) ───────────────────────────────────
async function daumSat(kw: string, key: string | null) {
  if (key) {
    try {
      const h = { Authorization: `KakaoAK ${key}` };
      const [b, c] = await Promise.all([
        fetch(`https://dapi.kakao.com/v2/search/blog?query=${encodeURIComponent(kw)}&size=1`, { headers: h, signal: AbortSignal.timeout(5000) }),
        fetch(`https://dapi.kakao.com/v2/search/cafe?query=${encodeURIComponent(kw)}&size=1`, { headers: h, signal: AbortSignal.timeout(5000) }),
      ]);
      const bd = await b.json() as { meta?: { total_count?: number } };
      const cd = await c.json() as { meta?: { total_count?: number } };
      return { blog: bd.meta?.total_count || 0, cafe: cd.meta?.total_count || 0 };
    } catch { /* fallthrough */ }
  }
  try {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    const res = await fetch(`https://search.daum.net/search?w=blog&q=${encodeURIComponent(kw)}`,
      { headers: { 'User-Agent': ua, 'Accept-Language': 'ko-KR,ko;q=0.9' }, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return { blog: 0, cafe: 0 };
    const html = await res.text();
    const patterns = [/([0-9,]+)\s*건/, /총\s*([0-9,]+)/, /"totalCount"\s*:\s*(\d+)/, /data-count="(\d+)"/];
    for (const p of patterns) {
      const m = html.match(p);
      if (m?.[1]) return { blog: parseInt(m[1].replace(/,/g, ''), 10), cafe: 0 };
    }
    return { blog: 0, cafe: 0 };
  } catch { return { blog: 0, cafe: 0 }; }
}

// ── 구글 결과 수 스크래핑 ─────────────────────────────────────────────────────
async function googleCount(kw: string): Promise<number> {
  const uas = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  ];
  for (const ua of uas) {
    try {
      const res = await fetch(`https://www.google.com/search?q=${encodeURIComponent(kw)}&num=1&hl=ko&gl=kr`, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const patterns = [
        /약\s*([\d,]+)\s*개/,
        /About ([\d,]+) results/i,
        /검색결과\s*약\s*([\d,]+)/,
        /id="result-stats"[^>]*>약\s*([\d,]+)/,
        /"([\d]{6,})"/,
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m?.[1]) return parseInt(m[1].replace(/,/g, ''), 10);
      }
    } catch { continue; }
  }
  return 0;
}

// ── Naver Ad API ──────────────────────────────────────────────────────────────
function adHeaders(apiKey: string, secret: string, customerId: string) {
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.GET./keywordstool`);
  return {
    'X-Timestamp': timestamp, 'X-API-KEY': apiKey,
    'X-Customer': customerId, 'X-Signature': hmac.digest('base64'),
    'Content-Type': 'application/json',
  };
}

async function getVolume(kw: string, apiKey: string, secret: string, cid: string) {
  try {
    const res = await fetch(
      `https://api.naver.com/keywordstool?hintKeywords=${encodeURIComponent(kw)}&showDetail=1`,
      { headers: adHeaders(apiKey, secret, cid), signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return { pc: 0, mobile: 0 };
    const data = await res.json() as { keywordList?: Array<{ relKeyword: string; monthlyPcQcCnt: number | string; monthlyMobileQcCnt: number | string }> };
    const m = (data.keywordList || []).find(k => k.relKeyword === kw) || data.keywordList?.[0];
    if (!m) return { pc: 0, mobile: 0 };
    const parse = (v: number | string) => typeof v === 'number' ? v : v === '< 10' ? 5 : parseInt(String(v)) || 0;
    return { pc: parse(m.monthlyPcQcCnt), mobile: parse(m.monthlyMobileQcCnt) };
  } catch { return { pc: 0, mobile: 0 }; }
}

// ── 점수 계산 ─────────────────────────────────────────────────────────────────
function calcGoldenScore(monthly: number, naverBlog: number, daumTotal: number, naverNews: number, powerRatio: number, hasSatData: boolean): number {
  if (!hasSatData && monthly === 0) return 0;
  if (naverNews > 5000) return 0;
  const saturation = naverBlog + daumTotal * 0.5 + naverNews * 0.3;
  if (saturation === 0 && monthly === 0) return 0;
  if (saturation === 0) return 100;
  const ratio = monthly > 0
    ? Math.round(monthly / Math.max(saturation / 1000, 0.1) * 10) / 10
    : Math.round(50000 / Math.max(saturation, 1) * 10);
  const powerPenalty = powerRatio > 70 ? 0.5 : powerRatio > 40 ? 0.8 : 1.0;
  return Math.round(Math.min(ratio * powerPenalty, 9999));
}

function calcDifficulty(naverBlog: number, daumTotal: number, gCount: number, naverNews: number) {
  const w = naverBlog + daumTotal * 0.4 + gCount * 0.0008 + naverNews * 0.8;
  if (w < 3000)   return 'very_easy';
  if (w < 15000)  return 'easy';
  if (w < 60000)  return 'medium';
  if (w < 200000) return 'hard';
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
  difficulty: string, monthly: number, naverBlog: number, powerRatio: number, naverNews: number, goldenScore: number
): { canRank1: boolean; reason: string } {
  if (naverNews > 10000) return { canRank1: false, reason: '언론사 뉴스 도배' };
  if (naverNews > 3000 && naverNews > naverBlog * 2) return { canRank1: false, reason: '뉴스 압도적 — 블로그 밀림' };
  if (naverNews > 1000 && naverBlog < 500) return { canRank1: false, reason: '뉴스 키워드 — 언론사 경쟁' };
  if (powerRatio >= 80) return { canRank1: false, reason: '파워블로거 80%↑ 장악' };
  if (monthly === 0 && naverBlog < 50 && naverNews < 50 && goldenScore < 10) {
    return { canRank1: false, reason: '검색·포화도 모두 없음' };
  }
  if (goldenScore >= 200) return { canRank1: true, reason: `황금비율 ${goldenScore}점 — 즉시 1등 가능` };
  if (difficulty === 'very_easy') {
    if (monthly >= 200 || goldenScore >= 30) return { canRank1: true, reason: '경쟁 없음 + 수요 있음 — 독점 가능' };
    if (naverBlog < 2000 && naverBlog > 0) return { canRank1: true, reason: '블로그 경쟁 극히 낮음' };
  }
  if (difficulty === 'easy') {
    if (monthly >= 500 && powerRatio < 50) return { canRank1: true, reason: '낮은 경쟁 + 검색량 충분' };
    if (monthly >= 100) return { canRank1: true, reason: '낮은 경쟁 + 적정 검색량' };
    if (goldenScore >= 20 && naverBlog < 10000) return { canRank1: true, reason: '포화도 낮음 — 도전 가능' };
  }
  if (difficulty === 'medium' && monthly >= 2000 && powerRatio < 30) {
    return { canRank1: true, reason: '중간 경쟁이지만 검색량 높음 + 파워블로그 少' };
  }
  const reasons: string[] = [];
  if (difficulty === 'hard' || difficulty === 'very_hard') reasons.push('포화도 높음');
  if (powerRatio >= 70) reasons.push('파워블로거 장악');
  if (monthly > 0 && monthly < 50) reasons.push('검색량 너무 낮음');
  return { canRank1: false, reason: reasons.join(' / ') || '경쟁 심함' };
}

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const [naverCid, naverSec, adKey, adSec, adCust, kakaoKey] = await Promise.all([
    getSetting('NAVER_CLIENT_ID'), getSetting('NAVER_CLIENT_SECRET'),
    getSetting('NAVER_AD_API_KEY'), getSetting('NAVER_AD_SECRET'), getSetting('NAVER_AD_CUSTOMER_ID'),
    getSetting('KAKAO_REST_API_KEY'),
  ]);

  const hasNaver = !!(naverCid && naverSec);
  const hasAd = !!(adKey && adSec && adCust);
  const hasDaum = !!kakaoKey;

  const month = new Date().getMonth() + 1;
  const entrySeeds = ENTRY_SEEDS[month] || ENTRY_SEEDS[4];

  // ── STEP 1: 1-hop 자동완성 ────────────────────────────────────────────────
  // 진입 시드 → Naver 자동완성 → 실제 검색어 수집
  const seen = new Set<string>();
  type CandidateSource = 'autocomplete' | 'longtail';
  const hop1: Array<{ keyword: string; source: CandidateSource }> = [];

  const add = (kw: string, src: CandidateSource) => {
    const k = kw.trim();
    if (!k || seen.has(k) || isBlocked(k)) return;
    seen.add(k);
    hop1.push({ keyword: k, source: src });
  };

  // 진입 시드 전체 병렬 자동완성
  const hop1Results = await Promise.all(entrySeeds.map(s => autocomplete(s)));
  hop1Results.forEach(list => list.forEach(kw => add(kw, 'autocomplete')));

  // ── STEP 2: 2-hop 자동완성 ────────────────────────────────────────────────
  // hop1 결과를 다시 자동완성 입력으로 → 더 구체적인 롱테일 발굴
  const hop2Seeds = hop1.slice(0, 10).map(c => c.keyword);
  const hop2Results = await Promise.all(hop2Seeds.map(s => autocomplete(s)));
  hop2Results.forEach(list => list.forEach(kw => add(kw, 'longtail')));

  // ── STEP 3: 포화도 분석 (최대 20개) ──────────────────────────────────────
  const toAnalyze = hop1.slice(0, 20);

  const results = await Promise.all(
    toAnalyze.map(async ({ keyword, source }) => {
      const [ns, ds, gc, vol] = await Promise.all([
        hasNaver
          ? naverSatApi(keyword, naverCid!, naverSec!)
          : naverBlogScrape(keyword),
        daumSat(keyword, kakaoKey ?? null),
        googleCount(keyword),
        hasAd ? getVolume(keyword, adKey!, adSec!, adCust!) : Promise.resolve({ pc: 0, mobile: 0 }),
      ]);

      const monthly = vol.pc + vol.mobile;
      const daumTotal = ds.blog + ds.cafe;
      const hasSatData = ns.blog > 0 || daumTotal > 0 || gc > 0;
      const goldenScore = calcGoldenScore(monthly, ns.blog, daumTotal, ns.news, ns.powerRatio, hasSatData);
      const difficulty = calcDifficulty(ns.blog, daumTotal, gc, ns.news);
      const grade = calcGrade(goldenScore, monthly);
      const { canRank1, reason } = calcCanRank1(difficulty, monthly, ns.blog, ns.powerRatio, ns.news, goldenScore);

      const competitionScore = Math.min(100, Math.round(
        (ns.blog / 100000 * 40) + (daumTotal / 50000 * 20) + (gc / 10000000 * 30) + (ns.powerRatio * 0.1)
      ));

      return {
        keyword, source,
        monthlyPc: vol.pc, monthlyMobile: vol.mobile, monthlyTotal: monthly,
        naverBlog: ns.blog, naverWeb: 0, naverNews: ns.news, naverPowerBlogRatio: ns.powerRatio,
        daumBlog: ds.blog, daumCafe: ds.cafe, googleCount: gc,
        score: goldenScore, grade, difficulty, canRank1, canRank1Reason: reason, competitionScore,
      };
    })
  );

  // ── STEP 4: 황금 키워드 우선 정렬 ────────────────────────────────────────
  const diffOrder: Record<string, number> = { very_easy: 0, easy: 1, medium: 2, hard: 3, very_hard: 4 };
  results.sort((a, b) => {
    if (a.canRank1 !== b.canRank1) return a.canRank1 ? -1 : 1;
    const dd = (diffOrder[a.difficulty] ?? 2) - (diffOrder[b.difficulty] ?? 2);
    if (dd !== 0) return dd;
    return b.score - a.score || b.monthlyTotal - a.monthlyTotal;
  });

  // ── STEP 5: DB 저장 ───────────────────────────────────────────────────────
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

  return NextResponse.json({ results, hasAdApi: hasAd, hasNaverApi: hasNaver, hasDaumApi: hasDaum, discoveredAt: now });
}
