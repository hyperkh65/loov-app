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
import { publishToLinkedIn } from '@/lib/linkedin-publish';
import { findCrossSiteLink, appendCrossLink } from '@/lib/internal-crosslink';

const SNS_PLATFORMS: Platform[] = ['twitter', 'threads', 'facebook', 'instagram', 'linkedin'];
const CAPTION_TAGS = ['THREADS', 'TWITTER', 'FACEBOOK', 'INSTAGRAM'];

// 스레드/인스타는 계정이 여러 개 연결돼 있어 "전부 발행" 하면 여행 전문
// 계정(@armchair_travel_today)에 쿠팡 상품 광고가 섞이는 식으로 니치가 안 맞는
// 계정까지 도배돼 계정 전체 도달률이 깎이는 문제가 있었음 — 소스별로 계정을
// 고정 배정. 페이스북/트위터는 계정이 하나뿐이라 그대로 둠(필터 안 함).
// ponytail: 소스 3~4개뿐이라 source_id 하드코딩, 소스가 늘어나면 DB 컬럼으로 옮길 것
const SNS_ACCOUNT_ROUTING: Record<string, string[]> = {
  'dadaf1c1-cdef-418f-bd6a-66432504bb26': ['@2dayskr'], // 행정안전부 — 정부지원책/정보성 글 전용
  '6eeebbb5-f9bd-441a-966c-3a85c24ee63d': ['@2dayskr'], // 보건복지부 보도자료
  '1977545d-a790-4db3-b452-f4cc03c343f6': ['@2dayskr'], // 고용노동부 정책자료
  '55e472de-948a-45f5-8350-02c82cce4e9f': ['@2dayskr'], // 서울시 정책뉴스
  'e8c07b52-ae40-4bca-a553-e874821fddf2': ['@2dayskr'], // 행정안전부 알립니다
  '526fc596-e56d-4614-b3d8-0d611ee06714': ['@2dayskr'], // 고용노동부 공지사항
  '48501db6-dc65-4d73-b341-6c6e5066a75d': ['@2dayskr'], // 문화체육관광부 보도자료
  'fbb25bb6-10d2-4575-b66d-dc53e9170909': ['@2dayskr'], // 환경부 보도자료
};
const DEFAULT_SNS_ACCOUNTS = ['@aboda_miracool', '@2dayskr_korea']; // 그 외 일반 리라이트글
const ACCOUNT_ROUTED_PLATFORMS: Platform[] = ['threads', 'instagram'];

interface WpCreds { url: string; username: string; appPassword: string }

/** 인스타그램은 종횡비 0.8~1.91 범위를 벗어난 이미지를 거부함 — 1080x1080 센터크롭으로 항상 통과시킴 */
async function toInstagramSafeImage(url: string, wpCreds?: WpCreds | null): Promise<string> {
  // 공개 도메인으로 자기 자신을 호출하면 hairpin NAT로 간헐적으로 실패함.
  // localhost는 컨테이너 바인딩 이슈로 연결 거부되어 도커 브리지
  // 게이트웨이+게시된 포트로 우회(app/api/rewrite/auto-run/route.ts 참고).
  const res = await fetch(`http://172.17.0.1:3100/api/rewrite/square-image?src=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`정사각형 변환 실패: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 워드프레스 자체 도메인에 올리면 메타 크롤러가 R2 dev URL을 못 가져가서
  // catbox.moe로 중계하던 문제를 아예 피할 수 있음 — 크리덴셜 있으면 우선
  // 시도하고, 실패하면 기존 R2 업로드로 폴백
  if (wpCreds) {
    try {
      const creds = Buffer.from(`${wpCreds.username}:${wpCreds.appPassword}`).toString('base64');
      const uploadRes = await fetch(`${wpCreds.url.replace(/\/$/, '')}/wp-json/wp/v2/media`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${creds}`,
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename="ig-${filename}.png"`,
        },
        body: buffer,
        signal: AbortSignal.timeout(20_000),
      });
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        if (data.source_url) return data.source_url;
      }
    } catch { /* WP 업로드 실패하면 R2로 폴백 */ }
  }
  return uploadToR2(`rewrite-ig/${filename}.png`, buffer, 'image/png');
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
  linkedin: string; // 'ok: ...' | 'skip: ...' | 'error: ...'
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
  // 워드프레스에 올린 이미지 URL — 메타(스레드/인스타) 크롤러가 R2 dev URL을
  // 잘 못 가져가서(원인 불명, catbox.moe 중계로 우회하던 문제) 실사용 중 확인됨.
  // 이미 워드프레스 자체 도메인에 업로드된 이미지가 있으면 그걸 그대로 SNS에도
  // 재사용 — 실제 서비스 도메인이라 크롤러가 못 가져갈 이유가 없고 중계도 불필요.
  let snsImageUrl = article.representative_image_url;
  let wpCreds: WpCreds | null = null;
  const wpSiteId = sourcePublishWpSiteId || await getSetting('REWRITE_PUBLISH_WP_SITE_ID');
  if (wpSiteId) {
    const { data: site } = await admin
      .from('wordpress_sites')
      .select('site_url, wp_username, app_password')
      .eq('id', wpSiteId)
      .single();
    if (site) {
      wpCreds = { url: site.site_url, username: site.wp_username, appPassword: site.app_password };
      // 외부 백링크(핀터레스트/미디엄)가 정책상 막혀서, LOOV 소유 사이트끼리라도
      // 상호링크를 걸어 체류시간/내부 SEO 신호를 확보 — 실패해도 발행 자체는 진행
      const crossLink = await findCrossSiteLink(site.site_url, article.title).catch(() => null);
      const contentWithLink = appendCrossLink(article.content, crossLink);
      const wpResult = await publishToWordPress(
        site.site_url, site.wp_username, site.app_password,
        article.title, contentWithLink, article.representative_image_url, 'publish',
      );
      wordpressUrl = wpResult.link;
      if (wpResult.featuredImageUrl) snsImageUrl = wpResult.featuredImageUrl;
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

  // 링크드인은 LINKEDIN_ACCESS_TOKEN이 이미 설정돼 있었는데 자동화 어디서도
  // 호출하지 않아 그동안 완전히 놀고 있었음 — 백링크/추가 유입 경로 확보를
  // 위해 텀블러처럼 워드프레스 발행 URL이 있으면 소스 설정과 무관하게 시도
  let linkedin = 'skip: 워드프레스 발행 URL 없음';
  if (wordpressUrl) {
    try {
      const { url } = await publishToLinkedIn({
        title: article.title,
        meta_description: article.meta || undefined,
        canonical_url: wordpressUrl,
      });
      linkedin = url ? `ok: ${url}` : 'ok';
    } catch (e) {
      linkedin = `error: ${(e as Error).message?.slice(0, 150)}`;
    }
  }

  const sns: Record<string, string> = {};
  if (!publishSns) return { wordpressUrl, sns, naverCafe, tumblr, linkedin };

  const { data: conns } = await admin
    .from('sns_connections')
    .select('platform, platform_user_id, access_token, platform_username')
    .eq('user_id', userId)
    .eq('is_active', true);

  const allowedAccounts = (sourceId && SNS_ACCOUNT_ROUTING[sourceId]) || DEFAULT_SNS_ACCOUNTS;
  const relevantConns = (conns || []).filter(c => {
    if (!SNS_PLATFORMS.includes(c.platform as Platform)) return false;
    if (!ACCOUNT_ROUTED_PLATFORMS.includes(c.platform as Platform)) return true;
    return allowedAccounts.includes(c.platform_username || '');
  });
  if (!relevantConns.length) return { wordpressUrl, sns, naverCafe, tumblr, linkedin };

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

  const images = snsImageUrl ? [snsImageUrl] : [];
  // 캡션에 링크를 텍스트로 넣으면 하이퍼링크가 안 걸려서 클릭이 안 되는 문제가
  // 있어서(실사용 중 확인) 댓글로 되돌림 — 대표이미지가 링크 미리보기로 한 번
  // 더 보이는 건 감수하고, 실제로 클릭 가능한 링크를 우선함(사용자 선택)
  const comment = wordpressUrl ? `🔗 전체 기사 보기\n${wordpressUrl}` : '';

  const hasInstagram = relevantConns.some(c => c.platform === 'instagram');
  let instagramImages: string[] = [];
  if (hasInstagram && images.length) {
    try {
      instagramImages = [await toInstagramSafeImage(images[0], wpCreds)];
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

  return { wordpressUrl, sns, naverCafe, tumblr, linkedin };
}
