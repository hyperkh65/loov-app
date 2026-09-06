/**
 * 리라이팅 완료된 기사를 설정된 WordPress 사이트 + 연결된 모든 SNS 계정에 발행
 */
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { publishToWordPress } from '@/lib/scheduler/blog-runner';
import { postToPlatformWithMedia } from '@/lib/sns/platforms-server';
import { uploadToR2 } from '@/lib/r2-storage';
import type { Platform } from '@/lib/sns/platforms';

const SNS_PLATFORMS: Platform[] = ['twitter', 'threads', 'facebook', 'instagram'];

/** 인스타그램은 종횡비 0.8~1.91 범위를 벗어난 이미지를 거부함 — 1080x1080 센터크롭으로 항상 통과시킴 */
async function toInstagramSafeImage(url: string): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
  const res = await fetch(`${appUrl}/api/rewrite/square-image?src=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`정사각형 변환 실패: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = `rewrite-ig/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
  return uploadToR2(filename, buffer, 'image/png');
}

export interface PublishResult {
  wordpressUrl: string | null;
  sns: Record<string, string>;
}

export async function publishRewrittenArticle(
  article: { title: string; content: string; representative_image_url: string | null },
  userId: string,
): Promise<PublishResult> {
  const admin = createAdminClient();

  let wordpressUrl: string | null = null;
  const wpSiteId = await getSetting('REWRITE_PUBLISH_WP_SITE_ID');
  if (wpSiteId) {
    const { data: site } = await admin
      .from('wordpress_sites')
      .select('site_url, wp_username, app_password')
      .eq('id', wpSiteId)
      .single();
    if (site) {
      wordpressUrl = await publishToWordPress(
        site.site_url, site.wp_username, site.app_password,
        article.title, article.content, article.representative_image_url, 'publish',
      );
    }
  }

  const sns: Record<string, string> = {};
  const { data: conns } = await admin
    .from('sns_connections')
    .select('platform, platform_user_id, access_token, platform_username')
    .eq('user_id', userId)
    .eq('is_active', true);

  const caption = (article.title + (wordpressUrl ? `\n\n${wordpressUrl}` : '')).slice(0, 500);
  const images = article.representative_image_url ? [article.representative_image_url] : [];

  const hasInstagram = (conns || []).some(c => c.platform === 'instagram');
  let instagramImages: string[] = [];
  if (hasInstagram && images.length) {
    try {
      instagramImages = [await toInstagramSafeImage(images[0])];
    } catch {
      instagramImages = images; // 변환 실패하면 원본으로 시도 (기존 동작 유지)
    }
  }

  for (const conn of conns || []) {
    const platform = conn.platform as Platform;
    if (!SNS_PLATFORMS.includes(platform)) continue;
    const label = `${platform}:${conn.platform_username || conn.platform_user_id}`;
    const platformImages = platform === 'instagram' ? instagramImages : images;
    if (platform === 'instagram' && !platformImages.length) {
      sns[label] = 'skip: 이미지 없음';
      continue;
    }
    try {
      await postToPlatformWithMedia(platform, conn.access_token, conn.platform_user_id, caption, platformImages);
      sns[label] = 'ok';
    } catch (e) {
      sns[label] = `error: ${String(e).slice(0, 150)}`;
    }
  }

  return { wordpressUrl, sns };
}
