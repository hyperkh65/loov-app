import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export const runtime = 'edge';
export const preferredRegion = ['icn1', 'hnd1'];

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}
interface NaverBlogItem {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  postdate: string;
}
interface NaverShopItem {
  title: string;
  link: string;
  image: string;
  lprice: string;
  mallName: string;
  brand: string;
  category1: string;
}

// 뉴스/블로그/쇼핑 검색 시 사용할 인기 시드 키워드
const NEWS_SEEDS = ['오늘 이슈', '화제', '뉴스', '사건', '정치 경제', '연예'];
const BLOG_SEEDS = ['리뷰', '맛집', '여행', '재테크', '건강', '다이어트', '육아'];
const SHOP_SEEDS = ['인기 상품', '베스트셀러', '신상', '화장품', '식품', '가전', '패션'];

async function fetchNaver<T>(
  endpoint: string,
  query: string,
  clientId: string,
  clientSecret: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const qs = new URLSearchParams({ query, display: '10', start: '1', sort: 'date', ...params });
  const res = await fetch(`https://openapi.naver.com/v1/search/${endpoint}.json?${qs}`, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  });
  if (!res.ok) return [];
  const data = await res.json() as { items?: T[] };
  return data.items || [];
}

function cleanTitle(title: string) {
  return title.replace(/<\/?b>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function isWithinHours(dateStr: string, hours: number): boolean {
  try {
    const pubDate = new Date(dateStr);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return pubDate >= cutoff;
  } catch { return true; }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const period = new URL(req.url).searchParams.get('period') || 'recommended';

  const clientId = await getSetting('NAVER_CLIENT_ID');
  const clientSecret = await getSetting('NAVER_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: '네이버 Client ID/Secret을 설정에서 등록해주세요.' }, { status: 400 });
  }

  const hourLimit = period === '1h' ? 1 : period === '24h' ? 24 : null;

  try {
    // ── 뉴스 랭킹 ─────────────────────────────────────────────────────────────
    const newsSeeds = period === 'recommended'
      ? ['오늘 이슈', '화제', '뉴스']
      : period === '1h'
      ? ['속보', '뉴스', '이슈']
      : NEWS_SEEDS.slice(0, 3);

    const newsPromises = newsSeeds.map(q =>
      fetchNaver<NaverNewsItem>('news', q, clientId, clientSecret,
        period === 'recommended' ? { sort: 'sim' } : { sort: 'date' }
      )
    );
    const newsArrays = await Promise.all(newsPromises);
    const allNews = newsArrays.flat();

    // 중복 제거 + 시간 필터
    const seenNews = new Set<string>();
    const filteredNews = allNews.filter(item => {
      const key = item.originallink || item.link;
      if (seenNews.has(key)) return false;
      seenNews.add(key);
      if (hourLimit && !isWithinHours(item.pubDate, hourLimit)) return false;
      return true;
    }).slice(0, 10);

    const news = filteredNews.map(item => ({
      title: cleanTitle(item.title),
      url: item.originallink || item.link,
      desc: cleanTitle(item.description).slice(0, 60),
      date: item.pubDate,
    }));

    // ── 블로그 랭킹 ───────────────────────────────────────────────────────────
    const blogSeeds = period === 'recommended'
      ? ['리뷰 추천', '인기 블로그', '맛집']
      : period === '1h'
      ? ['오늘 리뷰', '방금 포스팅', '리뷰']
      : BLOG_SEEDS.slice(0, 3);

    const blogPromises = blogSeeds.map(q =>
      fetchNaver<NaverBlogItem>('blog', q, clientId, clientSecret,
        period === 'recommended' ? { sort: 'sim' } : { sort: 'date' }
      )
    );
    const blogArrays = await Promise.all(blogPromises);
    const allBlogs = blogArrays.flat();

    const seenBlogs = new Set<string>();
    const filteredBlogs = allBlogs.filter(item => {
      if (seenBlogs.has(item.link)) return false;
      seenBlogs.add(item.link);
      if (hourLimit) {
        // postdate format: YYYYMMDD
        const pd = item.postdate;
        if (pd && pd.length === 8) {
          const d = new Date(`${pd.slice(0,4)}-${pd.slice(4,6)}-${pd.slice(6,8)}`);
          if (hourLimit === 1 && Date.now() - d.getTime() > 3 * 60 * 60 * 1000) return false;
        }
      }
      return true;
    }).slice(0, 10);

    const blog = filteredBlogs.map(item => ({
      title: cleanTitle(item.title),
      url: item.link,
      author: item.bloggername,
      date: item.postdate,
    }));

    // ── 쇼핑 랭킹 ─────────────────────────────────────────────────────────────
    const shopSeeds = period === 'recommended'
      ? ['인기 상품', '베스트셀러']
      : period === '1h'
      ? ['신상', '인기']
      : SHOP_SEEDS.slice(0, 3);

    const shopPromises = shopSeeds.map(q =>
      fetchNaver<NaverShopItem>('shop', q, clientId, clientSecret, { sort: 'sim' })
    );
    const shopArrays = await Promise.all(shopPromises);
    const allShop = shopArrays.flat();

    const seenShop = new Set<string>();
    const filteredShop = allShop.filter(item => {
      const key = item.title + item.lprice;
      if (seenShop.has(key)) return false;
      seenShop.add(key);
      return true;
    }).slice(0, 10);

    const shopping = filteredShop.map(item => ({
      title: cleanTitle(item.title),
      url: item.link,
      price: Number(item.lprice),
      image: item.image,
      mall: item.mallName,
      brand: item.brand,
      category: item.category1,
    }));

    return NextResponse.json({ news, blog, shopping, period, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
