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

// ── 스크래핑 ──────────────────────────────────────────

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** protocol-relative URL을 https로 변환 */
function toAbsoluteUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('http')) return url;
  return '';
}

/** Playwright + Stealth 기반 스크래핑 (봇 감지 우회) */
async function scrapeWithBrowser(productId: string): Promise<ScrapedProduct> {
  // playwright-extra + stealth plugin 동적 로드
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = await import('playwright-extra');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (chromium as any).use(StealthPlugin());

  // Mac이면 실제 Chrome 사용 (봇 감지 우회 효과 높음)
  const chromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ];
  const fs = await import('fs');
  const executablePath = chromePaths.find((p) => {
    try { fs.accessSync(p); return true; } catch { return false; }
  }) || undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const browser = await (chromium as any).launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8' },
  });

  const page = await context.newPage();

  // 리뷰 XHR 인터셉트
  const reviewData: CoupangReview[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.on('response', async (response: any) => {
    const url = response.url();
    if (url.includes('/reviews') && response.status() === 200) {
      try {
        const ct = response.headers()['content-type'] || '';
        if (!ct.includes('json')) return;
        const json = await response.json();
        const list: Record<string, unknown>[] =
          json.reviews || json.data?.reviews || json.reviewList || json.content || [];
        for (const r of list.slice(0, 5)) {
          const content = String(r.content || r.reviewContent || r.body || r.text || '');
          if (content.length > 10 && reviewData.length < 3) {
            reviewData.push({
              reviewer: String(r.nickname || r.reviewer || r.name || '구매자'),
              rating: Number(r.rating || r.starRating || r.score || 5),
              content,
              images: (
                (r.attachedPhotoUrls || r.photoUrls || r.images || []) as string[]
              ).slice(0, 2).map(toAbsoluteUrl).filter(Boolean),
              date: String(r.reviewDate || r.createdAt || r.writeDate || ''),
            });
          }
        }
      } catch { /* ignore */ }
    }
  });

  try {
    // 홈 → 상품 페이지 순서로 자연스러운 탐색 (봇 감지 회피)
    await page.goto('https://www.coupang.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(1000 + Math.random() * 1000);

    await page.goto(`https://www.coupang.com/vp/products/${productId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await sleep(2000 + Math.random() * 1000);

    // 자연스러운 스크롤 (리뷰 lazy load 트리거)
    await page.evaluate(() => {
      let pos = 0;
      const scroll = () => {
        pos += 300;
        window.scrollTo(0, pos);
      };
      for (let i = 0; i < 10; i++) setTimeout(scroll, i * 200);
    });
    await sleep(3000);

    const result = await page.evaluate(() => {
      const fixUrl = (url: string): string => {
        if (!url) return '';
        if (url.startsWith('//')) return 'https:' + url;
        return url.startsWith('http') ? url : '';
      };

      // 상품명
      const nameEl = document.querySelector(
        '.prod-buy-header__title, h2.prod-name, [class*="prod-title"], .product-title h1, .product-title h2',
      );
      let name = nameEl?.textContent?.trim() || '';
      if (!name) {
        name = document.querySelector('meta[property="og:title"]')
          ?.getAttribute('content')
          ?.replace(/\s*[\|｜]\s*쿠팡.*$/i, '')
          .trim() || '';
      }
      if (!name) name = document.title.replace(/\s*[\|｜]\s*쿠팡.*$/i, '').trim();

      // 가격
      const priceEl = document.querySelector(
        '.total-price strong, .prod-price-value, [class*="total-price"] strong, [class*="price-value"]',
      );
      const price = Number((priceEl?.textContent || '').replace(/[^0-9]/g, '')) || 0;

      // 원가
      const oldPriceEl = document.querySelector(
        '[class*="base-price"], [class*="origin-price"], del[class*="price"], [class*="before-price"], strike',
      );
      const oldPrice = Number((oldPriceEl?.textContent || '').replace(/[^0-9]/g, '')) || 0;

      // 할인율
      const discountEl = document.querySelector('[class*="discount-rate"], [class*="sale-rate"]');
      const discount = Number((discountEl?.textContent || '').replace(/[^0-9]/g, '')) || 0;

      // 이미지 수집
      const ogImage = fixUrl(
        document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
      );
      const images: string[] = ogImage ? [ogImage] : [];

      // 상품 이미지 갤러리
      const imgSelectors = [
        '.prod-image__item img',
        '[class*="prod-image"] img',
        '.prod-img img',
        '[class*="product-image"] img',
        '[class*="swiper-slide"] img',
      ];
      for (const sel of imgSelectors) {
        const els = Array.from(document.querySelectorAll(sel));
        for (const img of els) {
          const src = fixUrl(
            (img as HTMLImageElement).src
              || img.getAttribute('data-src')
              || img.getAttribute('data-lazy')
              || img.getAttribute('data-original')
              || '',
          );
          if (src && !src.includes('.gif') && !src.includes('icon') && !src.includes('data:') && !images.includes(src)) {
            images.push(src);
          }
          if (images.length >= 6) break;
        }
        if (images.length >= 3) break;
      }

      // CDN 이미지 직접 탐색 (fallback)
      if (images.length < 2) {
        Array.from(document.querySelectorAll('img')).forEach((img) => {
          const src = fixUrl((img as HTMLImageElement).src || img.getAttribute('data-src') || '');
          if (
            src
            && src.includes('coupangcdn.com')
            && !src.includes('.gif')
            && !src.includes('icon')
            && !images.includes(src)
          ) {
            images.push(src);
          }
        });
      }

      return {
        name,
        price,
        oldPrice,
        discount,
        images: images.slice(0, 4),
        isBlocked: document.title.toLowerCase().includes('access denied') || document.body.innerText.includes('Access Denied'),
      };
    });

    if (result.isBlocked) {
      throw new Error('쿠팡 접근 차단 (봇 감지)');
    }

    await sleep(1500);

    return {
      productName: result.name,
      productPrice: result.price,
      productOldPrice: result.oldPrice,
      discountRate: result.discount,
      reviews: reviewData,
      images: result.images,
    };
  } finally {
    await browser.close();
  }
}

/** fetch 기반 스크래핑 (Playwright 실패 시 폴백) */
async function scrapeWithFetch(productId: string | number): Promise<ScrapedProduct> {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
  const productUrl = `https://www.coupang.com/vp/products/${productId}`;

  let html = '';
  try {
    const res = await fetch(productUrl, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'sec-ch-ua': '"Google Chrome";v="123", "Chromium";v="123", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
      },
      redirect: 'follow',
    });
    if (res.ok) html = await res.text();
  } catch { /* ignore */ }

  if (!html || html.includes('Access Denied')) {
    return { productName: '', productPrice: 0, productOldPrice: 0, discountRate: 0, reviews: [], images: [] };
  }

  // og:image 추출
  const images: string[] = [];
  const ogImg = html.match(/property="og:image"\s+content="([^"]+)"/)
    || html.match(/content="([^"]+)"\s+property="og:image"/);
  if (ogImg) {
    const u = toAbsoluteUrl(ogImg[1]);
    if (u) images.push(u);
  }

  // CDN 이미지
  for (const m of html.matchAll(/https?:\/\/[a-z0-9]+\.coupangcdn\.com\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)/gi)) {
    const url = m[0].split('?')[0];
    if (!images.includes(url)) images.push(url);
    if (images.length >= 6) break;
  }

  // og:title
  const titleMatch = html.match(/property="og:title"\s+content="([^"]+)"/)
    || html.match(/content="([^"]+)"\s+property="og:title"/);
  const name = titleMatch ? titleMatch[1].replace(/\s*[\|｜]\s*쿠팡.*$/i, '').trim() : '';

  // JSON-LD 가격
  let price = 0;
  let oldPrice = 0;
  for (const m of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const ld = JSON.parse(m[1]);
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item.offers?.price) price = Number(String(item.offers.price).replace(/[^0-9]/g, '')) || 0;
      }
    } catch { /* skip */ }
  }
  if (!price) {
    const pm = html.match(/"finalPrice"\s*:\s*(\d+)/) || html.match(/"salePrice"\s*:\s*(\d+)/);
    if (pm) price = Number(pm[1]);
  }
  if (!oldPrice) {
    const om = html.match(/"basePrice"\s*:\s*(\d+)/) || html.match(/"originalPrice"\s*:\s*(\d+)/);
    if (om) oldPrice = Number(om[1]);
  }
  const discount = price && oldPrice && oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;

  return { productName: name, productPrice: price, productOldPrice: oldPrice, discountRate: discount, reviews: [], images: images.slice(0, 4) };
}

/** 상품 데이터 스크래핑 (Playwright 우선, fetch 폴백) */
export async function scrapeProductData(productId: string | number): Promise<ScrapedProduct> {
  try {
    return await scrapeWithBrowser(String(productId));
  } catch (err) {
    console.warn('[coupang] browser scrape failed, falling back to fetch:', err);
    return await scrapeWithFetch(productId);
  }
}
