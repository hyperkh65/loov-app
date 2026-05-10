import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { extractFromAffiliateUrl, extractProductId } from '@/lib/coupang/api';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { affiliateUrl, productUrl } = await req.json() as { affiliateUrl?: string; productUrl?: string };

  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const result: Record<string, unknown> = {};

  // 1. URL 파싱 결과
  const fromAffiliate = affiliateUrl ? extractFromAffiliateUrl(affiliateUrl) : null;
  const productId = fromAffiliate?.productId
    || (productUrl ? extractProductId(productUrl) : null)
    || (affiliateUrl ? extractProductId(affiliateUrl) : null);
  const itemId = fromAffiliate?.itemId
    || (productUrl ? (() => { try { return new URL(productUrl).searchParams.get('itemId'); } catch { return null; } })() : null);

  result.parsed = { productId, itemId, fromAffiliate };

  if (!productId) return NextResponse.json({ error: '상품 ID 추출 실패', result }, { status: 400 });

  // 2. 홈페이지 쿠키 수집
  let homeCookies = '';
  try {
    const homeRes = await fetch('https://www.coupang.com/', {
      headers: { 'User-Agent': ua, 'Accept': 'text/html', 'Accept-Language': 'ko-KR,ko;q=0.9' },
      signal: AbortSignal.timeout(8000),
    });
    result.homeStatus = homeRes.status;
    const setCookie = homeRes.headers.get('set-cookie');
    if (setCookie) {
      homeCookies = setCookie.split(',').map(c => c.split(';')[0].trim()).join('; ');
      result.homeCookies = homeCookies.slice(0, 100) + '...';
    }
  } catch (e) {
    result.homeError = String(e);
  }

  // 3. 상품 페이지 fetch
  let productCookies = homeCookies;
  try {
    const prodRes = await fetch(`https://www.coupang.com/vp/products/${productId}`, {
      headers: {
        'User-Agent': ua, 'Accept': 'text/html', 'Accept-Language': 'ko-KR,ko;q=0.9',
        ...(homeCookies ? { Cookie: homeCookies } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });
    result.productPageStatus = prodRes.status;
    const body = await prodRes.text();
    result.productPageSize = body.length;
    result.productPageBlocked = body.toLowerCase().includes('access denied') || body.length < 500;

    const setCookie2 = prodRes.headers.get('set-cookie');
    if (setCookie2) {
      const moreCookies = setCookie2.split(',').map(c => c.split(';')[0].trim()).join('; ');
      productCookies = [homeCookies, moreCookies].filter(Boolean).join('; ');
    }

    // itemId를 HTML에서도 찾기
    if (!itemId) {
      const m = body.match(/"productItemId"\s*:\s*(\d+)/) || body.match(/"defaultItemId"\s*:\s*(\d+)/);
      if (m) result.itemIdFromHtml = m[1];
    }
  } catch (e) {
    result.productPageError = String(e);
  }

  const resolvedItemId = itemId || (result.itemIdFromHtml as string | undefined);
  result.resolvedItemId = resolvedItemId;

  // 4. 리뷰 API 호출
  if (resolvedItemId) {
    try {
      const reviewUrl = `https://www.coupang.com/vp/products/${productId}/reviews?productItemId=${resolvedItemId}&limit=5&sortBy=DATE&isLastPage=false&isAppliedAbTest=false&_=${Date.now()}`;
      const reviewRes = await fetch(reviewUrl, {
        headers: {
          'User-Agent': ua,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': `https://www.coupang.com/vp/products/${productId}`,
          'X-Requested-With': 'XMLHttpRequest',
          ...(productCookies ? { Cookie: productCookies } : {}),
        },
        signal: AbortSignal.timeout(8000),
      });
      result.reviewApiStatus = reviewRes.status;
      const reviewText = await reviewRes.text();
      result.reviewResponseSize = reviewText.length;
      result.reviewResponsePreview = reviewText.slice(0, 300);

      if (reviewRes.ok) {
        try {
          const json = JSON.parse(reviewText) as Record<string, unknown>;
          const nested = json['data'] as Record<string, unknown> | undefined;
          const list = (json.reviews || nested?.['reviews'] || json.reviewList || json.content || []) as unknown[];
          result.reviewCount = list.length;
          result.reviewKeys = json ? Object.keys(json) : [];
        } catch {
          result.reviewJsonError = '파싱 실패 (HTML 응답?)';
        }
      }
    } catch (e) {
      result.reviewApiError = String(e);
    }
  } else {
    result.reviewApiSkipped = 'itemId 없음';
  }

  return NextResponse.json(result);
}
