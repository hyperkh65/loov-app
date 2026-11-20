import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { searchProducts, createAffiliateLinks, scrapeProductData, type CoupangProduct } from '@/lib/coupang/api';
import { getSetting } from '@/lib/get-setting';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import { publishToWordPress, getWpCredentials, wpDue, markWpPublished } from './blog-runner';
import { pickContentAngle } from '@/lib/affiliate-tracking';
import { fetchDemandKeywords, matchesDemand } from '@/lib/affiliate-demand-signal';
import { recordPriceSnapshot, getPriceDropNote } from '@/lib/affiliate-price-history';
import { pickRotatedAccount, logSnsPost } from '@/lib/sns/account-rotation';
import { PRODUCT_HOOK_GUIDE, SEAN_KEYWORDS_LIVING, scrubThreads, formatHookLines } from '@/lib/sns/hook-style';
import type { Platform } from '@/lib/sns/platforms';
import type { Schedule, CoupangAutoConfig } from './index';

const DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

// 스레드/인스타는 토스와 같은 "ads_default"(광고 전용, @2days.kr 하나) 풀을
// 공유한다(lib/sns/account-rotation.ts) — @2dayskr_korea/@aboda_miracool처럼
// 상품광고를 안 섞기로 한 일반 콘텐츠 계정으로는 절대 안 넘어가고, 간격이
// 안 되면 로테이션 대신 그냥 스킵됨.
// 페이스북/트위터는 계정이 하나뿐이라 그대로 둠(필터 안 함).

async function getSnsConnections(userId: string): Promise<Array<{ platform: string; platform_user_id: string; platform_username: string; access_token: string; is_active: boolean }>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('sns_connections')
    .select('platform, platform_user_id, platform_username, access_token, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);
  return (data || []) as typeof data extends null ? [] : NonNullable<typeof data>;
}

function getSection(text: string, tag: string, allTags: string[]): string {
  const marker = `[[[${tag}]]]`;
  const start = text.indexOf(marker);
  if (start < 0) return '';
  const from = start + marker.length;
  let end = text.length;
  for (const t of allTags) {
    if (t === tag) continue;
    const pos = text.indexOf(`[[[${t}]]]`, from);
    if (pos >= 0 && pos < end) end = pos;
  }
  return text.slice(from, end).trim();
}

/** 실측 확인: 프롬프트에 "한국어로만" 규칙을 넣어도 "klassischen", "repeatedly",
 * "enthusiast" 같은 단어 하나짜리 외국어 혼입이 반복 발생(Claude 포함, 모델 무관).
 * lib/auto-blog-ai.ts의 기존 필터는 CJK·일본어·러시아어 문자만 걸러서 이런 라틴 문자
 * 단어는 못 잡는다 — 별도 검수 패스로 HTML 구조는 안 건드리고 새어나온 단어만 고친다.
 * 검수가 실패해도 원문 자체는 이미 쓸 만하므로 그대로 진행(전체 발행이 막히지 않게). */
async function cleanForeignWords(html: string, aiModel: string): Promise<string> {
  const prompt = `아래는 한국어 블로그 글의 HTML 본문이다. 이 안에 섞여 있는 모든 비한국어 단어
(영어·독일어·프랑스어 등 — 코카콜라·펩시 같은 고유 브랜드명은 예외)를 자연스러운 한국어로
바꿔라.
- HTML 태그, 속성(style, class, href, src 등), URL 안의 내용은 절대 건드리지 마라.
- 문장 구조·의미·길이는 그대로 유지하고 새어나온 단어만 고쳐라.
- 고칠 게 없으면 원문을 토씨 하나 안 바꾸고 그대로 출력해라.
- 설명이나 마커 없이 수정된 HTML 전체만 출력해라.

원문:
${html}`;
  try {
    const result = await generateText(prompt, 'groq', undefined, undefined, undefined, undefined, { multilingual: true });
    return result.trim() || html;
  } catch {
    return html;
  }
}

/** AI가 지시한 마커([[[TITLE]]] 등) 외에 "[[[콘텐츠]]]" 같은 자기 나름의 라벨을 제목 끝,
 * 본문 첫 줄 등 예상 못한 위치에 붙이는 경우가 실측에서 여러 번 확인됨(실제 발행물에
 * 그대로 노출됨) — 위치에 의존하지 않고 어디에 나오든 통째로 제거한다. */
function stripMarkerArtifacts(s: string): string {
  return s.replace(/\[\[\[[^\]]{0,40}\]\]\]/g, '').trim();
}

/** 실측 확인: 프롬프트 지시 + AI 검수 패스(cleanForeignWords)를 둘 다 거쳐도 "afternoon",
 * "considerably", "host", "nearer" 같은 영단어가 이따금 새어나오고, 검수 패스가 문장을
 * 손대다 오히려 어색한 조각을 남기기도 한다(AI에게 완전히 맡길 수 없다는 뜻). 마지막
 * 방어선으로 텍스트 노드(태그/속성 밖)에서만 3자 이상 라틴 알파벳 단어를 기계적으로
 * 제거한다 — 완벽하진 않지만(드물게 정상 단어도 지워질 수 있음) 눈에 띄는 외국어 단어가
 * 실제 발행물에 남는 사고는 확실히 막는다. */
function stripStrayLatinWords(html: string): string {
  return html.replace(/>([^<]*)</g, (_match, text: string) => {
    const cleaned = text
      // 실측: 본문에 태국어("ไหม") 한 단어가 섞여 발행됨 — 라틴 단어 필터가 못 잡던 문자군도 함께 제거
      .replace(/[\u0E00-\u0E7F\u0600-\u06FF\u0590-\u05FF\u0900-\u097F\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF]+/g, '')
      .replace(/\b[A-Za-z]{3,}\b/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.!?、])/g, '$1');
    return `>${cleaned}<`;
  });
}

/** 같은 검색/골드박스 조회에서 실제로 함께 나온 다른 상품 — 이미지·비교표를 "지어내지
 * 않고" 풍부하게 만들기 위한 재료(공식 API 데이터, 스크래핑 아님). */
export interface ComparisonProduct { name: string; price: number; image?: string; url: string }

/** 비교 상품을 고른다 — 실측 확인: 골드박스는 카테고리가 뒤섞인 오늘의 특가 모음이라
 * 그 안에서 아무거나 골라 비교하면 "콜라 vs 곰팡이 세정제" 같은 말도 안 되는 비교가
 * 나온다(실제 발행에서 확인됨). 이미 같은 카테고리로 좁혀진 keyword 검색 결과가 아니면,
 * 상품 카테고리명으로 별도 검색해 진짜 비슷한 상품끼리 비교한다. */
export async function fetchComparisonProducts(
  product: { productId: number | string; productName: string; categoryName?: string },
  sourcePool: CoupangProduct[],
  poolIsCategoryHomogeneous: boolean,
  accessKey: string,
  secretKey: string,
): Promise<ComparisonProduct[]> {
  let pool = poolIsCategoryHomogeneous ? sourcePool : [];
  if (!pool.length) {
    // 실측: categoryName("식품" 등)은 너무 넓어서 참치·라면·김치 같은 무관한 "비교"가
    // 나온다 — 상품명 기반 검색이 실제로 비슷한 상품(같은 브랜드/종류)을 찾아온다.
    // 상품명으로 검색해서 결과가 없을 때만 카테고리로 폴백.
    const nameKw = product.productName.split(' ').slice(0, 2).join(' ');
    try { pool = await searchProducts(nameKw, accessKey, secretKey); } catch { pool = []; }
    if (pool.length < 2 && product.categoryName) {
      try { pool = await searchProducts(product.categoryName, accessKey, secretKey); } catch { /* keep whatever we have */ }
    }
  }
  // 실측: 같은 상품이 그리드에 두 번 들어가고, 밀폐용기 글에 라탄 바스켓이 비교 대상으로 나옴 —
  // 같은 상품(id·이름)은 한 번만, 상품명에 공통 한글 단어가 있는 "같은 종류"만 비교 대상으로 쓴다.
  // 판매자 이름·홍보 문구("활용도 좋은" 등)만 겹치는 다른 종류 상품을 거르려고, 흔한 홍보어는 빼고 2단어 이상 겹칠 때만 같은 종류로 본다.
  const GENERIC = new Set(['활용도', '좋은', '추천', '세트', '용품', '정품', '무료배송', '당일', '대용량', '사은품', '인기', '신상']);
  const toks = (n: string) => new Set((n.match(/[가-힣]{2,}/g) || []).filter(t => !GENERIC.has(t)));
  const mine = toks(product.productName);
  const need = Math.min(2, mine.size);
  const seen = new Set<string>([String(product.productId), product.productName.slice(0, 20)]);
  const related = pool.filter(p => {
    const key = String(p.productId), nm = p.productName.slice(0, 20);
    if (seen.has(key) || seen.has(nm)) return false;
    seen.add(key); seen.add(nm);
    return [...toks(p.productName)].filter(t => mine.has(t)).length >= need;
  });
  return related
    .filter(p => p.productPrice > 0 && p.productImage)
    .sort((a, b) => a.productPrice - b.productPrice)
    .slice(0, 3)
    .map(p => ({ name: p.productName, price: p.productPrice, image: p.productImage, url: p.productUrl }));
}

/** code(비AI)가 직접 그리는 비교 그리드 — 실제 이미지/가격만 쓰므로 AI가 이미지 URL을
 * 잘못 쓰거나(hallucination) 지어낼 위험이 없다. 대상 상품은 강조색으로 표시. */
function buildComparisonTableHtml(
  target: { name: string; price: number; image?: string },
  others: ComparisonProduct[],
): string {
  if (!others.length) return '';
  const cards = [{ ...target, isTarget: true }, ...others.slice(0, 3).map(o => ({ ...o, isTarget: false }))];
  const cardsHtml = cards.map(c => `
    <div style="flex:1;min-width:130px;max-width:180px;text-align:center;border:2px solid ${c.isTarget ? '#e11d48' : '#eee'};border-radius:10px;padding:10px;">
      ${c.image ? `<img src="${c.image}" alt="${c.name.slice(0, 40)}" style="width:100%;height:110px;object-fit:cover;border-radius:6px;" />` : ''}
      <p style="font-size:12px;color:#555;margin:8px 0 4px;line-height:1.3;height:2.6em;overflow:hidden;">${c.name.slice(0, 40)}</p>
      <p style="font-weight:700;font-size:14px;color:${c.isTarget ? '#e11d48' : '#333'};margin:0;">${c.price.toLocaleString()}원${c.isTarget ? ' ✅' : ''}</p>
    </div>`).join('');
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:20px 0;">${cardsHtml}</div>`;
}

/** 실제 리뷰 스크래핑은 쿠팡의 봇 감지에 자주 막힌다(실측 확인) — 성공하면 실사용 후기를
 * 인용하고, 실패/차단되면 절대 있지도 않은 리뷰를 지어내지 않는다(표시광고법 리스크 +
 * 신뢰성 문제). 참고: 쿠팡파트너스 공식 Open API는 구매평 조회 엔드포인트 자체가 없다
 * (검색/골드박스/딥링크뿐) — 리뷰는 쿠팡 소매 사이트의 비공식 내부 API를 스크래핑해야만
 * 얻을 수 있고, 그마저 봇 차단으로 이 서버에서는 실측상 거의 항상 실패한다.
 *
 * 2차 버전(실측 피드백: "진부하고 짧고 이미지 하나뿐이고 비교자료 빈약함") 대응:
 * - 고정 h2 문구를 프롬프트에 그대로 박아놓으니 매번 AI가 그 문구를 토씨 하나 안 틀리고
 *   재사용해서 글이 뻔해짐 → 문구 대신 "이 섹션의 목적"만 지시하고 소제목은 매번 새로
 *   짓게 함 + 과거에 반복 사용된 문구를 금지어로 명시.
 * - 이미지 1장 문제 → 같은 조회에서 나온 다른 실제 상품들로 code가 직접 비교 그리드를
 *   그려서 이미지 3~4장 + 실제 가격 비교표를 항상 보장(AI 재량에 안 맡김). */
export async function buildProductBlogPost(
  product: { productName: string; productPrice: number; productImage?: string; discountRate?: number; categoryName?: string },
  affiliateUrl: string,
  aiModel: string,
  scraped: { reviews: { content: string }[] } | null,
  comparisonProducts: ComparisonProduct[],
  priceDropNote?: string | null,
): Promise<{ title: string; content: string; excerpt: string }> {
  const realReviews = (scraped?.reviews || []).map(r => r.content).filter(Boolean).slice(0, 5);

  const reviewBlock = realReviews.length
    ? `실사용자 리뷰(실제 수집됨 — 인용/paraphrase 가능):\n${realReviews.map((r, i) => `${i + 1}. "${r.slice(0, 200)}"`).join('\n')}`
    : `실사용자 리뷰: 수집하지 못함. 절대 특정 개인이 쓴 것처럼 "제가 써봤는데" 식 후기를 지어내지 마라. 대신 "이 제품을 선택한 구매자들이 공통적으로 이야기하는 부분은" 같은 일반화된 여론/후기 요약 톤은 써도 된다 — 근거는 스펙/카테고리 특성에서 합리적으로 추론.`;

  const comparisonBlock = comparisonProducts.length
    ? `실제 비교 대상 상품(공식 API로 같이 조회된 것, 아래에 이미지·가격 비교표가 자동 삽입됨 — 본문에서 이 비교를 구체적으로 언급할 것):\n${comparisonProducts.slice(0, 3).map((c, i) => `${i + 1}. ${c.name.slice(0, 50)} — ${c.price.toLocaleString()}원`).join('\n')}`
    : '';

  const bannedPhrases = [
    '지금 이 가격에 사야 하는 이유', '다들 이런 점을 좋아합니다', '이런 분께 추천합니다',
    '이렇게 마시고 나서', '망설인 적 없으신가요', '장바구니에 담아', '지금 바로', '후회 없는 선택',
    '링크는 아래에 있습니다', '오늘 소개할 상품은',
  ];

  // 비교 상품에서 "코드가 직접 계산한" 사실 — AI가 숫자를 지어내지 않고 이 값만 근거로 쓰게 한다
  const cmpPrices = comparisonProducts.map(c => c.price);
  const priceFact = cmpPrices.length
    ? `같은 종류로 함께 조회된 상품 ${cmpPrices.length}개 중 이 상품보다 싼 것 ${cmpPrices.filter(x => x < product.productPrice).length}개, 비싼 것 ${cmpPrices.filter(x => x >= product.productPrice).length}개 (비교군 가격대 ${Math.min(...cmpPrices).toLocaleString()}원~${Math.max(...cmpPrices).toLocaleString()}원)`
    : '';

  const prompt = `너는 쿠팡파트너스 제휴 블로그를 운영하는 실력 있는 카피라이터 겸 MD야. 아래 상품으로
"이걸 왜 안 사지?" 싶을 만큼 읽는 사람이 자기 상황에 대입해 보게 되는, 실제로 클릭·구매로 이어지는 워드프레스 글을 써줘.
백과사전식 스펙 나열이 아니라 한 사람에게 말 걸듯 구체적인 장면과 결과로 설득하는 글이어야 한다.

상품명: ${product.productName}
가격: ${product.productPrice.toLocaleString()}원${product.discountRate ? ` (정가 대비 ${product.discountRate}% 할인 중 — 실데이터, 강조할 것)` : ''}
카테고리: ${product.categoryName || '미상'}
${priceDropNote ? `${priceDropNote}\n` : ''}${priceFact ? `가격 위치(실데이터): ${priceFact}\n` : ''}
${comparisonBlock}

${reviewBlock}

[글 구조 — 아래 순서로, <h2> 소제목은 매번 이 상품에 맞게 새로 창작(아래 금지 문구 재사용 금지: ${bannedPhrases.map(p => `"${p}"`).join(', ')})]
0. 후킹 오프닝 1~2문단(h2 없이 맨 앞): "추천해요"로 시작 금지. 지금 이걸 안 쓰고 있어서 겪는 구체적 장면·손해(시간·돈·스트레스)를 한 장면으로 보여줘라. 인사말 금지.
0-1. <h2>한눈에 보기</h2> 성격의 짧은 요약 <ul><li> 3줄: 가격, 누구에게 맞는지, 가장 큰 변화 한 가지. 숫자는 위 실데이터만.
1. 가격·비교 섹션(h2): 위 실데이터로 지금 살 만한 이유를 2~4문장. 이 h2 뒤에 비교 이미지 그리드가 자동 삽입된다. 가격을 "커피 한 잔 값" 같은 일상 단위로 환산하는 건 좋지만 지어낸 정가·할인율은 금지. 이 문단 끝에 {{CTA_BUTTON}} 한 줄.
2. 이런 장면에서 달라집니다(h2): 실제 사용 장면 3가지를 각각 한 문단씩 — "아침 출근 전", "퇴근하고 지친 날" 처럼 시간·장소가 보이는 구체적 장면 + 그래서 뭐가 달라지는지 결과. 스펙 숫자 나열 금지.
3. 장점 섹션(h2): 이 제품군 사용자가 가장 자주 겪는 불편 하나를 먼저 짚고, 이 제품이 어떻게 해소하는지 "전에는 ~했는데 이제는 ~합니다" 식 이전/이후 문장으로 3~4가지. 리뷰 데이터가 있으면 우선 반영.
4. 이런 분께 추천(h2): 구체적 대상 3~4개 bullet(<ul><li>).
5. 정직한 단점(h2, 2~3문장): "이런 분들껜 안 맞을 수도 있어요" 식으로 실제 구매 망설임이 생길 만한 현실적 단점 하나. 없는 단점 지어내기·사소한 가짜 단점 금지.
6. 구매 전 체크할 것(h2): 크기·호환·설치·관리 등 사기 전에 확인할 포인트 3~4개 <ul><li> — 상품명과 카테고리에서 합리적으로 추론 가능한 것만.
7. 자주 묻는 질문(h2): 실제 검색자가 궁금해할 질문 3개를 <p><strong>Q. …</strong><br>A. …</p> 형식으로. 확인 불가한 정보는 "상품 상세 페이지에서 확인하세요"로 안내.
8. 결론(h2 없이 마지막 문단들): 새로운 관점 1개 + 지금 결정하면 얻는 것으로 마무리하고, 마지막에 {{CTA_BUTTON}} 토큰 한 줄.

[문장 품질 — 가장 중요]
- 한 문장은 60자 안팎, 주어와 서술어가 분명하게. 번역투·어색한 조사("~에 의존해 필요한 수보다 더 낫습니다" 같은 뜻 모를 문장) 금지. 쓰고 나서 모든 문장이 소리 내 읽어도 뜻이 통하는지 스스로 점검해라.
- 같은 말 되풀이, "~할 수 있습니다"의 연속, "다양한/효율적인/최적의" 같은 빈 형용사 금지. 구체적 명사와 동사로 써라.
- 친근한 존댓말(해요체/합니다체 중 하나로 통일).

[절대 규칙]
- 반드시 한국어로만. 중국어·일본어·러시아어·태국어·영어 등 외국 문자·단어 금지(코카콜라·펩시 같은 고유 브랜드명만 예외).
- 최소 2800자 이상, 각 섹션을 구체적으로 충분히 써라.
- {{CTA_BUTTON}}, {{COMPARISON_TABLE}} 토큰 외에는 링크나 이미지 태그를 넣지 마라(이미지 URL 지어내기 금지).
- 마커나 섹션 이름(TITLE, CONTENT 등)을 본문/제목에 포함하지 마라. 아래 형식 밖에는 어떤 텍스트도 쓰지 마라.
- 없는 사실(가짜 리뷰, 가짜 가격·정가, 가짜 스펙 수치)을 지어내지 마라 — 과장은 표현 수위에서만, 데이터는 항상 정직하게. 주어지지 않은 숫자는 쓰지 마라.
- 출력은 순수 HTML(<p>, <h2>, <ul><li>, <strong>)만. 마크다운·코드블록·설명 없이. <h2>를 </p>로 닫는 식으로 태그 종류를 틀리지 마라.
- 제목(검색 유입이 목적): 소비자가 검색창에 실제로 칠 말로 시작. [제품군 + 짧은 제품명(브랜드·모델)] + [검색 의도어: 추천/후기/가격/비교/장단점/사용법 중 1~2개] + [해결하는 문제·대상 한 구절]. 핵심 검색어는 앞 15자 안에. 20~32자(초과 금지). 감성 문장·은유·질문형 금지.
  좋은 예: "무향 바디로션 추천, 세타필 보습 후기" / "원룸 가습기 추천 샤오미 소음 비교"
- 반드시 아래 형식으로만 출력:
[[[TITLE]]]
제목 (검색어로 시작, 20~32자)
[[[CONTENT]]]
본문 HTML`;

  // 실측: 고정 'groq' 모델로는 어색한 문장·외국어 혼입이 잦았다 — 설정 모델(기본 claude)을 쓰고 실패하면 기존 폴백 체인이 이어받는다
  const aiText = await generateText(prompt, aiModel || 'claude');
  let title = stripMarkerArtifacts(getSection(aiText, 'TITLE', ['TITLE', 'CONTENT']) || '');
  let rawContent = getSection(aiText, 'CONTENT', ['TITLE', 'CONTENT']);

  // 실측 확인: AI가 [[[CONTENT]]] 마커를 아예 빠뜨리면 title 추출 구간이 본문 전체를
  // 통째로 삼켜버린다(제목에 HTML이 통째로 들어가는 사고로 실제 발행에서 확인됨).
  // 마커 형식이 깨졌다는 신호(본문 없음 / 제목이 비정상적으로 김 / 제목에 태그 혼입)가
  // 보이면 "첫 줄=제목, 나머지=본문"으로 안전하게 되돌린다.
  if (!rawContent || title.length > 80 || /<[a-z]/i.test(title)) {
    const lines = (title || aiText).split('\n').map(l => l.trim()).filter(Boolean);
    title = stripMarkerArtifacts(lines[0] || product.productName);
    rawContent = lines.slice(1).join('\n') || rawContent || aiText;
  }
  if (!title) title = product.productName;
  let content = stripMarkerArtifacts(rawContent);
  content = await cleanForeignWords(content, aiModel);
  content = stripStrayLatinWords(content);

  // 비교 그리드 — AI가 이미지 URL을 직접 못 쓰게 막고 code가 실데이터로만 그린다.
  // 실측: AI가 {{COMPARISON_TABLE}} 토큰을 문단 중간에 박아넣어 <p> 안에 <div>가 끼는
  // 깨진 HTML이 나온 적이 있어, 토큰 위치는 신경 쓰지 않고 항상 code가 h2 뒤에 직접 삽입한다.
  content = content.split('{{COMPARISON_TABLE}}').join('');
  const comparisonHtml = buildComparisonTableHtml(
    { name: product.productName, price: product.productPrice, image: product.productImage },
    comparisonProducts,
  );
  // "한눈에 보기" 요약 목록이 먼저 나오므로 그리드는 가격·비교 섹션(두 번째 h2) 뒤에 둔다.
  // h2가 하나도 없으면(AI 형식 이탈) 글 맨 위가 아니라 첫 문단 뒤에 넣는다 — 맨 위에 두면 요약문(excerpt)이 가격표가 된다.
  if (comparisonHtml) {
    const h2Ends = [...content.matchAll(/<\/h2>/g)].map(m => m.index! + 5);
    const at = h2Ends[1] ?? h2Ends[0];
    if (at !== undefined) content = content.slice(0, at) + comparisonHtml + content.slice(at);
    else {
      const p1 = content.indexOf('</p>');
      content = p1 !== -1 ? content.slice(0, p1 + 4) + comparisonHtml + content.slice(p1 + 4) : comparisonHtml + content;
    }
  } else if (product.productImage) {
    // 같은 종류 비교 상품이 없으면 그리드를 건너뛰되, 상품 사진은 첫 문단 뒤에 한 장 보여준다
    const fig = `<p style="text-align:center;margin:20px 0;"><img src="${product.productImage}" alt="${product.productName.slice(0, 40)}" style="max-width:100%;height:auto;border-radius:10px;" /></p>`;
    const p1 = content.indexOf('</p>');
    content = p1 !== -1 ? content.slice(0, p1 + 4) + fig + content.slice(p1 + 4) : fig + content;
  }

  const ctaButtonHtml = `<p style="text-align:center;margin:28px 0;"><a href="${affiliateUrl}" target="_blank" rel="nofollow sponsored noopener" style="display:inline-block;background:#e11d48;color:#fff;font-weight:700;font-size:17px;padding:14px 34px;border-radius:8px;text-decoration:none;">🛒 최저가로 확인하기</a></p>`;
  const hadCtaToken = content.includes('{{CTA_BUTTON}}');
  content = content.split('{{CTA_BUTTON}}').join(ctaButtonHtml);
  if (!hadCtaToken) {
    // AI가 토큰을 아예 안 넣은 경우에만 강제 삽입(첫 문단 뒤 + 맨 끝) — 토큰을 지시대로
    // 넣었는데도 끝에 또 붙이면 버튼이 3번 나오는 중복이 실측에서 확인되어 분기함.
    const firstParaEnd = content.indexOf('</p>');
    if (firstParaEnd !== -1) content = content.slice(0, firstParaEnd + 4) + ctaButtonHtml + content.slice(firstParaEnd + 4);
    content += `\n${ctaButtonHtml}`;
  }
  content += `\n<p style="font-size:12px;color:#888;">${DISCLOSURE}</p>`;

  // 목록·검색결과에 보이는 요약문 — 기본 자동 발췌는 본문 앞부분(그리드 가격표 등)을 그대로 잘라 써서 상품 목록처럼 보였다.
  // 첫 문단의 문장을 120자 안에서 끊어 직접 지정한다.
  const firstP = (content.match(/<p(?![^>]*style=)[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '';
  const plain = firstP.replace(/<[^>]+>/g, '').replace(/&#8216;|&#8217;/g, "'").replace(/\s+/g, ' ').trim();
  const excerpt = plain.length > 120 ? plain.slice(0, 118).replace(/[^\s]*$/, '').trim() + '…' : plain;

  return { title, content, excerpt };
}

export async function runCoupangAuto(
  schedule: Schedule,
  recentProductIds: string[] = [],
): Promise<{ productId: string; productName: string; platforms: string[]; results: string[]; wordpressUrl?: string }> {
  const config = schedule.config as CoupangAutoConfig;

  const accessKey = await getSetting('COUPANG_ACCESS_KEY');
  const secretKey = await getSetting('COUPANG_SECRET_KEY');
  if (!accessKey || !secretKey) throw new Error('쿠팡파트너스 API 키가 설정되지 않았습니다');

  // 상품 수집
  let products;
  // @seanonthemail(자취템·극가성비 전용, 2026-10-18 사용자 확정) — 설정과 무관하게 자취 키워드로만 검색
  const kw = SEAN_KEYWORDS_LIVING[Math.floor(Math.random() * SEAN_KEYWORDS_LIVING.length)];
  products = await searchProducts(kw, accessKey, secretKey);

  if (!products?.length) throw new Error('상품을 가져오지 못했습니다');

  // 최근 발행하지 않은 상품 중 할인율 높은 순으로 선택 — 실측 비교: 그냥 첫 상품(콜라)보다
  // 할인율 기준으로 고른 상품(다이어트 식단 세트)이 훨씬 설득력 있는 글이 나옴을 확인.
  // 이미지 없는 상품은 비교 그리드/대표이미지 둘 다 부실해지므로 후보에서 제외.
  const pool = (config.min_discount
    ? products.filter(p => (p.discountRate || 0) >= config.min_discount!)
    : products
  ).filter(p => p.productImage);
  // "할인율"은 공급 쪽 신호일 뿐 실제 구매 의도와 무관 — 이미 있는 키워드 발굴
  // 캐시(구매의도 매칭 포함)와 겹치는 상품에 가점을 줘서 수요 신호를 섞는다.
  const demandKeywords = await fetchDemandKeywords();
  const rankScore = (p: CoupangProduct) => (p.discountRate || 1) * (matchesDemand(p.productName, demandKeywords) ? 1.5 : 1);
  const base = pool.length ? pool : products;
  const ranked = [...base].sort((a, b) => rankScore(b) - rankScore(a));
  let candidates = ranked.filter(p => !recentProductIds.includes(String(p.productId)));

  // 골드박스는 하루 몇 번 안 바뀌는 소규모 목록이라, 발행 주기를 짧게(매시간
  // 등) 잡으면 하루 안에 다 써버려서 예전엔 candidates가 비면 그냥 ranked[0]
  // (직전과 똑같은 1위 상품)을 다시 올려버렸음 — 이게 "같은 상품 중복 발행"의
  // 원인. 골드박스가 소진됐으면 키워드 검색으로 새 후보를 보충 시도하고,
  // 그래도 없으면 중복을 감수하고 올리는 대신 이번 회차는 건너뛴다.
  if (!candidates.length) {
    const kw2 = SEAN_KEYWORDS_LIVING[Math.floor(Math.random() * SEAN_KEYWORDS_LIVING.length)];
    const extra = await searchProducts(kw2, accessKey, secretKey).catch(() => []);
    candidates = extra
      .filter(p => p.productImage && !recentProductIds.includes(String(p.productId)))
      .sort((a, b) => rankScore(b) - rankScore(a));
  }
  if (!candidates.length) {
    throw new Error('오늘 발행 가능한 새 상품이 없어 이번 회차는 건너뜀(중복 방지)');
  }

  const product = candidates[0] as {
    productId: number | string;
    productName: string;
    productPrice: number;
    productUrl: string;
    productImage?: string;
    discountRate?: number;
  };

  // 제휴링크 생성 — 골드박스/검색 productUrl은 이미 제휴링크라 딥링크 API가 거부하므로
  // 순수 상품 URL로 채널별 subId(sns/wp) 딥링크를 만든다 → 쿠팡 리포트에서 채널별 수익 분리
  const plainUrl = `https://www.coupang.com/vp/products/${product.productId}`;
  const subLink = async (subId: string) => {
    try {
      const [l] = await createAffiliateLinks([plainUrl], accessKey, secretKey, subId);
      return l && l !== plainUrl ? l : product.productUrl;
    } catch { return product.productUrl; }
  };
  const affiliateUrl = product.productUrl;
  const snsAffiliateUrl = await subLink('sns');
  const wpAffiliateUrl = await subLink('wp');

  // 실데이터 긴급성 — 어제 스냅샷과 비교해서 진짜 가격 하락이면 문구에 반영,
  // 아니면 언급 안 함(가짜 긴급성 금지). 오늘 스냅샷은 다음 회차 비교용으로 저장.
  const priceDropNote = await getPriceDropNote('coupang', String(product.productId), product.productPrice);
  recordPriceSnapshot('coupang', String(product.productId), product.productPrice).catch(() => {});

  // SNS 텍스트 생성 — 앵글을 매번 하나 골라서(할인/비교/후기/상황) 프롬프트에 반영하고
  // 아래 클릭추적 go-link에 태깅해둔다 — 나중에 클릭 데이터로 어떤 앵글이 실제로
  // 잘 먹히는지 비교하기 위함(추측이 아니라 A/B 관점).
  const contentAngle = pickContentAngle();
  const ANGLE_GUIDE: Record<string, string> = {
    discount: '이 가격이 왜 의외인지(평소·비슷한 상품 대비)를 중심으로.',
    compare: '다른 선택지와 뭐가 다른지 비교하는 관점으로(구체적 스펙 지어내지 말 것).',
    review: '"이 제품군을 써본 사람들 사이에서 자주 나오는 얘기는" 식으로 일반화된 여론 톤으로(특정 개인의 후기를 지어내지 말 것).',
    use_case: '이 상품이 필요해지는 구체적 상황(언제·어떤 불편) 묘사에 집중.',
  };
  const TAGS = ['THREADS', 'TWITTER', 'FACEBOOK', 'INSTAGRAM'];
  const p = product as typeof product & { discountRate?: number; categoryName?: string; isRocket?: boolean; isFreeShipping?: boolean; keyword?: string };
  const prompt = `쿠팡 상품을 SNS에 소개하는 카피를 채널별로 써라. 반드시 한국어로만.

[상품 정보 — 이것만 근거로 쓸 것]
상품명: ${p.productName}
${p.categoryName ? `카테고리: ${p.categoryName}\n` : ''}${p.keyword ? `사람들이 검색한 키워드: ${p.keyword}\n` : ''}가격: ${p.productPrice.toLocaleString()}원${p.discountRate ? ` (${p.discountRate}% 할인)` : ''}
${p.isRocket ? '로켓배송\n' : ''}${p.isFreeShipping ? '무료배송\n' : ''}${priceDropNote ? `${priceDropNote}\n` : ''}
이번 글의 앵글: ${contentAngle}. ${ANGLE_GUIDE[contentAngle]}

${PRODUCT_HOOK_GUIDE}

[채널별]
- THREADS: 위 규칙 그대로(4~6줄). URL 없이
- TWITTER: 위 ①②⑤만 3줄 + 해시태그 2개. 240자 이내. URL 없이
- FACEBOOK: 위 규칙 그대로. URL 없이
- INSTAGRAM: 위 규칙 그대로 + 맨 끝 빈 줄 뒤 해시태그 8개. URL 없이

반드시 아래 구분자 형식으로만 출력 (설명/코드블록 없이):
[[[THREADS]]]
스레드용 텍스트
[[[TWITTER]]]
트위터용 텍스트
[[[FACEBOOK]]]
페이스북용 텍스트
[[[INSTAGRAM]]]
인스타그램용 텍스트`;

  const aiText = await generateText(prompt, 'sns');

  const textMap: Record<string, string> = {
    threads:   scrubThreads(getSection(aiText, 'THREADS', TAGS)),
    twitter:   getSection(aiText, 'TWITTER', TAGS),
    facebook:  formatHookLines(getSection(aiText, 'FACEBOOK', TAGS)),
    instagram: getSection(aiText, 'INSTAGRAM', TAGS),
  };

  const comment = `🔗 상품 링크: ${snsAffiliateUrl}\n\n${DISCLOSURE}`;

  // 발행 대상 — 미지정 시 기존 동작(SNS만)과 동일하게 하위호환
  const targets = config.publish_targets?.length ? config.publish_targets : ['sns'];
  const picked = config.sns_account_ids;
  const platforms = targets.includes('sns')
    ? (picked ? ['threads', 'twitter', 'facebook', 'instagram'] : config.sns_platforms.filter(p => ['threads', 'twitter', 'facebook', 'instagram'].includes(p)))
    : [];
  const results: string[] = [];

  if (platforms.length) {
    const connections = await getSnsConnections(schedule.user_id);
    const admin = createAdminClient();
    for (const platform of platforms) {
      let conns: typeof connections;
      if (picked) {
        conns = connections.filter(c => c.platform === platform && picked.includes(c.platform_user_id));
        if (!conns.length) continue;
      } else if (platform === 'threads' || platform === 'instagram') {
        const picked = await pickRotatedAccount(admin, 'ads_default', platform, connections);
        conns = picked ? connections.filter(c => c.platform === platform && c.platform_user_id === picked.platform_user_id) : [];
        if (!conns.length) { results.push(`${platform}: 계정 전부 최근에 발행됨 — 이번 회차 스킵`); continue; }
      } else {
        conns = connections.filter(c => c.platform === platform);
      }
      if (!conns.length) { results.push(`${platform}: 계정 미연결`); continue; }

      const text = textMap[platform];
      if (!text) { results.push(`${platform}: 텍스트 생성 실패`); continue; }

      for (const conn of conns) {
        const label = `${platform}(${conn.platform_username || conn.platform_user_id})`;
        try {
          const postResult = await postToPlatformWithMedia(
            platform as Platform,
            conn.access_token,
            conn.platform_user_id,
            platform === 'facebook' ? `${text}\n\n${comment}` : text, // 페이스북은 댓글 권한이 없어 링크를 본문에
            product.productImage ? [product.productImage] : undefined,
          );
          if (platform === 'threads' || platform === 'instagram') {
            logSnsPost(admin, platform, conn.platform_user_id).catch(() => {});
          }
          // 제휴링크를 댓글로
          if (platform !== 'facebook') try {
            await postCommentOnOwnPost(platform as Platform, conn.access_token, conn.platform_user_id, postResult.id, comment);
          } catch { /* 댓글 실패 시 무시 */ }
          results.push(`${label}: 발행 완료`);
        } catch (err) {
          results.push(`${label}: ${(err as Error).message?.slice(0, 50) || '실패'}`);
        }
      }
    }
  }

  // 워드프레스 발행 — SNS 발행 성공/실패와 무관하게 별도로 시도(부분 실패 허용)
  let wordpressUrl: string | undefined;
  if (targets.includes('wordpress') && config.wp_site_id && wpDue(schedule, 6)) {
    try {
      let scraped: { reviews: { content: string }[] } | null = null;
      try {
        // 실측: 브라우저 스크랩(봇 차단) → fetch 폴백이 길게는 수 분씩 걸릴 수 있어
        // Vercel 함수 제한(maxDuration=300s)을 넘길 위험이 있다. 리뷰는 "있으면 좋고
        // 없어도 되는" 부가 데이터이므로 20초 안에 안 끝나면 포기하고 진행한다.
        const s = await Promise.race([
          scrapeProductData(product.productId, { affiliateUrl }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('스크랩 타임아웃')), 20_000)),
        ]);
        // 스크래핑이 봇 감지 등으로 완전히 실패하면 productName이 빈 문자열로 온다 —
        // 그런 "성공한 척하는 빈 결과"를 진짜 리뷰인 것처럼 쓰면 안 되므로 걸러낸다.
        if (s.productName) scraped = s;
      } catch { /* 리뷰 없이 진행 */ }

      // "다른 제품 대비 싸다"는 주장과 비교 이미지를 지어내지 않고 실제 데이터로만 뒷받침 —
      // keyword 검색 결과는 이미 같은 카테고리라 그대로 쓰고, 골드박스(뒤섞인 카테고리)면
      // 카테고리명으로 별도 검색해서 진짜 비슷한 상품끼리 비교한다.
      const comparisonProducts = await fetchComparisonProducts(
        product, products, config.product_source === 'keyword', accessKey, secretKey,
      );

      // 실측: qwen3 기본값이 Ollama 무료 모델로 라우팅되면서 "partout", "questi점" 같은
      // 외국어 단어 혼입이 반복 확인됨. Claude 키가 설정돼 있어 기본값을 claude로 올림
      // (config.ai_model로 언제든 재정의 가능 — 기존 SNS 텍스트 생성은 qwen3 그대로 유지).
      const { title, content, excerpt } = await buildProductBlogPost(product, wpAffiliateUrl, config.ai_model || 'claude', scraped, comparisonProducts, priceDropNote);
      const { url, username, appPassword } = await getWpCredentials(config.wp_site_id);
      wordpressUrl = (await publishToWordPress(url, username, appPassword, title, content, product.productImage || null, 'publish', { excerpt })).link;
      results.push(`wordpress: 발행 완료 (${wordpressUrl})`);
      await markWpPublished(schedule);
    } catch (err) {
      // 실측: 이 실패 사유가 results 배열에만 담기고 서버 로그엔 안 남아서, 자동실행이
      // 조용히 실패했을 때 원인을 나중에 알 방법이 없었다 — 항상 로그에도 남긴다.
      console.error('[coupang-runner] wordpress 발행 실패:', err);
      results.push(`wordpress: ${(err as Error).message?.slice(0, 80) || '실패'}`);
    }
  }

  return { productId: String(product.productId), productName: product.productName, platforms, results, wordpressUrl };
}
