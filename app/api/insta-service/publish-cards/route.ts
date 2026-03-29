import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia } from '@/lib/sns/platforms-server';
import { uploadToR2, deleteFromR2 } from '@/lib/r2-storage';

export const maxDuration = 120;

interface CardSlide {
  type: string;
  title: string;
  body: string;
  points: string[];
}

async function generateAndStoreCardImage(
  baseUrl: string,
  slide: CardSlide,
  theme: string,
  num: number,
  total: number,
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
  if (!res.ok) throw new Error(`카드 이미지 생성 실패 (${num}/${total}): HTTP ${res.status}`);

  const buffer = await res.arrayBuffer();
  const key = `sns-media/card-news/${Date.now()}-${num}-${Math.random().toString(36).slice(2)}.png`;

  return uploadToR2(key, buffer, 'image/png');
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

  const { data: conn } = await supabase
    .from('sns_connections')
    .select('access_token, platform_user_id')
    .eq('user_id', user.id)
    .eq('platform', 'instagram')
    .eq('is_active', true)
    .single();

  if (!conn) return NextResponse.json({ error: 'Instagram 미연결' }, { status: 400 });

  // ── Instagram 토큰 자동 갱신 (60일 만료 대비) ──────────────────────
  let accessToken = conn.access_token;
  try {
    const refreshRes = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${accessToken}`
    );
    if (refreshRes.ok) {
      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        accessToken = refreshData.access_token;
        // 갱신된 토큰 DB 저장
        await supabase
          .from('sns_connections')
          .update({ access_token: accessToken, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('platform', 'instagram');
      }
    }
  } catch {
    // 갱신 실패해도 기존 토큰으로 시도
  }

  // Generate all card images and upload to R2
  const imageUrls: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const url = await generateAndStoreCardImage(
      baseUrl, slides[i], theme, i + 1, slides.length
    );
    imageUrls.push(url);
  }

  // Directly call Instagram API (no internal HTTP fetch)
  try {
    const { id: postId } = await postToPlatformWithMedia(
      'instagram',
      accessToken,
      conn.platform_user_id || '',
      caption,
      imageUrls,
    );

    // Log success
    await supabase.from('sns_post_logs').insert({
      user_id: user.id,
      platform: 'instagram',
      status: 'success',
      platform_post_id: postId,
    }).then(() => {/* ignore error */});

    // Cleanup temporary card images from R2
    const r2Keys = imageUrls.map(url => {
      const publicBase = process.env.R2_PUBLIC_URL || '';
      return publicBase ? url.replace(publicBase + '/', '') : null;
    }).filter(Boolean) as string[];
    if (r2Keys.length > 0) {
      await deleteFromR2(r2Keys).catch(() => {/* ignore */});
    }

    return NextResponse.json({ success: true, postId, imageUrls });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
