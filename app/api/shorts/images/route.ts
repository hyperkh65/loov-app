import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') ?? '';
    const perPage = Math.min(Number(searchParams.get('per_page') ?? '9'), 20);

    const apiKey = await getSetting('PIXABAY_API_KEY');
    if (!apiKey) return NextResponse.json({ error: 'Pixabay API 키 없음. 설정 > API 키에서 등록하세요.' }, { status: 400 });

    // 세로(portrait) 이미지 우선 - 숏폼용
    const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&orientation=vertical&per_page=${perPage}&safesearch=true&min_width=720`;
    const res = await fetch(url);
    const data = await res.json() as {
      hits?: { id: number; webformatURL: string; largeImageURL: string; tags: string; user: string }[];
      totalHits?: number;
    };

    if (!res.ok || !data.hits) {
      // 세로 없으면 전체로 재시도
      const url2 = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${perPage}&safesearch=true`;
      const res2 = await fetch(url2);
      const data2 = await res2.json() as typeof data;
      return NextResponse.json({ images: (data2.hits ?? []).map(h => ({ id: h.id, url: h.largeImageURL, thumb: h.webformatURL, tags: h.tags, author: h.user })) });
    }

    return NextResponse.json({
      images: data.hits.map(h => ({
        id: h.id,
        url: h.largeImageURL,
        thumb: h.webformatURL,
        tags: h.tags,
        author: h.user,
      })),
      total: data.totalHits ?? 0,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
