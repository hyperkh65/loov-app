/**
 * WordPress 발행 후 연결된 모든 SNS에 후킹 요약 + 이미지 + 블로그 링크 포스팅
 * POST { content, imageUrl }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia } from '@/lib/sns/platforms-server';
import type { Platform } from '@/lib/sns/platforms';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { content, imageUrl } = await req.json() as { content: string; imageUrl?: string };

  if (!content) return NextResponse.json({ error: 'content 필요' }, { status: 400 });

  const { data: connections } = await supabase
    .from('sns_connections')
    .select('platform, access_token, platform_user_id')
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (!connections?.length) {
    return NextResponse.json({ results: [], message: '연결된 SNS 없음' });
  }

  const results: { platform: string; success: boolean; error?: string }[] = [];
  const mediaUrls = imageUrl ? [imageUrl] : undefined;

  for (const conn of connections) {
    try {
      await postToPlatformWithMedia(
        conn.platform as Platform,
        conn.access_token,
        conn.platform_user_id || '',
        content,
        mediaUrls,
      );
      results.push({ platform: conn.platform, success: true });
    } catch (e) {
      results.push({ platform: conn.platform, success: false, error: String(e) });
    }
  }

  return NextResponse.json({ results });
}
