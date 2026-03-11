import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

interface NaverShopItem {
  title: string;
  link: string;
  image: string;
  lprice: string;
  hprice: string;
  mallName: string;
  productId: string;
  productType: string;
  brand: string;
  maker: string;
  category1: string;
  category2: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';
  const source = searchParams.get('source') || 'naver'; // 'naver' | 'coupang' | 'all'

  if (!query) return NextResponse.json({ error: '검색어를 입력하세요' }, { status: 400 });

  const naverClientId = await getSetting('NAVER_CLIENT_ID');
  const naverClientSecret = await getSetting('NAVER_CLIENT_SECRET');

  const results: Array<{
    source: string;
    title: string;
    price: number;
    originalPrice?: number;
    discountRate?: number;
    image: string;
    url: string;
    mall: string;
    brand?: string;
  }> = [];

  // Naver Shopping API
  if ((source === 'naver' || source === 'all') && naverClientId && naverClientSecret) {
    try {
      const res = await fetch(
        `https://openapi.naver.com/v1/search/shop?query=${encodeURIComponent(query)}&display=20&sort=sim`,
        {
          headers: {
            'X-Naver-Client-Id': naverClientId,
            'X-Naver-Client-Secret': naverClientSecret,
          },
        }
      );
      const data = await res.json() as { items?: NaverShopItem[] };
      if (data.items) {
        for (const item of data.items) {
          const cleanTitle = item.title.replace(/<[^>]+>/g, '');
          results.push({
            source: 'naver',
            title: cleanTitle,
            price: parseInt(item.lprice) || 0,
            originalPrice: item.hprice ? parseInt(item.hprice) : undefined,
            image: item.image,
            url: item.link,
            mall: item.mallName || '네이버쇼핑',
            brand: item.brand,
          });
        }
      }
    } catch { /* ignore */ }
  }

  // Coupang (via partner API affiliate link search)
  if (source === 'coupang' || source === 'all') {
    const coupangAccessKey = await getSetting('COUPANG_ACCESS_KEY');
    const coupangSecretKey = await getSetting('COUPANG_SECRET_KEY');

    if (coupangAccessKey && coupangSecretKey) {
      try {
        // Coupang Products API
        const method = 'GET';
        const path = `/v2/providers/affiliate_open_api/apis/openapi/products/search?keyword=${encodeURIComponent(query)}&limit=20&subId=loov`;
        const datetime = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const message = `${datetime}${method}${path}`;

        const { createHmac } = await import('crypto');
        const hmac = createHmac('sha256', coupangSecretKey);
        hmac.update(message);
        const signature = hmac.digest('hex');

        const authorization = `CEA algorithm=HmacSHA256, access-key=${coupangAccessKey}, signed-date=${datetime}, signature=${signature}`;

        const res = await fetch(`https://api-gateway.coupang.com${path}`, {
          headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        });
        const data = await res.json() as { data?: { productData?: Array<{ productName: string; productPrice: number; productImage: string; productUrl: string; mallName?: string }> } };

        if (data.data?.productData) {
          for (const item of data.data.productData) {
            results.push({
              source: 'coupang',
              title: item.productName,
              price: item.productPrice,
              image: item.productImage,
              url: item.productUrl,
              mall: '쿠팡',
            });
          }
        }
      } catch { /* ignore */ }
    }
  }

  // Sort by price
  results.sort((a, b) => a.price - b.price);

  return NextResponse.json({
    results,
    query,
    hasNaverApi: !!(naverClientId && naverClientSecret),
    hasCoupangApi: !!(await getSetting('COUPANG_ACCESS_KEY')),
  });
}
