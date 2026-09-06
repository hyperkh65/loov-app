/**
 * 리라이팅 완료된 기사를 설정된 WordPress 사이트 + 연결된 모든 SNS 계정에 발행
 */
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { generateText } from '@/lib/auto-blog-ai';
import { publishToWordPress } from '@/lib/scheduler/blog-runner';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import { uploadToR2 } from '@/lib/r2-storage';
import type { Platform } from '@/lib/sns/platforms';

const SNS_PLATFORMS: Platform[] = ['twitter', 'threads', 'facebook', 'instagram'];
const CAPTION_TAGS = ['THREADS', 'TWITTER', 'FACEBOOK', 'INSTAGRAM'];

/** 인스타그램은 종횡비 0.8~1.91 범위를 벗어난 이미지를 거부함 — 1080x1080 센터크롭으로 항상 통과시킴 */
async function toInstagramSafeImage(url: string): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
  const res = await fetch(`${appUrl}/api/rewrite/square-image?src=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`정사각형 변환 실패: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = `rewrite-ig/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
  return uploadToR2(filename, buffer, 'image/png');
}

function getSection(text: string, tag: string, allTags: string[]): string {
  const marker = `[[[${tag}]]]`;
  const start = text.indexOf(marker);
  if (start < 0) return '';
  const from = start + marker.length;
  let end = text.length;
  for (const t of allTags) {
    if (t === tag) continue;
    const pos = text.indexOf(`[[[${t}]]]`, from);
    if (pos >= 0 && pos < end) end = pos;
  }
  return text.slice(from, end).trim();
}

/** 플랫폼별 후킹 캡션 생성 — URL은 절대 포함하지 않음(댓글로 따로 붙임) */
async function buildHookCaptions(title: string, summary: string): Promise<Record<string, string>> {
  const prompt = `너는 SNS 마케팅 전문가야. 아래 기사를 각 SNS 플랫폼에 맞는 후킹성 멘트로 작성해줘.
반드시 한국어로만 작성하고, 중국어·일본어 등 외국 문자 절대 사용 금지. 기사 제목을 그대로 베끼지 말고 호기심을 자극하는 문장으로 새로 써.

기사 제목: ${title}
기사 요약: ${summary.slice(0, 300)}

[플랫폼별 작성 규칙]
- THREADS: 줄바꿈으로 리듬감. 2~4줄 짧은 문장. 이모지 1~2개. URL 없이 (댓글로 추가)
- TWITTER: 한 방에 꽂히는 문장 + 해시태그 2~3개. 240자 이내. URL 없이 (댓글로 추가)
- FACEBOOK: 친근하게 250자 내외. 이모지 적당히. URL 없이 (댓글로 추가)
- INSTAGRAM: 감성적, 이모지 풍부, 해시태그 8개. URL 없이 (댓글로 추가)

반드시 아래 구분자 형식으로만 출력 (설명/코드블록 없이):
[[[THREADS]]]
스레드용 텍스트
[[[TWITTER]]]
트위터용 텍스트
[[[FACEBOOK]]]
페이스북용 텍스트
[[[INSTAGRAM]]]
인스타그램용 텍스트`;

  const raw = await generateText(prompt, 'qwen3');
  return {
    threads: getSection(raw, 'THREADS', CAPTION_TAGS),
    twitter: getSection(raw, 'TWITTER', CAPTION_TAGS),
    facebook: getSection(raw, 'FACEBOOK', CAPTION_TAGS),
    instagram: getSection(raw, 'INSTAGRAM', CAPTION_TAGS),
  };
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

  const relevantConns = (conns || []).filter(c => SNS_PLATFORMS.includes(c.platform as Platform));
  if (!relevantConns.length) return { wordpressUrl, sns };

  const plainSummary = article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  let captions: Record<string, string>;
  try {
    captions = await buildHookCaptions(article.title, plainSummary);
  } catch {
    captions = {}; // 실패하면 아래에서 제목으로 폴백
  }

  const images = article.representative_image_url ? [article.representative_image_url] : [];
  const comment = wordpressUrl ? `🔗 전체 기사 보기\n${wordpressUrl}` : '';

  const hasInstagram = relevantConns.some(c => c.platform === 'instagram');
  let instagramImages: string[] = [];
  if (hasInstagram && images.length) {
    try {
      instagramImages = [await toInstagramSafeImage(images[0])];
    } catch {
      instagramImages = images; // 변환 실패하면 원본으로 시도 (기존 동작 유지)
    }
  }

  for (const conn of relevantConns) {
    const platform = conn.platform as Platform;
    const label = `${platform}:${conn.platform_username || conn.platform_user_id}`;
    const platformImages = platform === 'instagram' ? instagramImages : images;
    if (platform === 'instagram' && !platformImages.length) {
      sns[label] = 'skip: 이미지 없음';
      continue;
    }
    const caption = (captions[platform] || article.title).slice(0, 500);
    try {
      const posted = await postToPlatformWithMedia(platform, conn.access_token, conn.platform_user_id, caption, platformImages);
      if (comment) {
        try { await postCommentOnOwnPost(platform, conn.access_token, conn.platform_user_id, posted.id, comment); }
        catch { /* 댓글 실패는 무시 — 본문 발행은 이미 성공 */ }
      }
      sns[label] = 'ok';
    } catch (e) {
      sns[label] = `error: ${String(e).slice(0, 150)}`;
    }
  }

  return { wordpressUrl, sns };
}
