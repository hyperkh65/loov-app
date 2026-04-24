import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import crypto from 'crypto';

export const maxDuration = 60;

// ── 광범위 시드 (카테고리별 일상생활 핵심어) ──────────────────────────────────
// 사람들이 실제로 많이 검색하는 주제 → 자동완성으로 롱테일 발굴
const BASE_SEEDS = [
  // 건강·의료
  '다이어트', '영양제', '탈모', '피부', '허리통증', '수면', '혈당', '콜레스테롤', '갱년기',
  // 육아·반려동물
  '육아', '이유식', '강아지', '고양이', '반려동물',
  // 요리·음식
  '요리', '에어프라이어', '다이어트 식단', '간식 만들기', '밥솥',
  // 뷰티·패션
  '스킨케어', '탈모샴푸', '화장품', '선크림', '다이어트약',
  // 재테크·금융
  '재테크', '적금', '청약', '연금', '절약',
  // 여행·나들이
  '국내여행', '차박', '캠핑', '드라이브코스', '맛집',
  // 가전·인테리어
  '공기청정기', '로봇청소기', '인테리어', '에어컨', '냉장고',
  // 취미·생활
  '독서', '운동', '요가', '홈트', '명상',
];

// 4월 시즌 특화 시드 (현재 달 기준으로 교체됨)
const SEASONAL_SEEDS: Record<number, string[]> = {
  1:  ['신년 목표', '겨울 다이어트', '독감', '피부건조', '새해 운동'],
  2:  ['발렌타인', '봄맞이', '건강검진', '봄 다이어트'],
  3:  ['봄 여행', '꽃가루 알레르기', '미세먼지', '봄 코디', '다이어트 시작'],
  4:  ['봄 나들이', '황사', '봄 캠핑', '벚꽃 명소', '봄 다이어트'],
  5:  ['어버이날 선물', '어린이날', '가정의달', '봄 등산', '여름 준비'],
  6:  ['여름 다이어트', '에어컨', '모기', '장마', '냉방병'],
  7:  ['여름 휴가', '자외선차단제', '피서지', '물놀이', '더위'],
  8:  ['휴가', '여름 운동', '보양식', '가을 준비'],
  9:  ['추석 선물', '단풍 여행', '가을 코디', '면역력'],
  10: ['단풍 명소', '독감 예방접종', '겨울 준비', '가을 다이어트'],
  11: ['겨울 패션', '김장', '수능 선물', '연말 선물', '보일러'],
  12: ['크리스마스 선물', '연말 여행', '연말 다이어트', '신년 계획'],
};

// 롱테일 확장 패턴 (블로그 1등 먹기 좋은 정보성 쿼리)
const EXPANSION_PATTERNS = [
  '{s} 추천',
  '{s} 방법',
  '{s} 효과',
  '{s} 부작용',
  '{s} 가격',
  '{s} 후기',
  '{s} 종류',
  '{s} 원인',
  '{s} 증상',
  '{s} 비교',
];

// 뉴스/정치 키워드 사전 필터
const NEWS_BLOCK = /대통령|국회|검찰|경찰|재판|구속|선거|투표|주가|환율|사건|사고|사망|폭행|범죄|조작|의혹|비리|갈등|폭락|급등/;

function isBlocked(kw: string) {
  return NEWS_BLOCK.test(kw) || kw.length < 4 || kw.length > 22;
}

// 네이버 자동완성 (실제 검색량 있는 롱테일 쿼리)
async function autocomplete(seed: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(seed)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return [];
    const text = await res.text();
    // 첫 번째 배열 파싱: [["kw1","kw2",...],...]
    const idx = text.indexOf('[[');
    if (idx === -1) return [];
    const inner = text.slice(idx + 1);
    const end = inner.indexOf(']]');
    if (end === -1) return [];
    const arr = JSON.parse(inner.slice(0, end + 1)) as unknown[];
    return (arr as string[]).filter(k => typeof k === 'string' && !isBlocked(k)).slice(0, 8);
  } catch { return []; }
}

// Naver Ad API 헤더
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

async function naverSat(kw: string, cid: string, secret: string) {
  const h = { 'X-Naver-Client-Id': cid, 'X-Naver-Client-Secret': secret };
  try {
    const [blog, web, news] = await Promise.all([
      fetch(`https://openapi.naver.com/v1/search/blog?query=${encodeURIComponent(kw)}&display=10&sort=date`, { headers: h, signal: AbortSignal.timeout(5000) }),
      fetch(`https://openapi.naver.com/v1/search/webkr?query=${encodeURIComponent(kw)}&display=1`, { headers: h, signal: AbortSignal.timeout(5000) }),
      fetch(`https://openapi.naver.com/v1/search/news?query=${encodeURIComponent(kw)}&display=1`, { headers: h, signal: AbortSignal.timeout(5000) }),
    ]);
    const bd = await blog.json() as { total?: number; items?: Array<{ bloggerlink?: string }> };
    const wd = await web.json() as { total?: number };
    const nd = await news.json() as { total?: number };
    const top = bd.items || [];
    const power = top.filter(i => /(blog\.naver\.com|tistory\.com|brunch\.co\.kr)/.test(i.bloggerlink || '')).length;
    return { blog: bd.total || 0, web: wd.total || 0, news: nd.total || 0, powerRatio: top.length > 0 ? Math.round(power / top.length * 100) : 0 };
  } catch { return { blog: 0, web: 0, news: 0, powerRatio: 0 }; }
}

async function daumSat(kw: string, key: string) {
  const h = { Authorization: `KakaoAK ${key}` };
  try {
    const [b, c] = await Promise.all([
      fetch(`https://dapi.kakao.com/v2/search/blog?query=${encodeURIComponent(kw)}&size=1`, { headers: h, signal: AbortSignal.timeout(5000) }),
      fetch(`https://dapi.kakao.com/v2/search/cafe?query=${encodeURIComponent(kw)}&size=1`, { headers: h, signal: AbortSignal.timeout(5000) }),
    ]);
    const bd = await b.json() as { meta?: { total_count?: number } };
    const cd = await c.json() as { meta?: { total_count?: number } };
    return { blog: bd.meta?.total_count || 0, cafe: cd.meta?.total_count || 0 };
  } catch { return { blog: 0, cafe: 0 }; }
}

async function googleCount(kw: string): Promise<number> {
  try {
    const res = await fetch(`https://www.google.com/search?q=${encodeURIComponent(kw)}&num=1&hl=ko&gl=kr`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 0;
    const html = await res.text();
    const m = html.match(/약\s*([\d,]+)\s*개/) || html.match(/About ([\d,]+) results/i);
    return m?.[1] ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
  } catch { return 0; }
}

// ── 핵심: 황금 키워드 점수 계산 ──────────────────────────────────────────────
// 검색량 대비 포화도 비율 + 즉시 1등 가능성 종합 점수
function calcGoldenScore(monthly: number, naverBlog: number, daumTotal: number, naverNews: number, powerRatio: number, hasNaverData: boolean): number {
  // API 없이 데이터가 전혀 없으면 0점 (가짜 점수 방지)
  if (!hasNaverData && monthly === 0) return 0;
  if (naverNews > 5000) return 0;
  const saturation = naverBlog + daumTotal * 0.5 + naverNews * 0.3;
  // 포화도와 검색량 모두 없으면 0 (분석 불가)
  if (saturation === 0 && monthly === 0) return 0;
  if (saturation === 0) return 100; // 포화도 0 + 검색량 있으면 독점
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
  // 뉴스 장악
  if (naverNews > 10000) return { canRank1: false, reason: '언론사 뉴스 도배' };
  if (naverNews > 3000 && naverNews > naverBlog * 2) return { canRank1: false, reason: '뉴스 압도적 — 블로그 밀림' };
  if (naverNews > 1000 && naverBlog < 500) return { canRank1: false, reason: '뉴스 키워드 — 언론사 경쟁' };
  // 파워블로거 독점
  if (powerRatio >= 80) return { canRank1: false, reason: '파워블로거 80%↑ 장악' };
  // 완전히 데이터 없음
  if (monthly === 0 && naverBlog < 50 && naverNews < 50 && goldenScore < 10) {
    return { canRank1: false, reason: '검색·포화도 모두 없음' };
  }
  // 황금 점수 기준으로 판단
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
  const seasonSeeds = SEASONAL_SEEDS[month] || [];

  // ── STEP 1: 후보 키워드 수집 ─────────────────────────────────────────────
  // 베이스 시드 + 시즌 시드 합치고, 자동완성으로 실제 검색어 발굴
  const allSeeds = [...new Set([...seasonSeeds, ...BASE_SEEDS.slice(0, 12)])];
  const seen = new Set<string>();
  type CandidateSource = 'seasonal' | 'autocomplete' | 'longtail';
  const candidates: Array<{ keyword: string; source: CandidateSource }> = [];

  const add = (kw: string, src: CandidateSource) => {
    const k = kw.trim();
    if (!k || seen.has(k) || isBlocked(k)) return;
    seen.add(k);
    candidates.push({ keyword: k, source: src });
  };

  // 시즌 키워드 직접 추가
  seasonSeeds.forEach(s => add(s, 'seasonal'));

  // 자동완성으로 롱테일 발굴 (상위 8개 시드만, 병렬)
  const acResults = await Promise.all(allSeeds.slice(0, 8).map(s => autocomplete(s)));
  acResults.forEach(list => list.forEach(kw => add(kw, 'autocomplete')));

  // 짧은 시드(2단어 이하)에 패턴 접미어 붙여 롱테일 생성
  allSeeds.slice(0, 10).forEach(seed => {
    if (seed.split(' ').length <= 2 && !/(방법|추천|후기|가격|효과|종류|원인)/.test(seed)) {
      EXPANSION_PATTERNS.slice(0, 5).forEach(p => add(p.replace('{s}', seed), 'longtail'));
    }
  });

  // ── STEP 2: 포화도 분석 (최대 20개) ──────────────────────────────────────
  const toAnalyze = candidates.slice(0, 20);

  const results = await Promise.all(
    toAnalyze.map(async ({ keyword, source }) => {
      const [ns, ds, gc, vol] = await Promise.all([
        hasNaver ? naverSat(keyword, naverCid!, naverSec!) : Promise.resolve({ blog: 0, web: 0, news: 0, powerRatio: 0 }),
        hasDaum ? daumSat(keyword, kakaoKey!) : Promise.resolve({ blog: 0, cafe: 0 }),
        googleCount(keyword),
        hasAd ? getVolume(keyword, adKey!, adSec!, adCust!) : Promise.resolve({ pc: 0, mobile: 0 }),
      ]);

      const monthly = vol.pc + vol.mobile;
      const daumTotal = ds.blog + ds.cafe;
      const goldenScore = calcGoldenScore(monthly, ns.blog, daumTotal, ns.news, ns.powerRatio, hasNaver);
      const difficulty = calcDifficulty(ns.blog, daumTotal, gc, ns.news);
      const grade = calcGrade(goldenScore, monthly);
      const { canRank1, reason } = calcCanRank1(difficulty, monthly, ns.blog, ns.powerRatio, ns.news, goldenScore);

      const competitionScore = Math.min(100, Math.round(
        (ns.blog / 100000 * 40) + (daumTotal / 50000 * 20) + (gc / 10000000 * 30) + (ns.powerRatio * 0.1)
      ));

      return {
        keyword, source,
        monthlyPc: vol.pc, monthlyMobile: vol.mobile, monthlyTotal: monthly,
        naverBlog: ns.blog, naverWeb: ns.web, naverNews: ns.news, naverPowerBlogRatio: ns.powerRatio,
        daumBlog: ds.blog, daumCafe: ds.cafe, googleCount: gc,
        score: goldenScore, grade, difficulty, canRank1, canRank1Reason: reason, competitionScore,
      };
    })
  );

  // ── STEP 3: 황금 키워드 우선 정렬 ────────────────────────────────────────
  // 1등 가능 → 황금점수 → 난이도
  const diffOrder: Record<string, number> = { very_easy: 0, easy: 1, medium: 2, hard: 3, very_hard: 4 };
  results.sort((a, b) => {
    if (a.canRank1 !== b.canRank1) return a.canRank1 ? -1 : 1;
    const dd = (diffOrder[a.difficulty] ?? 2) - (diffOrder[b.difficulty] ?? 2);
    if (dd !== 0) return dd;
    return b.score - a.score || b.monthlyTotal - a.monthlyTotal;
  });

  // ── STEP 4: DB 저장 ───────────────────────────────────────────────────────
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
