import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { getGoldboxProducts, searchProducts, createAffiliateLinks, scrapeProductData, type CoupangProduct } from '@/lib/coupang/api';
import { getSetting } from '@/lib/get-setting';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import { publishToWordPress, getWpCredentials } from './blog-runner';
import type { Platform } from '@/lib/sns/platforms';
import type { Schedule, CoupangAutoConfig } from './index';

const DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

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
    const result = await generateText(prompt, aiModel, undefined, undefined, undefined, undefined, { multilingual: true });
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
  return pool
    .filter(p => String(p.productId) !== String(product.productId) && p.productPrice > 0 && p.productImage)
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
): Promise<{ title: string; content: string }> {
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
  ];

  const prompt = `너는 쿠팡파트너스 제휴 블로그를 운영하는 실력 있는 카피라이터 겸 MD야. 아래 상품으로
"이걸 왜 안 사?"라는 생각이 들게 만드는, 실제로 클릭·구매로 이어지는 워드프레스 글을 써줘.
스펙을 나열하는 백과사전식 글이 아니라, 사람 마음을 움직이는 마케팅 카피여야 한다.

상품명: ${product.productName}
가격: ${product.productPrice.toLocaleString()}원${product.discountRate ? ` (정가 대비 ${product.discountRate}% 할인 중 — 실데이터, 강조할 것)` : ''}
카테고리: ${product.categoryName || '미상'}

${comparisonBlock}

${reviewBlock}

[글 구조 — 아래 목적을 이 순서로 담되, h2 소제목 문구는 매번 상품에 맞게 새로 창작할 것.
절대 아래 예시 문구를 그대로/비슷하게 재사용하지 마라(이미 여러 번 써서 진부해진 금지어):
${bannedPhrases.map(p => `"${p}"`).join(', ')}]
1. 후킹 오프닝 1문단: 이 상품이 해결해주는 고민이나 상황을 공감형/질문형/장면 묘사 등 매번 다른 방식으로. "안녕하세요", "오늘 소개할 상품은" 같은 밋밋한 인사말 절대 금지.
2. 가격/할인/비교 근거 섹션: 위에 준 실제 가격·할인율·비교 상품 데이터를 근거로 왜 지금이 살 타이밍인지 짧게(2~3문장). 이 h2 바로 뒤에 비교 이미지 그리드가 자동 삽입되니, 그리드를 직접 언급하기보다 뒤에 이어질 내용을 자연스럽게 열어주는 정도로 짧게 써라. 주어지지 않은 숫자는 절대 지어내지 마라.
3. 장점 섹션: 구매자들이 공통적으로 꼽을 만한 장점 3~4가지를 구체적인 사용 장면과 함께. 위 리뷰 데이터가 있으면 그걸 우선 반영.
4. 추천 대상 섹션: 구체적인 대상 3~4개 bullet.
5. {{CTA_BUTTON}} ← 이 토큰을 정확히 이 자리에 한 줄로 넣어라 (구매 버튼이 자동 삽입됨).
6. 결론 문단(길게, 새로운 관점 추가) + 마지막에 {{CTA_BUTTON}} 토큰 한 번 더.

[절대 규칙]
- 반드시 한국어로만. 중국어·일본어·러시아어·기타 외국 문자 절대 금지. 영어 단어도 절대 섞지 마라
  (실제로 나온 실수 예 — 이런 식으로 단어 하나만 영어/독일어로 새는 것 금지: "klassischen",
  "repeatedly", "enthusiast", "conscious", "perspective", "cola"(→"콜라"로 쓸 것)). 브랜드
  고유명사(코카콜라, 펩시 등)만 예외.
- 최소 1600자 이상 — 짧고 성의 없다는 피드백을 받았으니 각 섹션을 충분히 구체적으로 늘려 써라.
- {{CTA_BUTTON}}, {{COMPARISON_TABLE}} 토큰 외에는 본문에 링크나 이미지 태그를 절대 넣지 마라(이미지 URL을 직접 지어내지 마라).
- 마커나 섹션 이름(TITLE, CONTENT 등)을 본문/제목 텍스트 안에 절대 포함하지 마라 — 아래 지정된 구분자 형식 밖에는 어떤 텍스트도 추가하지 마라.
- 없는 사실(가짜 리뷰, 가짜 가격 비교, 가짜 정가)을 지어내지 마라 — 과장은 표현 수위에서만, 데이터는 항상 정직하게.
- 출력은 순수 HTML(<p>, <h2>, <ul><li> 등)만. 마크다운, 코드블록, 설명 문구 없이.
- 태그를 연 것과 같은 종류로 정확히 닫아라 — 특히 <h2>로 연 소제목을 </p>로 닫는 실수(실제로 나온 적 있음) 절대 금지. 모든 태그는 열고 닫는 종류가 반드시 일치해야 한다.
- 제목은 "가격 분석 및 구매 가이드" 같은 밋밋한 톤 금지 — 클릭하고 싶어지는 제목으로(과장/허위 없이), 매번 다른 각도로.
- 반드시 아래 형식으로만 출력, 다른 텍스트 절대 추가하지 마라:
[[[TITLE]]]
제목 (50자 이내)
[[[CONTENT]]]
본문 HTML`;

  const aiText = await generateText(prompt, aiModel);
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
  if (comparisonHtml) {
    const firstH2End = content.indexOf('</h2>');
    if (firstH2End !== -1) content = content.slice(0, firstH2End + 5) + comparisonHtml + content.slice(firstH2End + 5);
    else content = comparisonHtml + content;
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

  return { title, content };
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
  if (config.product_source === 'keyword' && config.search_keywords?.length) {
    const kw = config.search_keywords[Math.floor(Math.random() * config.search_keywords.length)];
    products = await searchProducts(kw, accessKey, secretKey);
  } else {
    products = await getGoldboxProducts(accessKey, secretKey);
  }

  if (!products?.length) throw new Error('상품을 가져오지 못했습니다');

  // 최근 발행하지 않은 상품 중 할인율 높은 순으로 선택 — 실측 비교: 그냥 첫 상품(콜라)보다
  // 할인율 기준으로 고른 상품(다이어트 식단 세트)이 훨씬 설득력 있는 글이 나옴을 확인.
  // 이미지 없는 상품은 비교 그리드/대표이미지 둘 다 부실해지므로 후보에서 제외.
  const pool = (config.min_discount
    ? products.filter(p => (p.discountRate || 0) >= config.min_discount!)
    : products
  ).filter(p => p.productImage);
  const ranked = [...(pool.length ? pool : products)].sort((a, b) => (b.discountRate || 0) - (a.discountRate || 0));
  const candidates = ranked.filter(p => !recentProductIds.includes(String(p.productId)));
  const product = (candidates.length ? candidates : ranked)[0] as {
    productId: number | string;
    productName: string;
    productPrice: number;
    productUrl: string;
    productImage?: string;
    discountRate?: number;
  };

  // 제휴링크 생성
  let affiliateUrl = product.productUrl;
  try {
    const links = await createAffiliateLinks([product.productUrl], accessKey, secretKey);
    if (links[0]) affiliateUrl = links[0];
  } catch { /* 폴백: 원본 URL */ }

  // SNS 텍스트 생성
  const TAGS = ['THREADS', 'TWITTER', 'FACEBOOK', 'INSTAGRAM'];
  const prompt = `너는 SNS 마케팅 전문가야. 쿠팡 파트너스 상품을 각 SNS 플랫폼에 맞는 후킹성 멘트로 작성해줘.
반드시 한국어로만 작성하고, 중국어·일본어 등 외국 문자 절대 사용 금지.

상품명: ${product.productName}
가격: ${product.productPrice.toLocaleString()}원${(product as typeof product & { discountRate?: number }).discountRate ? ` (-${(product as typeof product & { discountRate: number }).discountRate}%)` : ''}

[플랫폼별 작성 규칙]
- THREADS: 줄바꿈으로 리듬감. 2~4줄 짧은 문장. 이모지 1~2개. URL 없이 (댓글로 추가)
- TWITTER: 한 방에 꽂히는 문장 + 해시태그 2~3개. 240자 이내. URL 없이 (댓글로 추가)
- FACEBOOK: 친근하게 250자 내외. 이모지 적당히. URL 없이
- INSTAGRAM: 감성적, 이모지 풍부, 해시태그 10개. URL 없이

반드시 아래 구분자 형식으로만 출력 (설명/코드블록 없이):
[[[THREADS]]]
스레드용 텍스트
[[[TWITTER]]]
트위터용 텍스트
[[[FACEBOOK]]]
페이스북용 텍스트
[[[INSTAGRAM]]]
인스타그램용 텍스트`;

  const aiText = await generateText(prompt, 'qwen3');

  const textMap: Record<string, string> = {
    threads:   getSection(aiText, 'THREADS', TAGS),
    twitter:   getSection(aiText, 'TWITTER', TAGS),
    facebook:  getSection(aiText, 'FACEBOOK', TAGS),
    instagram: getSection(aiText, 'INSTAGRAM', TAGS),
  };

  const comment = `🔗 상품 링크: ${affiliateUrl}\n\n${DISCLOSURE}`;

  // 발행 대상 — 미지정 시 기존 동작(SNS만)과 동일하게 하위호환
  const targets = config.publish_targets?.length ? config.publish_targets : ['sns'];
  const platforms = targets.includes('sns')
    ? config.sns_platforms.filter(p => ['threads', 'twitter', 'facebook', 'instagram'].includes(p))
    : [];
  const results: string[] = [];

  if (platforms.length) {
    const connections = await getSnsConnections(schedule.user_id);
    for (const platform of platforms) {
      // "연결된 SNS 모두 발행" — 같은 플랫폼에 계정이 여러 개 연결돼 있으면(스레드 5개,
      // 인스타 3개 등) 첫 번째 하나만 쓰지 않고 전부에 발행한다.
      const conns = connections.filter(c => c.platform === platform);
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
            text,
            product.productImage ? [product.productImage] : undefined,
          );
          // 제휴링크를 댓글로
          try {
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
  if (targets.includes('wordpress') && config.wp_site_id) {
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
      const { title, content } = await buildProductBlogPost(product, affiliateUrl, config.ai_model || 'claude', scraped, comparisonProducts);
      const { url, username, appPassword } = await getWpCredentials(config.wp_site_id);
      wordpressUrl = await publishToWordPress(url, username, appPassword, title, content, product.productImage || null);
      results.push(`wordpress: 발행 완료 (${wordpressUrl})`);
    } catch (err) {
      // 실측: 이 실패 사유가 results 배열에만 담기고 서버 로그엔 안 남아서, 자동실행이
      // 조용히 실패했을 때 원인을 나중에 알 방법이 없었다 — 항상 로그에도 남긴다.
      console.error('[coupang-runner] wordpress 발행 실패:', err);
      results.push(`wordpress: ${(err as Error).message?.slice(0, 80) || '실패'}`);
    }
  }

  return { productId: String(product.productId), productName: product.productName, platforms, results, wordpressUrl };
}
