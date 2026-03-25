import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 120;

interface CardSlide {
  type: string;
  title: string;
  body: string;
  points: string[];
}

// Generate a card image PNG via internal API and return the URL stored in Supabase
async function generateAndStoreCardImage(
  baseUrl: string,
  slide: CardSlide,
  theme: string,
  num: number,
  total: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
): Promise<string> {
  const params = new URLSearchParams({
    type: slide.type,
    title: slide.title,
    body: slide.body || '',
    num: String(num),
    total: String(total),
    theme,
    points: JSON.stringify(slide.points || []),
  });

  const res = await fetch(`${baseUrl}/api/insta-service/card-image?${params}`);
  if (!res.ok) throw new Error(`카드 이미지 생성 실패 (${num}/${total})`);

  const buffer = await res.arrayBuffer();
  const fileName = `card-news/${Date.now()}-${num}.png`;

  const { error: uploadError } = await supabase.storage
    .from('sns-media')
    .upload(fileName, buffer, { contentType: 'image/png', upsert: false });

  if (uploadError) throw new Error('Storage 업로드 실패: ' + uploadError.message);

  const { data: urlData } = supabase.storage.from('sns-media').getPublicUrl(fileName);
  return urlData.publicUrl;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { slides, theme, caption } = await req.json() as {
    slides: CardSlide[];
    theme: string;
    caption: string;
  };

  if (!slides?.length) return NextResponse.json({ error: '슬라이드 없음' }, { status: 400 });
  if (!caption?.trim()) return NextResponse.json({ error: '캡션 필요' }, { status: 400 });

  const baseUrl = req.nextUrl.origin;

  // Get Instagram connection
  const { data: conn } = await supabase
    .from('sns_connections')
    .select('access_token, platform_user_id')
    .eq('user_id', user.id)
    .eq('platform', 'instagram')
    .eq('is_active', true)
    .single();

  if (!conn) return NextResponse.json({ error: 'Instagram 미연결' }, { status: 400 });

  // Generate all card images and upload to storage
  const imageUrls: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const url = await generateAndStoreCardImage(
      baseUrl, slides[i], theme, i + 1, slides.length, supabase
    );
    imageUrls.push(url);
  }

  // Post to Instagram via existing post-now API
  const postRes = await fetch(`${baseUrl}/api/sns/post-now`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('Cookie') || '' },
    body: JSON.stringify({
      content: caption,
      platforms: ['instagram'],
      media_urls: imageUrls,
    }),
  });

  const postData = await postRes.json();
  const result = postData.results?.find((r: { platform: string }) => r.platform === 'instagram');

  if (result?.success) {
    return NextResponse.json({ success: true, url: result.url, imageUrls });
  } else {
    return NextResponse.json({ error: result?.error || '발행 실패' }, { status: 500 });
  }
}
