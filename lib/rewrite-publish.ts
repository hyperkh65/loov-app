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
import { publishToNaverCafe } from '@/lib/naver-cafe';
import { publishToTumblr } from '@/lib/tumblr-publish';

const SNS_PLATFORMS: Platform[] = ['twitter', 'threads', 'facebook', 'instagram', 'linkedin'];
const CAPTION_TAGS = ['THREADS', 'TWITTER', 'FACEBOOK', 'INSTAGRAM'];

/** 인스타그램은 종횡비 0.8~1.91 범위를 벗어난 이미지를 거부함 — 1080x1080 센터크롭으로 항상 통과시킴 */
async function toInstagramSafeImage(url: string): Promise<string> {
  // 공개 도메인으로 자기 자신을 호출하면 hairpin NAT로 간헐적으로 실패함.
  // localhost는 컨테이너 바인딩 이슈로 연결 거부되어 도커 브리지
  // 게이트웨이+게시된 포트로 우회(app/api/rewrite/auto-run/route.ts 참고).
  const res = await fetch(`http://172.17.0.1:3100/api/rewrite/square-image?src=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(20_000) });
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
  naverCafe: string; // 'ok' | 'skip: ...' | 'error: ...'
  tumblr: string; // 'ok: ...' | 'skip: ...' | 'error: ...'
}

export async function publishRewrittenArticle(
  article: { title: string; content: string; representative_image_url: string | null; meta?: string | null },
  userId: string,
  sourceId?: string | null,
): Promise<PublishResult> {
  const admin = createAdminClient();

  // 소스 사이트별 발행 설정 (없으면 전역 기본값 사용 — 기존 동작 그대로 유지)
  let sourcePublishWpSiteId: string | null = null;
  let publishSns = true;
  let publishTumblr = false;
  if (sourceId) {
    const { data: source } = await admin
      .from('bossai_rewrite_sources')
      .select('publish_wp_site_id, publish_sns, publish_tumblr')
      .eq('id', sourceId)
      .single();
    if (source) {
      sourcePublishWpSiteId = source.publish_wp_site_id;
      publishSns = source.publish_sns;
      publishTumblr = source.publish_tumblr;
    }
  }

  let wordpressUrl: string | null = null;
  const wpSiteId = sourcePublishWpSiteId || await getSetting('REWRITE_PUBLISH_WP_SITE_ID');
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

  // 카페 발행은 SNS 연결 여부와 무관하게 시도 — 부분 실패 허용(다른 채널 발행에 영향 없음)
  let naverCafe = 'skip: 연결 없음';
  try {
    const { articleUrl } = await publishToNaverCafe(admin, {
      userId, title: article.title, content: article.content, blogUrl: wordpressUrl || undefined,
    });
    naverCafe = articleUrl ? `ok: ${articleUrl}` : 'ok';
  } catch (e) {
    naverCafe = `error: ${(e as Error).message?.slice(0, 150)}`;
  }

  // 텀블러는 워드프레스 발행 URL을 링크 포스트로 거는 방식이라 워드프레스가
  // 발행돼야만 의미가 있음
  let tumblr = 'skip: 소스 설정에서 꺼짐';
  if (publishTumblr) {
    if (!wordpressUrl) {
      tumblr = 'skip: 워드프레스 발행 URL 없음';
    } else {
      try {
        const { url } = await publishToTumblr({
          title: article.title,
          canonical_url: wordpressUrl,
        });
        tumblr = url ? `ok: ${url}` : 'ok';
      } catch (e) {
        tumblr = `error: ${(e as Error).message?.slice(0, 150)}`;
      }
    }
  }

  const sns: Record<string, string> = {};
  if (!publishSns) return { wordpressUrl, sns, naverCafe, tumblr };

  const { data: conns } = await admin
    .from('sns_connections')
    .select('platform, platform_user_id, access_token, platform_username')
    .eq('user_id', userId)
    .eq('is_active', true);

  const relevantConns = (conns || []).filter(c => SNS_PLATFORMS.includes(c.platform as Platform));
  if (!relevantConns.length) return { wordpressUrl, sns, naverCafe, tumblr };

  const plainSummary = article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // AI 캡션 생성이 실패/타임아웃하면 제목 한 줄로만 폴백하던 것 — "블로그 자동화"처럼
  // 글 요약(메타디스크립션, 없으면 본문 앞부분)으로 폴백해서 캡션이 너무 짧아지는
  // 문제 방지
  const fallbackCaption = (article.meta || plainSummary || article.title).slice(0, 150);
  let captions: Record<string, string>;
  try {
    // generateText는 provider 폴백 체인이 길어 최악의 경우 수 분 걸릴 수 있음 —
    // 캡션은 없어도 요약으로 폴백 가능하니 60초 넘으면 바로 포기하고 진행
    captions = await Promise.race([
      buildHookCaptions(article.title, plainSummary),
      new Promise<Record<string, string>>((_, reject) => setTimeout(() => reject(new Error('caption timeout')), 60_000)),
    ]);
  } catch {
    captions = {}; // 실패/타임아웃하면 아래에서 요약으로 폴백
  }

  const images = article.representative_image_url ? [article.representative_image_url] : [];
  // 캡션에 링크를 텍스트로 넣으면 하이퍼링크가 안 걸려서 클릭이 안 되는 문제가
  // 있어서(실사용 중 확인) 댓글로 되돌림 — 대표이미지가 링크 미리보기로 한 번
  // 더 보이는 건 감수하고, 실제로 클릭 가능한 링크를 우선함(사용자 선택)
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
    const caption = (captions[platform] || fallbackCaption).slice(0, 500);
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

  return { wordpressUrl, sns, naverCafe, tumblr };
}
