import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

// Google Custom Search 이미지 검색 (설정 페이지 DB 키 사용)
async function searchGoogle(query: string, count = 9): Promise<{ url: string; thumb: string; author: string }[]> {
  const [apiKey, cx] = await Promise.all([
    getSetting('GOOGLE_SEARCH_API_KEY'),
    getSetting('GOOGLE_SEARCH_CX'),
  ]);
  if (!apiKey || !cx) return [];
  try {
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&searchType=image&num=${Math.min(count, 10)}&safe=active&imgSize=large`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((item: { link: string; image?: { thumbnailLink: string }; displayLink: string }) => ({
      url: item.link,
      thumb: item.image?.thumbnailLink || item.link,
      author: item.displayLink,
    }));
  } catch { return []; }
}

// Pixabay 이미지 검색 (설정 페이지 DB 키 사용)
async function searchPixabay(query: string, count = 9): Promise<{ url: string; thumb: string; author: string }[]> {
  const apiKey = await getSetting('PIXABAY_API_KEY');
  if (!apiKey) return [];
  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${count}&safesearch=true&min_width=600`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits || []).map((h: { webformatURL: string; previewURL: string; user: string }) => ({
      url: h.webformatURL,
      thumb: h.previewURL,
      author: h.user,
    }));
  } catch { return []; }
}

// X.com 수집 이미지 검색 (bossai_x_videos 중 이미지 확장자, 키워드로 본문/계정 검색)
async function searchSnsImages(query: string, limit = 12) {
  const supabase = createAdminClient();
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

  // 키워드로 tweet_text 또는 username 검색
  let q = supabase
    .from('bossai_x_videos')
    .select('id, username, video_url, tweet_url, tweet_text, collected_at')
    .order('collected_at', { ascending: false })
    .limit(limit * 5);

  if (query) {
    q = q.or(`tweet_text.ilike.%${query}%,username.ilike.%${query}%`);
  }

  const { data } = await q;
  if (!data) return [];

  const filtered = data
    .filter(item => {
      const ext = item.video_url?.split('.').pop()?.toLowerCase().split('?')[0];
      return imageExts.includes(ext || '');
    })
    .slice(0, limit);

  // 결과 없으면 키워드 없이 최신 이미지 반환
  if (filtered.length === 0 && query) {
    const { data: fallback } = await supabase
      .from('bossai_x_videos')
      .select('id, username, video_url, tweet_url, tweet_text, collected_at')
      .order('collected_at', { ascending: false })
      .limit(limit * 3);

    return (fallback || [])
      .filter(item => {
        const ext = item.video_url?.split('.').pop()?.toLowerCase().split('?')[0];
        return imageExts.includes(ext || '');
      })
      .slice(0, limit)
      .map(item => ({
        url: item.video_url,
        thumb: item.video_url,
        author: `@${item.username}`,
        source: 'x.com',
        tweet_url: item.tweet_url,
        caption: item.tweet_text?.slice(0, 60),
      }));
  }

  return filtered.map(item => ({
    url: item.video_url,
    thumb: item.video_url,
    author: `@${item.username}`,
    source: 'x.com',
    tweet_url: item.tweet_url,
    caption: item.tweet_text?.slice(0, 60),
  }));
}

// 네이버 이미지 검색
async function searchNaver(query: string, count = 9): Promise<{ url: string; thumb: string; author: string }[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/image.json?query=${encodeURIComponent(query)}&display=${count}&sort=sim`,
      { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || [])
      .filter((item: { link: string }) => item.link?.startsWith('http'))
      .map((item: { link: string; thumbnail: string; title: string }) => ({
        url: item.link,
        thumb: item.thumbnail || item.link,
        author: item.title?.replace(/<[^>]+>/g, '') || '네이버',
      }));
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const action = req.nextUrl.searchParams.get('action');
  const q = req.nextUrl.searchParams.get('q') || '';

  if (action === 'naver') {
    const images = await searchNaver(q);
    return NextResponse.json({ images });
  }

  if (action === 'google') {
    const images = await searchGoogle(q);
    if (images.length === 0) {
      // Google 없으면 네이버로 폴백
      const fallback = await searchNaver(q);
      return NextResponse.json({ images: fallback, fallback: true });
    }
    return NextResponse.json({ images });
  }

  if (action === 'pixabay') {
    const images = await searchPixabay(q);
    return NextResponse.json({ images });
  }

  if (action === 'sns') {
    const images = await searchSnsImages(q);
    return NextResponse.json({ images });
  }

  return NextResponse.json({ error: 'action 필요 (naver|google|pixabay|sns)' }, { status: 400 });
}

// 사용자 파일 업로드 OR 외부 URL 다운로드 → Supabase Storage
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const contentType = req.headers.get('content-type') || '';

  // 외부 URL 다운로드 방식 (JSON body: { url })
  if (contentType.includes('application/json')) {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'url 필요' }, { status: 400 });

    const imgRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; imagebot/1.0)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!imgRes.ok) return NextResponse.json({ error: '이미지 다운로드 실패' }, { status: 400 });

    const ct = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = ct.split('/')[1]?.split(';')[0]?.replace('jpeg', 'jpg') || 'jpg';
    const path = `uploads/${user.id}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase.storage
      .from('auto-blog')
      .upload(path, buffer, { contentType: ct, upsert: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: { publicUrl } } = adminSupabase.storage.from('auto-blog').getPublicUrl(path);
    return NextResponse.json({ url: publicUrl });
  }

  // 파일 업로드 방식 (FormData)
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `uploads/${user.id}/${Date.now()}.${ext}`;

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.storage
    .from('auto-blog')
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = adminSupabase.storage.from('auto-blog').getPublicUrl(path);
  return NextResponse.json({ url: publicUrl });
}
