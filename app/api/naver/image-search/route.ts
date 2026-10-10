import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

async function getPixabayKey(): Promise<string> {
  try {
    const admin = await createAdminClient();
    const { data } = await admin.from('app_settings').select('settings').eq('id', 1).single();
    const settings = (data?.settings as Record<string, string>) || {};
    return settings.PIXABAY_API_KEY || process.env.PIXABAY_API_KEY || '';
  } catch {
    return process.env.PIXABAY_API_KEY || '';
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const page = searchParams.get('page') || '1';
  const perPage = searchParams.get('per_page') || '20';

  if (!q) return NextResponse.json({ error: '검색어가 필요합니다' }, { status: 400 });

  const apiKey = await getPixabayKey();
  if (!apiKey) return NextResponse.json({ error: 'Pixabay API 키가 설정되지 않았습니다. 설정 탭에서 입력해주세요.' }, { status: 400 });

  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', q);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('per_page', perPage);
  url.searchParams.set('page', page);
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('lang', 'ko');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Pixabay 오류: ${text}` }, { status: res.status });
  }

  const data = await res.json() as {
    totalHits: number;
    hits: {
      id: number;
      webformatURL: string;
      largeImageURL: string;
      previewURL: string;
      tags: string;
      user: string;
      pageURL: string;
      imageWidth: number;
      imageHeight: number;
    }[];
  };

  return NextResponse.json({
    total: data.totalHits,
    images: data.hits.map(h => ({
      id: h.id,
      preview: h.previewURL,
      webformat: h.webformatURL,
      large: h.largeImageURL,
      tags: h.tags,
      user: h.user,
      pageURL: h.pageURL,
    })),
  });
}
