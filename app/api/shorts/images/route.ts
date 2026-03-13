import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

// ── Pixabay ───────────────────────────────────────────────────────────────────
async function searchPixabay(query: string, perPage: number): Promise<{ id: number; url: string; thumb: string; tags: string; author: string }[]> {
  const apiKey = await getSetting('PIXABAY_API_KEY');
  if (!apiKey) throw new Error('Pixabay API 키 없음');

  // 세로형 우선, 없으면 전체
  for (const orientation of ['vertical', '']) {
    const params = new URLSearchParams({
      key: apiKey, q: query, image_type: 'photo',
      per_page: String(perPage), safesearch: 'true', min_width: '720',
      ...(orientation ? { orientation } : {}),
    });
    const res = await fetch(`https://pixabay.com/api/?${params}`);
    const data = await res.json() as { hits?: { id: number; largeImageURL: string; webformatURL: string; tags: string; user: string }[] };
    if (data.hits?.length) {
      return data.hits.map(h => ({ id: h.id, url: h.largeImageURL, thumb: h.webformatURL, tags: h.tags, author: h.user }));
    }
  }
  return [];
}

// ── Pexels ────────────────────────────────────────────────────────────────────
async function searchPexels(query: string, perPage: number): Promise<{ id: number; url: string; thumb: string; tags: string; author: string }[]> {
  const apiKey = await getSetting('PEXELS_API_KEY');
  if (!apiKey) throw new Error('Pexels API 키 없음. 설정 > API 키에서 등록하세요.');

  const params = new URLSearchParams({ query, per_page: String(perPage), orientation: 'portrait' });
  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: apiKey },
  });
  const data = await res.json() as {
    photos?: { id: number; src: { large2x: string; medium: string }; photographer: string; alt: string }[];
  };
  return (data.photos ?? []).map(p => ({
    id: p.id, url: p.src.large2x, thumb: p.src.medium,
    tags: p.alt, author: p.photographer,
  }));
}

// ── DALL-E ────────────────────────────────────────────────────────────────────
async function generateDalle(prompt: string): Promise<{ id: number; url: string; thumb: string; tags: string; author: string }[]> {
  const apiKey = await getSetting('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OpenAI API 키 없음. 설정 > API 키에서 등록하세요.');

  const fullPrompt = `${prompt}. Vertical 9:16 format, cinematic quality, no text, no watermarks, suitable for YouTube Shorts background.`;

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: fullPrompt,
      n: 1,
      size: '1024x1792',   // 포트레이트 (Shorts 최적)
      quality: 'standard',
    }),
  });

  const data = await res.json() as { data?: { url: string }[]; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);

  return (data.data ?? []).map((d, i) => ({
    id: i,
    url: d.url,
    thumb: d.url,
    tags: prompt,
    author: 'DALL-E 3',
  }));
}

// ── Route Handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') ?? '';
    const source = searchParams.get('source') ?? 'pixabay'; // pixabay | pexels | dalle
    const perPage = Math.min(Number(searchParams.get('per_page') ?? '9'), 20);
    const dallePrompt = searchParams.get('dalle_prompt') ?? query;

    let images: { id: number; url: string; thumb: string; tags: string; author: string }[] = [];

    if (source === 'dalle') {
      images = await generateDalle(dallePrompt || query);
    } else if (source === 'pexels') {
      images = await searchPexels(query, perPage);
    } else {
      images = await searchPixabay(query, perPage);
    }

    return NextResponse.json({ images, source });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
