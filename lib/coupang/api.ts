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

// ── 리뷰 + 이미지 스크래핑 (best-effort) ───────────────

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.coupang.com/',
};

export async function scrapeProductData(productId: string | number): Promise<{
  reviews: CoupangReview[];
  images: string[];
}> {
  const reviews: CoupangReview[] = [];
  const images: string[] = [];

  // 1. 상품 페이지 HTML에서 이미지 + 리뷰 파싱 시도
  try {
    const pageRes = await fetch(`https://www.coupang.com/vp/products/${productId}`, {
      headers: SCRAPE_HEADERS,
    });

    if (pageRes.ok) {
      const html = await pageRes.text();

      // 상품 이미지 추출 (og:image, 상품 이미지 패턴)
      const imgMatches = html.matchAll(/thumbnail\d*\.coupangcdn\.com\/thumbnails\/[^"']+\.jpg/g);
      for (const m of imgMatches) {
        const url = `https://${m[0]}`;
        if (!images.includes(url)) images.push(url);
        if (images.length >= 4) break;
      }

      // og:image
      const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
      if (ogMatch && !images.includes(ogMatch[1])) images.unshift(ogMatch[1]);

      // JSON-LD 파싱 (일부 페이지에서 리뷰 포함)
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (jsonLdMatch) {
        try {
          const ld = JSON.parse(jsonLdMatch[1]);
          const ldReviews = Array.isArray(ld.review) ? ld.review : (ld.review ? [ld.review] : []);
          for (const r of ldReviews.slice(0, 3)) {
            if (r.reviewBody) {
              reviews.push({
                reviewer: r.author?.name || '구매자',
                rating: r.reviewRating?.ratingValue || 5,
                content: r.reviewBody,
                images: [],
                date: r.datePublished,
              });
            }
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  // 2. 리뷰 JSON API 시도
  if (reviews.length === 0) {
    try {
      const reviewRes = await fetch(
        `https://www.coupang.com/vp/products/${productId}/reviews?page=0&per_page=5&sortBy=SCORE_DESC&ratings=5&q=&isOpen=Y`,
        { headers: { ...SCRAPE_HEADERS, Accept: 'application/json, text/plain, */*' } },
      );
      if (reviewRes.ok) {
        const ct = reviewRes.headers.get('content-type') || '';
        if (ct.includes('json')) {
          const data = await reviewRes.json();
          const list: Record<string, unknown>[] = data.reviews || data.data?.reviews || data.reviewList || [];
          for (const r of list.slice(0, 3)) {
            const content = (r.content || r.reviewContent || r.text || '') as string;
            if (content.length > 10) {
              reviews.push({
                reviewer: (r.nickname || r.reviewerName || r.name || '구매자') as string,
                rating: (r.rating || r.starRating || 5) as number,
                content,
                images: ((r.attachedPhotoUrls || r.images || []) as string[]).slice(0, 2),
                date: (r.reviewDate || r.createdAt || '') as string,
              });
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  return { reviews, images: images.slice(0, 4) };
}
