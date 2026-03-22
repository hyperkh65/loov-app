import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

// Google Custom Search 이미지 검색
async function searchGoogle(query: string, count = 9): Promise<{ url: string; thumb: string; author: string }[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;
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

// Pixabay 이미지 검색
async function searchPixabay(query: string, count = 9): Promise<{ url: string; thumb: string; author: string }[]> {
  const apiKey = process.env.PIXABAY_API_KEY;
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

// X.com 수집 이미지 검색 (bossai_x_videos 중 이미지 확장자)
async function searchSnsImages(query: string, limit = 12) {
  const supabase = createAdminClient();
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

  let q = supabase
    .from('bossai_x_videos')
    .select('id, username, video_url, tweet_url, collected_at')
    .order('collected_at', { ascending: false })
    .limit(limit * 3);

  if (query) q = q.ilike('username', `%${query}%`);

  const { data } = await q;
  if (!data) return [];

  return data
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
    }));
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const action = req.nextUrl.searchParams.get('action');
  const q = req.nextUrl.searchParams.get('q') || '';

  if (action === 'google') {
    const images = await searchGoogle(q);
    // Google 없으면 Pixabay로 폴백
    if (images.length === 0) {
      const fallback = await searchPixabay(q);
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

  return NextResponse.json({ error: 'action 필요 (google|pixabay|sns)' }, { status: 400 });
}

// 사용자 파일 업로드 → Supabase Storage
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

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
