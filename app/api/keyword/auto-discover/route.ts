import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { fetchFeedItems } from '@/lib/rewrite-site-scraper';
import { generateText } from '@/lib/auto-blog-ai';
import { XMLParser } from 'fast-xml-parser';
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

// 뉴스·정치 필터 — 라이프스타일 카테고리 전용. 금융 카테고리는 정부/정책/
// 대출/환율 같은 단어가 오히려 핵심이라 이 필터를 안 씀(아래 FINANCE_NEWS_BLOCK 참고)
const NEWS_BLOCK = /대통령|국회|검찰|경찰|재판|구속|선거|투표|주가|환율|사건|사고|사망|폭행|범죄|조작|의혹|비리|갈등|폭락|급등|탄핵|정부|여당|야당/;

// ── 금융 카테고리 진입 시드 — 계절보다 정책 일정(연말정산/종소세 등) 기반 ──
const FINANCE_ENTRY_SEEDS: Record<number, string[]> = {
  1:  ['연말정산 환급', '청년도약계좌', '대출금리 비교', '실손보험 갱신', '신용점수 올리기'],
  2:  ['연말정산 추가납부', '전세자금대출', '자동차보험료 비교', '청약통장 금리'],
  3:  ['종합소득세 신고', '건강보험료 조정', '대환대출', '저축은행 금리'],
  4:  ['종합소득세 환급', '주택청약 조건', '신용카드 추천', '보험료 비교'],
  5:  ['근로장려금 신청', '청년 정책자금', '전세보증금 대출', '실비보험 비교'],
  6:  ['하반기 정부지원금', '대출 한도 조회', 'ISA 계좌', '연금저축 세액공제'],
  7:  ['재산세 납부', '전세대출 금리', '카드 리볼빙', '건강보험 환급금'],
  8:  ['종합부동산세', '주택담보대출', '보험 리모델링', '신용대출 한도'],
  9:  ['국민연금 조기수령', '자동차세 연납', '적금 금리비교', '청년희망적금'],
  10: ['근로장려금 정기신청', '전세사기 예방', '보험료 절약', '신용점수 관리'],
  11: ['연말정산 미리보기', '13월의 월급', '카드 캐시백', '대출 갈아타기'],
  12: ['연말정산 준비', '기부금 세액공제', '연금저축 추가납입', '보험 리모델링'],
};

// 금융 카테고리는 정책·정부지원 관련어가 핵심이라 라이프스타일용 뉴스 차단
// 필터를 그대로 쓰면 안 됨 — 순수 연예/스포츠/사건사고 노이즈만 걸러냄
const FINANCE_NEWS_BLOCK = /연예인|아이돌|드라마|예능|축구|야구|올림픽|월드컵|살인|폭행 사건|성범죄/;

// 금융/보험/대출 키워드는 검색량 대비 CPC(광고 단가)가 유난히 높은 카테고리라
// "황금점수"만으로는 실제 수익성을 못 잡음 — 이 패턴에 걸리면 가점
const HIGH_CPC_PATTERNS = /대출|보험|카드|투자|환전|세무|절세|연금|저축은행|신용점수|리볼빙|담보대출|신용대출|이자|금리|증권|펀드|주식/;

// ── AI/전자제품 리뷰 카테고리 진입 시드 — 제품 출시 캘린더 기반(애플 9월,
// 갤럭시 언팩 1월/7월, CES 1월, 블랙프라이데이/연말 가전 할인 11~12월) ──
const TECH_ENTRY_SEEDS: Record<number, string[]> = {
  1:  ['CES 신제품', '노트북 추천', 'AI 스피커', '로봇청소기 추천'],
  2:  ['무선이어폰 추천', '태블릿 추천', 'AI 기능 비교'],
  3:  ['그래픽카드 추천', '모니터 추천', 'SSD 추천', '키보드 마우스 추천'],
  4:  ['공기청정기 추천', '건조기 추천', 'AI 챗봇 비교', '스마트워치 추천'],
  5:  ['캠핑용품 전자기기', '제습기 추천', '빔프로젝터 추천', '블루투스 스피커'],
  6:  ['에어컨 추천', '냉장고 추천', 'AI 카메라', '미니PC 추천'],
  7:  ['선풍기 추천', '휴대용 에어컨', '보조배터리 추천'],
  8:  ['노트북 신제품', 'AI 번역기', '무선청소기 추천', '가성비 이어폰'],
  9:  ['애플워치 리뷰', 'AI 에이전트'],
  10: ['난방가전 추천', '가습기 추천', 'AI 검색엔진'],
  11: ['블랙프라이데이 가전', '연말 가전 할인', 'AI PC', '게이밍 노트북'],
  12: ['크리스마스 전자기기 선물', '연말 가전 세일', 'AI 스피커 선물', '스마트홈 기기'],
};

// "아이폰 신제품"처럼 막연한 문구로는 네이버 연관어 확장이 구형 모델(과거 누적
// 데이터가 많은 쪽)로 쏠려서 정작 진짜 최신 모델명 자체가 시드에 없으면 못 잡는
// 문제를 실사용 중 확인함(아이폰18 실제 월 122만 검색인데 시드가 "아이폰
// 신제품"이라 놓침). 정확한 모델명을 직접 시드로 넣어야 하는데, 연도가 바뀌면
// 모델 번호도 바뀌니 매번 손으로 고치지 않도록 공식 발매 주기로 계산한다
// (애플 아이폰16=2024, 삼성 갤럭시는 S+연도뒤2자리 표기 — 둘 다 업계 표준 패턴).
function currentYearModelSeeds(): string[] {
  const year = new Date().getFullYear();
  const iphoneN = 16 + (year - 2024);
  const galaxyN = year - 2000;
  return [
    `아이폰${iphoneN}`, `아이폰${iphoneN}프로`, `아이폰${iphoneN}프로맥스`,
    `갤럭시S${galaxyN}`, `갤럭시S${galaxyN}울트라`,
  ];
}

// 순수 연예/스포츠/사건사고만 걸러냄 — 정치/경제 필터는 안 씀(리뷰 글엔 무관)
const TECH_NEWS_BLOCK = /연예인|아이돌|드라마|예능|축구|야구|올림픽|월드컵|살인|폭행 사건|성범죄|국회|검찰|탄핵/;

// "리뷰/후기/비교/추천/가격" 등 구매 의도가 뚜렷한 키워드는 실제 쿠팡파트너스/
// 애드센스 수익 전환이 더 잘 되는 편이라 가점
const TECH_HIGH_VALUE_PATTERNS = /리뷰|후기|비교|추천|가격|구매|할인|쿠폰|언박싱|사용기|장단점|어떤게\s*좋/;

// ── 20대 전용 카테고리(yellow.2days.kr) — 실시간 신호(커뮤니티/구글트렌드)가
// 하나도 안 잡힐 때만 쓰는 최후 폴백 시드 ──
const TWENTIES_ENTRY_SEEDS: Record<number, string[]> = {
  1:  ['새해 목표 세우기', '자취 필수템', '다이어트 자극', '취준 자소서', '겨울 소개팅룩'],
  2:  ['졸업 선물 추천', '새학기 준비물', '알바 추천', '봄 소개팅룩', '헬스장 등록'],
  3:  ['새내기 대학생활', '자취 인테리어', '벚꽃놀이 코디', '면접룩 추천', '자기계발 루틴'],
  4:  ['봄 축제 일정', '데이트 코스 추천', '자취요리 레시피', '피부관리 루틴', '중고거래 꿀팁'],
  5:  ['페스티벌 룩', '캠퍼스 커플룩', '여행 짐싸기', '헬스 식단', '자취방 꾸미기'],
  6:  ['여름 다이어트', '휴가 계획 세우기', '물놀이룩', '자취 에어컨', '취업 스터디'],
  7:  ['여름 페스티벌', '워터파크 준비물', '휴가지 추천', '자취 냉방비', '방학 알바'],
  8:  ['가을 신상 추천', '개강 준비물', '가을 소개팅룩', '자소서 첨삭', '헬스 벌크업'],
  9:  ['추석 알바', '가을 축제', 'OOTD 유행템', '취업 공채 시즌', '자취 난방비'],
  10: ['할로윈 코디', '연말 파티룩', '겨울 신상', '취준 면접 후기', '자취 김장'],
  11: ['수능 끝 계획', '연말 모임룩', '크리스마스 데이트', '겨울 헬스 루틴', '연말정산 알바'],
  12: ['크리스마스 코디', '연말 파티 준비', '새해맞이 여행', '신년 다이어트 목표', '방학 자기계발'],
};

// 정치·범죄·사건사고만 차단 — 20대 콘텐츠에서 아이돌/연예/드라마는 오히려
// 핵심 소재라 다른 카테고리와 달리 연예 필터를 걸지 않음
const TWENTIES_NEWS_BLOCK = /국회|검찰|경찰|재판|구속|선거|투표|탄핵|정부|여당|야당|사망|부고|숨져|숨진|별세|타계|폭행|범죄|조작|의혹|비리|폭락|급등|참사|화재|자살/;

// 구글트렌드 KR RSS는 전연령 혼합이라 20대 관심사 패턴으로만 걸러서 씀
const TWENTIES_MATCH = /연애|소개팅|자취|원룸|다이어트|헬스|취준|자소서|면접|알바|아이돌|콘서트|페스티벌|축제|게임|유행|밈|챌린지|OOTD|여행|굿즈|콜라보|팝업스토어|대학생|캠퍼스/i;

// 커뮤니티 원문 제목이 자동완성/광고API를 거치며 HTML 엔티티가 안 풀리거나
// (&quot; 등) 특수문자가 섞인 채로 나오는 걸 실사용 중 확인(2026-09-23,
// "&QUOT부캉이" 같은 깨진 키워드가 실제로 결과에 섞여 나옴) — 이런 잡음은
// 애초에 후보에서 제외
const GARBAGE_CHARS = /[&"'<>]/;

type KeywordCategory = 'lifestyle' | 'finance' | 'tech' | 'twenties';

function isBlocked(kw: string, category: KeywordCategory): boolean {
  const block = category === 'finance' ? FINANCE_NEWS_BLOCK
    : category === 'tech' ? TECH_NEWS_BLOCK
    : category === 'twenties' ? TWENTIES_NEWS_BLOCK
    : NEWS_BLOCK;
  return block.test(kw) || kw.length < 4 || kw.length > 20 || GARBAGE_CHARS.test(kw);
}

// 시드를 "이번 달엔 이런 걸 검색하지 않을까" 하는 추측(FINANCE_ENTRY_SEEDS)에만
// 의존하면, 아래 단계가 아무리 진짜 데이터를 가져와도 결국 추측한 시드의
// 연관어일 뿐임 — 실제 신호 2종을 시드에 섞어서 이 한계를 줄인다.
const TREND_FINANCE_MATCH = /대출|보험|연금|세금|정책|지원금|복지|수당|급여|금리|환율|주식|투자|부동산|전세|월세|청약|카드|적금|예금|증권|펀드|세액공제|국민연금|건강보험|실업급여|공제|납부|신고|환급/;
const TREND_TECH_MATCH = /아이폰|갤럭시|애플|삼성|노트북|이어폰|스마트워치|태블릿|AI|인공지능|챗GPT|GPT|로봇청소기|그래픽카드|모니터|스피커|가전|전자제품|출시|리뷰|언박싱/i;

// ── 시드 A: 구글 트렌드 실시간 급상승검색어(한국) — "지금 실제로 사람들이
// 찾는 것" 신호. 전체 트렌드는 연예/스포츠가 대부분이라 포지티브 매칭으로 거름 ──
async function googleTrendsSeeds(matchRegex: RegExp): Promise<string[]> {
  try {
    // 구글이 예전 daily/rss 엔드포인트를 없애고 /trending/rss로 옮김(2026-09 확인) —
    // 예전 URL은 조용히 404만 뱉어서 이 함수가 항상 빈 배열만 반환하고 있었음
    const res = await fetch('https://trends.google.com/trending/rss?geo=KR', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const doc = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
    const items = ([] as unknown[]).concat(doc.rss?.channel?.item ?? []);
    const titles = items
      .map(it => String((it as Record<string, unknown>)?.title ?? '').trim())
      .filter(Boolean);
    return titles.filter(t => matchRegex.test(t)).slice(0, 10);
  } catch { return []; }
}

// ── 시드 B: 이미 finance.2days.kr로 라우팅된 실제 파이낸셜뉴스 기사 제목 —
// 캘린더 추측이 아니라 오늘 실제 보도된 정책/금리 뉴스 자체를 시드로 씀.
// 문장이라도 네이버 광고API가 매칭 안 되면 빈 배열만 돌아오니 안전(별도 NLP 불필요) ──
async function financeNewsHeadlineSeeds(): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data: site } = await admin
      .from('wordpress_sites').select('id')
      .eq('site_url', 'https://finance.2days.kr').single();
    if (!site) return [];
    const { data: sources } = await admin
      .from('bossai_rewrite_sources')
      .select('feed_url')
      .eq('publish_wp_site_id', site.id)
      .eq('is_active', true);
    if (!sources?.length) return [];
    const feeds = await Promise.all(
      sources.map(s => s.feed_url ? fetchFeedItems(s.feed_url, 5) : Promise.resolve([]))
    );
    const titles = feeds.flat().map(it => it.title.trim()).filter(Boolean);
    return titles.slice(0, 15);
  } catch { return []; }
}

// ── 시드 C(20대 전용): 20대가 실제로 모이는 공개 커뮤니티 인기글 제목 —
// 인스타그램/틱톡 개인 피드·해시태그는 로그인 장벽과 계정 정지 리스크가 있어
// 직접 스크래핑을 시도하지 않았고(실제로 이 세션에서 TikTok Creative
// Center/유튜브 트렌딩도 확인해봤지만 둘 다 JS로 렌더링돼서 정적 스크래핑이
// 안 됨을 확인함), 대신 로그인 없이 그대로 보이는 공개 인기글 목록 3곳을
// 직접 확인해서 실제로 동작하는 선택자만 채택함(2026-09-23 확인). 원문
// 제목을 그대로 최종 키워드로 쓰지 않고 financeNewsHeadlineSeeds()와 같은
// 방식으로 자동완성 입력용 시드로만 사용 ──
// 커뮤니티 원문 제목엔 &quot;/&amp; 같은 HTML 엔티티, 따옴표가 섞여 있는 경우가
// 많아 그대로 시드로 쓰면 자동완성/광고API 응답까지 깨진 채로 전파됨(실사용
// 확인) — 시드 단계에서 미리 정리
function cleanCommunityTitle(t: string): string {
  return t
    .replace(/&quot;/gi, '').replace(/&amp;/gi, '&').replace(/&#39;|&apos;/gi, '')
    .replace(/&lt;/gi, '').replace(/&gt;/gi, '')
    .replace(/["'“”‘’]/g, '')
    .trim();
}

async function communityTrendingTitlesRaw(): Promise<string[]> {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const fetchTitles = async (url: string, pattern: RegExp): Promise<string[]> => {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': ua, 'Accept-Language': 'ko-KR,ko;q=0.9' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const html = await res.text();
      return [...html.matchAll(pattern)]
        .map(m => cleanCommunityTitle(m[1]))
        .filter(t => t && t.length <= 60);
    } catch { return []; }
  };

  const [fm, qoo, pann] = await Promise.all([
    // 에펨코리아 유머 게시판(실질적 "실시간 베스트" 역할, best/best2는 JS 렌더링이라 빈 결과)
    fetchTitles('https://www.fmkorea.com/humor', /<a href="\/\d+" class="title">([^<]{4,80})/g),
    // 더쿠 이슈 게시판
    fetchTitles('https://theqoo.net/hot', /<a href="\/hot\/\d+"[^>]*>([^<]{4,80})/g),
    // 네이트판 톡톡 랭킹
    fetchTitles('https://pann.nate.com/talk/ranking/d', /<a href="\/talk\/\d+"\s+onclick="[^"]*"\s+title="([^"]{4,80})"/g),
  ]);
  return [...fm, ...qoo, ...pann].slice(0, 45);
}

// 커뮤니티 원문 제목은 완전한 문장·감탄사·구어체라(예: "결혼 3주 남았는데
// 파혼해야될까") 그대로 자동완성 API에 넣으면 "안내해서"/"남자친구를" 같은
// 문장 조각이 관련 키워드로 튀어나오는 걸 실사용 중 확인함(2026-09-23) —
// 정규식으로는 "이게 진짜 검색될 만한 명사구인지" 판단이 안 돼서, AI에게
// 문장에서 실제 검색 키워드만 뽑아내게 한 단계를 추가. 이 호출이 실패해도
// 원문 제목을 그대로 폴백으로 써서(품질은 낮아도) 전체 발굴이 죽지 않게 함.
async function communityTrendingSeeds(): Promise<string[]> {
  const raw = await communityTrendingTitlesRaw();
  if (!raw.length) return [];
  try {
    const prompt = `다음은 한국 온라인 커뮤니티 인기글 제목 목록이다. 각 제목이 다루는 화제 중
20대가 실제로 네이버/구글 검색창에 입력할 법한 짧은 키워드(명사 또는 명사구,
2~8글자, 완전한 문장이나 조사로 끝나는 문장 조각 절대 금지)만 최대 15개 뽑아라.
정치·사망·사건사고·자극적 어그로성 낚시 제목은 제외.

제목 목록:
${raw.join('\n')}

출력은 키워드 하나당 한 줄, 번호나 설명 없이 키워드만 출력해.`;
    const out = await generateText(prompt, 'qwen3');
    const extracted = out.split('\n')
      .map(l => l.replace(/^[-*\d.\s]+/, '').trim())
      .filter(k => k && k.length >= 2 && k.length <= 20 && !/[.,!?]$/.test(k));
    return extracted.length ? extracted.slice(0, 15) : raw;
  } catch {
    return raw; // AI 추출 실패해도 원문 제목으로 폴백 — 발굴 자체는 계속 진행
  }
}

// ── Naver 자동완성 (API 키 불필요, 실제 검색어만 반환) ───────────────────────
async function autocomplete(seed: string, category: KeywordCategory): Promise<string[]> {
  try {
    // con=1&frm=nv&ans=2 파라미터 조합은 "items"가 항상 비어있고 대신
    // "answer"(브랜드/기관 바로가기용 구조화 블록, 예: ["24","연말정산","anssit",
    // "","","hometax.go.kr",...])만 채워지는 걸 확인 — 기존 코드가 이 "answer"를
    // 실제 검색어 목록으로 오인해서 "anssit", URL 조각 같은 쓰레기가 섞여
    // 들어가던 버그였음. st=100/run=2 조합이 실제 자동완성 목록("items")을 줌.
    const res = await fetch(
      `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(seed)}&st=100&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { items?: unknown[][] };
    const raw = (data.items?.[0] || []) as unknown[];
    const keywords = raw
      .map(item => Array.isArray(item) ? String(item[0] ?? '') : String(item ?? ''))
      .filter(Boolean);
    return keywords.filter(k => !isBlocked(k, category)).slice(0, 8);
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

function parseQcCnt(v: number | string) {
  return typeof v === 'number' ? v : v === '< 10' ? 5 : parseInt(String(v)) || 0;
}

// Naver 광고 API의 hintKeywords는 공백이 들어간 값을 통째로 보내면 무조건
// 400("hintKeywords 파라미터가 유효하지 않습니다")을 반환한다(직접 확인) —
// 여러 단어짜리 후보/시드를 계속 보내던 이 함수들이 사실상 항상 실패해서
// 매번 빈 결과로 조용히 넘어가고 있었음. 공백 기준으로 쪼개 콤마로 이어붙이면
// (개별 단어 최대 5개, API 제한) 통과함 — 대신 결과는 원래 문구 전체가 아니라
// 쪼개진 단어들 각각의 데이터로 옴(아래 두 함수 모두 이 형태를 가정하고 씀).
function toHintKeywords(kw: string): string {
  // 뉴스 제목처럼 따옴표/쉼표/말줄임표가 단어에 붙어 있으면 토큰 자체가 깨지거나
  // (쉼표가 껴서 hintKeywords 구분자와 충돌) 이상한 문자가 섞여 API가 거절함
  return kw
    .split(/\s+/)
    .map(t => t.replace(/["'“”‘’,.?!…()\[\]〈〉《》「」『』:;·]/g, ''))
    .filter(t => t.length >= 2)
    .slice(0, 5)
    .join(',');
}

async function getVolume(kw: string, apiKey: string, secret: string, cid: string) {
  try {
    const res = await fetch(
      `https://api.naver.com/keywordstool?hintKeywords=${encodeURIComponent(toHintKeywords(kw))}&showDetail=1`,
      { headers: adHeaders(apiKey, secret, cid), signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return { pc: 0, mobile: 0 };
    const data = await res.json() as { keywordList?: Array<{ relKeyword: string; monthlyPcQcCnt: number | string; monthlyMobileQcCnt: number | string }> };
    const m = (data.keywordList || []).find(k => k.relKeyword === kw) || data.keywordList?.[0];
    if (!m) return { pc: 0, mobile: 0 };
    return { pc: parseQcCnt(m.monthlyPcQcCnt), mobile: parseQcCnt(m.monthlyMobileQcCnt) };
  } catch { return { pc: 0, mobile: 0 }; }
}

// 네이버 광고 API에 시드 하나만 넣어도 그 시드와 실제로 연관성 있다고 네이버
// 자체 광고 수요 데이터가 판단한 키워드 수십 개 + 각각의 진짜 검색량이 통째로
// 돌아온다(keywordList 전체) — 지금까지는 이 응답에서 시드 자신의 검색량 한
// 줄만 빼 쓰고 나머지는 버렸음. "우리가 추측한 자동완성 롱테일"이 아니라
// "네이버가 집계한 실제 연관 검색 수요"를 바로 후보로 쓰기 위해 전체를 반환.
async function relatedKeywordsWithVolume(
  seed: string, apiKey: string, secret: string, cid: string, category: KeywordCategory
): Promise<Array<{ keyword: string; pc: number; mobile: number }>> {
  try {
    const res = await fetch(
      `https://api.naver.com/keywordstool?hintKeywords=${encodeURIComponent(toHintKeywords(seed))}&showDetail=1`,
      { headers: adHeaders(apiKey, secret, cid), signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { keywordList?: Array<{ relKeyword: string; monthlyPcQcCnt: number | string; monthlyMobileQcCnt: number | string }> };
    return (data.keywordList || [])
      .map(k => ({ keyword: k.relKeyword?.trim() || '', pc: parseQcCnt(k.monthlyPcQcCnt), mobile: parseQcCnt(k.monthlyMobileQcCnt) }))
      .filter(k => k.keyword && !isBlocked(k.keyword, category) && (k.pc + k.mobile) > 0)
      .sort((a, b) => (b.pc + b.mobile) - (a.pc + a.mobile))
      .slice(0, 30);
  } catch { return []; }
}

// ── 20대 카테고리 전용: 네이버 DataLab 연령 필터로 "실제 20대가 검색하는지" 확인
// (app/api/keyword/trend/route.ts에 이미 연결돼 있던 ages 파라미터를 여기서 처음
// 실사용 — 지금까지 항상 빈 배열로만 호출되던 걸 채워 씀). DataLab 비율은 각
// 그룹 자신의 최고점을 100으로 정규화한 상대값이라 "전체 대비 20대 비중"을
// 정밀하게 계산할 순 없지만(연령 필터 유무 두 시리즈가 서로 독립적으로
// 정규화되기 때문), 20대로 필터링한 시리즈 자체의 최근 구간 비율이 낮다는 건
// 20대 검색이 사실상 없다는 뜻이라 "이 키워드를 20대가 실제로 찾는가"를
// 거르는 용도로는 충분히 유효함 ──
async function twentiesAffinityBonus(
  keywords: string[], cid: string, secret: string
): Promise<Map<string, number>> {
  const bonus = new Map<string, number>();
  if (!keywords.length) return bonus;

  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const startDt = new Date(now);
  startDt.setMonth(startDt.getMonth() - 3);
  const start = startDt.toISOString().slice(0, 10);

  const batches: string[][] = [];
  for (let i = 0; i < keywords.length; i += 5) batches.push(keywords.slice(i, i + 5));

  await Promise.all(batches.map(async (batch) => {
    try {
      const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
        method: 'POST',
        headers: { 'X-Naver-Client-Id': cid, 'X-Naver-Client-Secret': secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: start, endDate: end, timeUnit: 'month',
          keywordGroups: batch.map(k => ({ groupName: k, keywords: [k] })),
          device: '', gender: '',
          ages: ['3', '4'], // 네이버 공식 연령 코드: 3=19~24세, 4=25~29세
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const data = await res.json() as { results?: Array<{ title: string; data: Array<{ period: string; ratio: number }> }> };
      for (const r of data.results || []) {
        const recent = r.data.slice(-2);
        if (!recent.length) continue;
        const avg = recent.reduce((s, d) => s + d.ratio, 0) / recent.length;
        if (avg >= 40) bonus.set(r.title, 1.4);
        else if (avg >= 15) bonus.set(r.title, 1.15);
      }
    } catch { /* DataLab 실패는 무시 — 보너스 없이 진행 */ }
  }));

  return bonus;
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

export async function POST(req: NextRequest) {
  // 대시보드 수동 클릭 세션 인증 외에, NAS 크론이 매일 자동으로 캐시를 채울 수
  // 있도록 CRON_SECRET bearer 인증도 허용 — 이게 없으면 사람이 안 누르는 한
  // bossai_keyword_opportunities 캐시가 계속 비어서 블로그자동화가 고CPC
  // 키워드 대신 구글트렌드 일반 키워드로만 계속 폴백함(실사용 중 확인).
  const cronSecret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  const isCron = !!cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`;
  let userId: string;
  if (isCron) {
    userId = process.env.OWNER_USER_ID!;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
    userId = user.id;
  }

  const [naverCid, naverSec, adKey, adSec, adCust, kakaoKey] = await Promise.all([
    getSetting('NAVER_CLIENT_ID'), getSetting('NAVER_CLIENT_SECRET'),
    getSetting('NAVER_AD_API_KEY'), getSetting('NAVER_AD_SECRET'), getSetting('NAVER_AD_CUSTOMER_ID'),
    getSetting('KAKAO_REST_API_KEY'),
  ]);

  const hasNaver = !!(naverCid && naverSec);
  const hasAd = !!(adKey && adSec && adCust);
  const hasDaum = !!kakaoKey;

  const categoryParam = req.nextUrl.searchParams.get('category');
  const category: KeywordCategory =
    categoryParam === 'finance' ? 'finance'
    : categoryParam === 'tech' ? 'tech'
    : categoryParam === 'twenties' ? 'twenties'
    : 'lifestyle';

  const month = new Date().getMonth() + 1;
  let entrySeeds: string[];
  if (category === 'finance') {
    // 실제 신호 2종(구글트렌드 실시간, 실제 뉴스 제목) + 캘린더 시드(보조) 결합
    const [trendSeeds, newsSeeds] = await Promise.all([
      googleTrendsSeeds(TREND_FINANCE_MATCH),
      financeNewsHeadlineSeeds(),
    ]);
    const seenSeed = new Set<string>();
    entrySeeds = [...trendSeeds, ...newsSeeds, ...(FINANCE_ENTRY_SEEDS[month] || FINANCE_ENTRY_SEEDS[4])]
      .filter(s => { const k = s.trim(); if (!k || seenSeed.has(k)) return false; seenSeed.add(k); return true; });
  } else if (category === 'tech') {
    // 아직 전자제품/AI 전용 뉴스 소스가 없어서(B 시드 미지원) 구글트렌드 실시간 +
    // 캘린더 시드 + 현재 연도 기준 정확한 최신 모델명(아이폰18 등) 결합.
    // 나중에 전용 리라이팅 소스 생기면 finance처럼 B도 추가 가능.
    const trendSeeds = await googleTrendsSeeds(TREND_TECH_MATCH);
    const seenSeed = new Set<string>();
    entrySeeds = [...trendSeeds, ...currentYearModelSeeds(), ...(TECH_ENTRY_SEEDS[month] || TECH_ENTRY_SEEDS[9])]
      .filter(s => { const k = s.trim(); if (!k || seenSeed.has(k)) return false; seenSeed.add(k); return true; });
  } else if (category === 'twenties') {
    // 20대가 실제로 모이는 공개 커뮤니티(에펨코리아/더쿠/네이트판) 인기글 +
    // 구글트렌드 실시간을 최우선으로 쓰고, 계절 캘린더 시드는 위 신호가 하나도
    // 안 잡혔을 때만 보조로 채움
    const [communitySeeds, trendSeeds] = await Promise.all([
      communityTrendingSeeds(),
      googleTrendsSeeds(TWENTIES_MATCH),
    ]);
    const seenSeed = new Set<string>();
    entrySeeds = [...communitySeeds, ...trendSeeds, ...(TWENTIES_ENTRY_SEEDS[month] || TWENTIES_ENTRY_SEEDS[9])]
      .filter(s => { const k = s.trim(); if (!k || seenSeed.has(k)) return false; seenSeed.add(k); return true; })
      .slice(0, 40); // 커뮤니티 원문 제목이 많을 수 있어 상한
  } else {
    entrySeeds = ENTRY_SEEDS[month] || ENTRY_SEEDS[4];
  }

  const seen = new Set<string>();
  type CandidateSource = 'ad_related' | 'autocomplete' | 'longtail';
  const hop1: Array<{ keyword: string; source: CandidateSource }> = [];
  const adVolumeCache = new Map<string, { pc: number; mobile: number }>();

  const add = (kw: string, src: CandidateSource) => {
    const k = kw.trim();
    if (!k || seen.has(k) || isBlocked(k, category)) return;
    seen.add(k);
    hop1.push({ keyword: k, source: src });
  };

  // ── STEP 0: 네이버 광고 API 연관검색어 (실제 수요 데이터, 최우선) ────────
  // "우리가 추측해서 자동완성에 넣어본 시드"가 아니라, 네이버 광고주 도구가
  // 실제 광고 수요/검색 데이터로 집계한 연관 키워드 + 진짜 검색량을 그대로 씀
  if (hasAd) {
    const adResults = await Promise.all(
      entrySeeds.map(s => relatedKeywordsWithVolume(s, adKey!, adSec!, adCust!, category))
    );
    adResults.forEach(list => list.forEach(({ keyword, pc, mobile }) => {
      adVolumeCache.set(keyword, { pc, mobile });
      add(keyword, 'ad_related');
    }));
  }

  // ── STEP 1: 1-hop 자동완성 (보조 — 실제 수요 데이터가 부족할 때 채움) ────
  const hop1Results = await Promise.all(entrySeeds.map(s => autocomplete(s, category)));
  hop1Results.forEach(list => list.forEach(kw => add(kw, 'autocomplete')));

  // ── STEP 2: 2-hop 자동완성 ────────────────────────────────────────────────
  // hop1 결과를 다시 자동완성 입력으로 → 더 구체적인 롱테일 발굴
  const hop2Seeds = hop1.filter(c => c.source !== 'ad_related').slice(0, 10).map(c => c.keyword);
  const hop2Results = await Promise.all(hop2Seeds.map(s => autocomplete(s, category)));
  hop2Results.forEach(list => list.forEach(kw => add(kw, 'longtail')));

  // ── STEP 3: 포화도 분석 (최대 20개, 실제 수요 데이터가 있는 ad_related 우선) ──
  const toAnalyze = [
    ...hop1.filter(c => c.source === 'ad_related'),
    ...hop1.filter(c => c.source !== 'ad_related'),
  ].slice(0, 20);

  // 20대 카테고리는 DataLab 연령필터로 "실제 20대가 검색하는지" 미리 한 번에 조회
  const twentiesBonusMap = category === 'twenties' && hasNaver
    ? await twentiesAffinityBonus(toAnalyze.map(c => c.keyword), naverCid!, naverSec!)
    : new Map<string, number>();

  const results = await Promise.all(
    toAnalyze.map(async ({ keyword, source }) => {
      const [ns, ds, gc, vol] = await Promise.all([
        hasNaver
          ? naverSatApi(keyword, naverCid!, naverSec!)
          : naverBlogScrape(keyword),
        daumSat(keyword, kakaoKey ?? null),
        googleCount(keyword),
        adVolumeCache.has(keyword)
          ? Promise.resolve(adVolumeCache.get(keyword)!)
          : hasAd ? getVolume(keyword, adKey!, adSec!, adCust!) : Promise.resolve({ pc: 0, mobile: 0 }),
      ]);

      const monthly = vol.pc + vol.mobile;
      const daumTotal = ds.blog + ds.cafe;
      const hasSatData = ns.blog > 0 || daumTotal > 0 || gc > 0;
      let goldenScore = calcGoldenScore(monthly, ns.blog, daumTotal, ns.news, ns.powerRatio, hasSatData);
      // 대출/보험/카드 등은 검색량은 비슷해도 실제 광고 단가(CPC)가 훨씬 높은
      // 카테고리라 클릭당 수익이 다름 — 순위 경쟁력만 보는 goldenScore에 가점을
      // 얹어서 "랭킹은 비슷해도 실제 돈이 되는" 키워드가 위로 오게 함
      if (
        (category === 'finance' && HIGH_CPC_PATTERNS.test(keyword)) ||
        (category === 'tech' && TECH_HIGH_VALUE_PATTERNS.test(keyword))
      ) {
        goldenScore = Math.round(goldenScore * 1.5);
      }
      // 20대가 실제로 검색하는 키워드일수록(DataLab 연령필터) 가점
      if (category === 'twenties') {
        const bonus = twentiesBonusMap.get(keyword);
        if (bonus) goldenScore = Math.round(goldenScore * bonus);
      }
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
      user_id: userId, keyword: r.keyword, source: r.source, category,
      monthly_total: r.monthlyTotal, monthly_pc: r.monthlyPc, monthly_mobile: r.monthlyMobile,
      naver_blog: r.naverBlog, daum_total: r.daumBlog + r.daumCafe,
      google_count: r.googleCount, competition_score: r.competitionScore,
      power_blog_ratio: r.naverPowerBlogRatio, difficulty: r.difficulty,
      can_rank1: r.canRank1, can_rank1_reason: r.canRank1Reason,
      score: r.score, grade: r.grade, created_at: now, expires_at: expiresAt,
    }, { onConflict: 'user_id,keyword,category' });
  }

  return NextResponse.json({ results, category, hasAdApi: hasAd, hasNaverApi: hasNaver, hasDaumApi: hasDaum, discoveredAt: now });
}
