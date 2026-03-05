/**
 * 쿠팡파트너스 Open API 헬퍼 (서버 전용)
 * https://api.coupang.com
 */
import crypto from 'crypto';

const BASE_URL = 'https://api.coupang.com';
const API_PREFIX = '/v2/providers/affiliate_open_api/apis/openapi/v1';

export interface CoupangProduct {
  productId: number | string;
  productName: string;
  productPrice: number;
  productOldPrice?: number;
  discountRate?: number;
  productUrl: string;
  productImage: string;
  isRocket?: boolean;
  isFreeShipping?: boolean;
  categoryName?: string;
}

export interface CoupangReview {
  reviewer: string;
  rating: number;
  content: string;
  images: string[];
  date?: string;
}

// ── HMAC 서명 ─────────────────────────────────────────

function buildDatetime(): string {
  const now = new Date();
  return (
    now.getUTCFullYear().toString().slice(2) +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') +
    'T' +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0') +
    'Z'
  );
}

export function getCoupangAuth(method: string, urlPath: string, accessKey: string, secretKey: string): string {
  const datetime = buildDatetime();
  const message = `${datetime}\n${method}\n${urlPath}\n`;
  const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

async function coupangGet<T>(apiPath: string, accessKey: string, secretKey: string): Promise<T> {
  const auth = getCoupangAuth('GET', apiPath, accessKey, secretKey);
  const res = await fetch(`${BASE_URL}${apiPath}`, {
    headers: { Authorization: auth, 'Content-Type': 'application/json;charset=UTF-8' },
  });
  if (!res.ok) throw new Error(`Coupang API 오류 (${res.status}): ${await res.text()}`);
  return res.json();
}

async function coupangPost<T>(apiPath: string, accessKey: string, secretKey: string, body: object): Promise<T> {
  const auth = getCoupangAuth('POST', apiPath, accessKey, secretKey);
  const res = await fetch(`${BASE_URL}${apiPath}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Coupang API 오류 (${res.status}): ${await res.text()}`);
  return res.json();
}

// ── 상품 조회 ──────────────────────────────────────────

export async function getGoldboxProducts(accessKey: string, secretKey: string): Promise<CoupangProduct[]> {
  const path = `${API_PREFIX}/products/goldbox?targetPage=0&subId=`;
  const data = await coupangGet<{ rCode: string; data?: { productData?: CoupangProduct[] } }>(path, accessKey, secretKey);
  return data.data?.productData || [];
}

export async function searchProducts(keyword: string, accessKey: string, secretKey: string): Promise<CoupangProduct[]> {
  const path = `${API_PREFIX}/products/search?keyword=${encodeURIComponent(keyword)}&limit=20&subId=`;
  const data = await coupangGet<{ rCode: string; data?: { productData?: CoupangProduct[] } }>(path, accessKey, secretKey);
  return data.data?.productData || [];
}

// ── 제휴 링크 생성 ─────────────────────────────────────

export async function createAffiliateLinks(productUrls: string[], accessKey: string, secretKey: string): Promise<string[]> {
  const path = `${API_PREFIX}/deeplink`;
  const data = await coupangPost<{ rCode: string; data?: { shortenUrls?: string[]; landingUrl?: string } }>(
    path, accessKey, secretKey, { coupangUrls: productUrls },
  );
  return data.data?.shortenUrls || (data.data?.landingUrl ? [data.data.landingUrl] : productUrls);
}

// ── 봇 탐지 우회 스크래핑 ────────────────────────────────

// 실제 Chrome 버전 UA 풀 (주기적으로 최신 버전 반영)
const UA_POOL = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

function pickUA(): string {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

/** 실제 브라우저와 동일한 헤더 세트 생성 */
function buildPageHeaders(ua: string, referer: string, cookies: string): Record<string, string> {
  const isChrome = ua.includes('Chrome') && !ua.includes('Edge');
  const isFF = ua.includes('Firefox');
  const isWin = ua.includes('Windows');

  const h: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  };

  if (referer) h['Referer'] = referer;
  if (cookies) h['Cookie'] = cookies;

  // Chrome 전용 security headers
  if (isChrome) {
    const ver = (ua.match(/Chrome\/(\d+)/) || ['', '122'])[1];
    h['sec-ch-ua'] = `"Google Chrome";v="${ver}", "Chromium";v="${ver}", "Not-A.Brand";v="99"`;
    h['sec-ch-ua-mobile'] = '?0';
    h['sec-ch-ua-platform'] = isWin ? '"Windows"' : '"macOS"';
    h['Sec-Fetch-Dest'] = 'document';
    h['Sec-Fetch-Mode'] = 'navigate';
    h['Sec-Fetch-Site'] = referer.includes('coupang.com') ? 'same-origin' : 'none';
    h['Sec-Fetch-User'] = '?1';
  }
  if (isFF) {
    h['Sec-Fetch-Dest'] = 'document';
    h['Sec-Fetch-Mode'] = 'navigate';
    h['Sec-Fetch-Site'] = referer.includes('coupang.com') ? 'same-origin' : 'none';
    h['Sec-Fetch-User'] = '?1';
  }

  return h;
}

/** XHR/fetch 방식의 API 요청 헤더 */
function buildAjaxHeaders(ua: string, referer: string, cookies: string): Record<string, string> {
  const isChrome = ua.includes('Chrome');
  const ver = isChrome ? (ua.match(/Chrome\/(\d+)/) || ['', '122'])[1] : '';
  const isWin = ua.includes('Windows');

  const h: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Connection': 'keep-alive',
    'Referer': referer,
    'Origin': 'https://www.coupang.com',
  };

  if (cookies) h['Cookie'] = cookies;
  if (isChrome && ver) {
    h['sec-ch-ua'] = `"Google Chrome";v="${ver}", "Chromium";v="${ver}", "Not-A.Brand";v="99"`;
    h['sec-ch-ua-mobile'] = '?0';
    h['sec-ch-ua-platform'] = isWin ? '"Windows"' : '"macOS"';
    h['Sec-Fetch-Dest'] = 'empty';
    h['Sec-Fetch-Mode'] = 'cors';
    h['Sec-Fetch-Site'] = 'same-origin';
  }

  return h;
}

/** 쿠팡 홈에서 초기 세션 쿠키 획득 */
async function acquireCookies(ua: string): Promise<string> {
  try {
    const res = await fetch('https://www.coupang.com/', {
      headers: buildPageHeaders(ua, '', ''),
      redirect: 'follow',
    });

    // Node 18+ getSetCookie(), 하위 버전 fallback
    const hdrs = res.headers as unknown as { getSetCookie?: () => string[] };
    const rawCookies: string[] = typeof hdrs.getSetCookie === 'function'
      ? hdrs.getSetCookie()
      : (res.headers.get('set-cookie') || '').split(/,(?=[^;]+=)/).filter(Boolean);

    return rawCookies
      .map((c) => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  } catch {
    return '';
  }
}

/** HTML에서 이미지 URL 추출 */
function extractImages(html: string): string[] {
  const images: string[] = [];

  // og:image (메인 썸네일)
  for (const m of html.matchAll(/property="og:image"\s+content="([^"]+)"/g)) {
    if (!images.includes(m[1])) images.push(m[1]);
  }
  for (const m of html.matchAll(/content="([^"]+)"\s+property="og:image"/g)) {
    if (!images.includes(m[1])) images.push(m[1]);
  }

  // 쿠팡 CDN 이미지 패턴
  for (const m of html.matchAll(/https?:\/\/[a-z0-9]+\.coupangcdn\.com\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/g)) {
    const url = m[0].split('?')[0];
    if (!images.includes(url)) images.push(url);
    if (images.length >= 6) break;
  }

  return images.slice(0, 4);
}

/** JSON-LD에서 리뷰 추출 */
function extractJsonLdReviews(html: string): CoupangReview[] {
  const reviews: CoupangReview[] = [];
  for (const m of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const ld = JSON.parse(m[1]);
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        const raw = Array.isArray(item.review) ? item.review : (item.review ? [item.review] : []);
        for (const r of raw.slice(0, 3)) {
          if (r.reviewBody?.length > 10) {
            reviews.push({
              reviewer: r.author?.name || '구매자',
              rating: Number(r.reviewRating?.ratingValue) || 5,
              content: r.reviewBody,
              images: [],
              date: r.datePublished,
            });
          }
        }
      }
    } catch { /* skip */ }
  }
  return reviews;
}

/** __NEXT_DATA__ 또는 window 인라인 JSON에서 리뷰 추출 */
function extractInlineReviews(html: string): CoupangReview[] {
  const reviews: CoupangReview[] = [];
  // __NEXT_DATA__
  const ndMatch = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (ndMatch) {
    try {
      const nd = JSON.parse(ndMatch[1]);
      // 상품 리뷰가 props.pageProps 등에 있을 수 있음
      const str = JSON.stringify(nd);
      const reviewMatches = str.matchAll(/"reviewBody":"([^"]{20,500})"/g);
      for (const m of reviewMatches) {
        reviews.push({ reviewer: '구매자', rating: 5, content: m[1], images: [] });
        if (reviews.length >= 3) break;
      }
    } catch { /* skip */ }
  }
  return reviews;
}

/** 리뷰 JSON API 시도 (여러 엔드포인트) */
async function fetchReviewsApi(
  productId: string | number,
  ua: string,
  cookies: string,
): Promise<CoupangReview[]> {
  const referer = `https://www.coupang.com/vp/products/${productId}`;
  const endpoints = [
    `https://www.coupang.com/vp/products/${productId}/reviews?page=0&per_page=5&sortBy=SCORE_DESC&ratings=5&q=&isOpen=Y`,
    `https://www.coupang.com/vp/products/${productId}/reviews?page=0&per_page=5&sortBy=REVIEW_SCORE&isOpen=Y`,
    `https://www.coupang.com/vp/products/${productId}/reviews?page=0&per_page=3&sortBy=SCORE_DESC`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: buildAjaxHeaders(ua, referer, cookies) });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;

      const data = await res.json();
      const list: Record<string, unknown>[] =
        data.reviews || data.data?.reviews || data.reviewList || data.content || [];

      const out: CoupangReview[] = [];
      for (const r of list.slice(0, 3)) {
        const content = (r.content || r.reviewContent || r.body || r.text || '') as string;
        if (content.length > 10) {
          out.push({
            reviewer: (r.nickname || r.reviewer || r.name || r.userId || '구매자') as string,
            rating: Number(r.rating || r.starRating || r.score || 5),
            content,
            images: ((r.attachedPhotoUrls || r.photoUrls || r.images || []) as string[]).slice(0, 2),
            date: (r.reviewDate || r.createdAt || r.writeDate || '') as string,
          });
        }
      }
      if (out.length > 0) return out;
    } catch { /* try next */ }
  }
  return [];
}

// 짧은 랜덤 지연 (서버리스 함수 내 사용량 최소화)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ScrapedProduct {
  productName: string;
  productPrice: number;
  productOldPrice: number;
  discountRate: number;
  reviews: CoupangReview[];
  images: string[];
}

/** URL에서 상품 ID 추출 */
export function extractProductId(url: string): string | null {
  const m = url.match(/\/vp\/products\/(\d+)/);
  return m ? m[1] : null;
}

/** HTML에서 상품 메타정보(이름·가격) 추출 */
function extractProductMeta(html: string): { name: string; price: number; oldPrice: number; discount: number } {
  let name = '';
  let price = 0;
  let oldPrice = 0;
  let discount = 0;

  // og:title
  const titleMatch = html.match(/property="og:title"\s+content="([^"]+)"/)
    || html.match(/content="([^"]+)"\s+property="og:title"/);
  if (titleMatch) name = titleMatch[1].replace(/\s*[\|｜]\s*쿠팡.*$/, '').trim();

  // JSON-LD offers
  for (const m of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const ld = JSON.parse(m[1]);
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (!name && item.name) name = item.name;
        const offers = item.offers || (Array.isArray(item.offers) ? item.offers[0] : null);
        if (offers?.price) {
          price = Number(String(offers.price).replace(/[^0-9]/g, '')) || 0;
        }
      }
    } catch { /* skip */ }
  }

  // 인라인 가격 패턴 (JSON 데이터 또는 HTML)
  if (!price) {
    const priceMatch = html.match(/"finalPrice"\s*:\s*(\d+)/)
      || html.match(/"salePrice"\s*:\s*(\d+)/)
      || html.match(/"price"\s*:\s*"?(\d+)"?/);
    if (priceMatch) price = Number(priceMatch[1]);
  }
  if (!oldPrice) {
    const oldMatch = html.match(/"basePrice"\s*:\s*(\d+)/)
      || html.match(/"originalPrice"\s*:\s*(\d+)/)
      || html.match(/"regularPrice"\s*:\s*(\d+)/);
    if (oldMatch) oldPrice = Number(oldMatch[1]);
  }
  if (!discount && price && oldPrice && oldPrice > price) {
    discount = Math.round((1 - price / oldPrice) * 100);
  }

  return { name, price, oldPrice, discount };
}

export async function scrapeProductData(productId: string | number): Promise<ScrapedProduct> {
  let reviews: CoupangReview[] = [];
  let images: string[] = [];
  let productName = '';
  let productPrice = 0;
  let productOldPrice = 0;
  let discountRate = 0;

  // UA를 2개 준비 (실패 시 교체)
  const ua1 = pickUA();
  const ua2 = pickUA() !== ua1 ? pickUA() : UA_POOL[(UA_POOL.indexOf(ua1) + 1) % UA_POOL.length];

  // ── Step 1: 쿠키 획득 ─────────────────────────────────
  const cookies = await acquireCookies(ua1);
  await sleep(200 + Math.random() * 300); // 200~500ms 지연

  // ── Step 2: 상품 페이지 HTML 파싱 ─────────────────────
  const productUrl = `https://www.coupang.com/vp/products/${productId}`;
  let html = '';
  try {
    const res = await fetch(productUrl, {
      headers: buildPageHeaders(ua1, 'https://www.coupang.com/', cookies),
      redirect: 'follow',
    });
    if (res.ok) {
      html = await res.text();
    } else if (res.status === 403 || res.status === 429) {
      // 차단 → 다른 UA로 재시도
      await sleep(500 + Math.random() * 500);
      const res2 = await fetch(productUrl, {
        headers: buildPageHeaders(ua2, 'https://www.coupang.com/', cookies),
        redirect: 'follow',
      });
      if (res2.ok) html = await res2.text();
    }
  } catch { /* ignore */ }

  if (html) {
    images = extractImages(html);
    reviews = extractJsonLdReviews(html);
    if (reviews.length === 0) reviews = extractInlineReviews(html);
    const meta = extractProductMeta(html);
    productName = meta.name;
    productPrice = meta.price;
    productOldPrice = meta.oldPrice;
    discountRate = meta.discount;
  }

  // ── Step 3: 리뷰 API 시도 (페이지에서 못 찾은 경우) ──
  if (reviews.length === 0) {
    await sleep(300 + Math.random() * 400);
    reviews = await fetchReviewsApi(productId, ua1, cookies);
  }

  // ── Step 4: 다른 UA로 리뷰 재시도 ────────────────────
  if (reviews.length === 0) {
    await sleep(400 + Math.random() * 600);
    reviews = await fetchReviewsApi(productId, ua2, cookies);
  }

  return { productName, productPrice, productOldPrice, discountRate, reviews, images: images.slice(0, 4) };
}
