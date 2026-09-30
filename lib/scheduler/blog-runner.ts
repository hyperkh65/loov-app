import { createAdminClient } from '@/lib/supabase-server';
import { refreshBloggerToken } from '@/lib/blogger-token';
import { pickKeywordForUser, pickFromKeywordList, pickDynamicKeywordByCategory } from './keyword-picker';
import { generateBlogContent } from '@/lib/blog-content-generator';
import { submitToIndexNow } from '@/lib/indexnow';
import { findCrossSiteLink, appendCrossLink } from '@/lib/internal-crosslink';
import { publishToWordpressCom } from '@/lib/wordpress-com';
import { publishToGithubPages } from '@/lib/github-pages-blog';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import { publishToNaverCafe } from '@/lib/naver-cafe';
import { publishToTumblr } from '@/lib/tumblr-publish';
import { snsGroupFor, pickRotatedAccount, logSnsPost } from '@/lib/sns/account-rotation';
import type { Platform } from '@/lib/sns/platforms';
import type { Schedule, BlogAutoConfig } from './index';

async function crossPostBlogToSns(userId: string, siteUrl: string, title: string, articleUrl: string): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('sns_connections')
    .select('platform, platform_user_id, platform_username, access_token')
    .eq('user_id', userId)
    .eq('is_active', true);
  const connections = data || [];

  // 예전엔 Threads만 사이트별 전용 계정으로 라우팅하고 Instagram/Facebook/
  // Twitter는 필터 없이 연결된 계정 전부에 뿌렸음 — 그 결과 미라클/아보다처럼
  // 무관한 사이트 글이 쿠팡/무신사 전용 인스타그램 계정에도 섞여 올라가고
  // 있었음(사용자 확인, 실사용 중 확인). Instagram도 Threads와 동일하게
  // 사이트별 계정 로테이션 적용 — 같은 "2dayskr 계열" 안에서도 여러 자매
  // 계정에 분산시켜 계정당 최소 간격을 확보(lib/sns/account-rotation.ts).
  const group = snsGroupFor(siteUrl);
  const [threadsTarget, instagramTarget] = await Promise.all([
    pickRotatedAccount(supabase, group, 'threads', connections),
    pickRotatedAccount(supabase, group, 'instagram', connections),
  ]);
  // 본문에 링크를 넣으면 SNS 알고리즘이 외부링크 게시물로 판단해 노출을 줄이는
  // 페널티가 있음(사용자 확정) — rewrite-publish.ts와 동일하게 링크는 댓글로 분리.
  const rotatedTargets = [threadsTarget, instagramTarget]
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map(c => ({ ...c, platform: c.platform as 'threads' | 'instagram' }));
  const otherTargets = connections.filter(c => ['twitter', 'facebook'].includes(c.platform)); // 현행 유지 — 전부 발행
  const targets = [...rotatedTargets, ...otherTargets];

  await Promise.all(targets.map(async (conn) => {
    try {
      const posted = await postToPlatformWithMedia(conn.platform as Platform, conn.access_token, conn.platform_user_id, title);
      if (conn.platform === 'threads' || conn.platform === 'instagram') {
        logSnsPost(supabase, conn.platform, conn.platform_user_id).catch(() => {});
      }
      // 게시물 생성 직후 바로 댓글을 달면 플랫폼(특히 Threads)이 아직 게시물을
      // 조회 가능 상태로 반영하기 전이라 실패하는 경우가 실사용 중 확인됨
      // (rewrite-publish.ts와 동일하게 짧은 대기 + 1회 재시도로 보강)
      try {
        await new Promise(r => setTimeout(r, 4000));
        await postCommentOnOwnPost(conn.platform as Platform, conn.access_token, conn.platform_user_id, posted.id, articleUrl);
      } catch {
        try {
          await new Promise(r => setTimeout(r, 5000));
          await postCommentOnOwnPost(conn.platform as Platform, conn.access_token, conn.platform_user_id, posted.id, articleUrl);
        } catch { /* 재시도까지 실패 — 본문 발행은 이미 성공이라 전체는 실패 처리 안 함 */ }
      }
    } catch { /* 개별 계정 실패해도 나머지/본 발행에는 영향 없음 */ }
  }));

  // 네이버 카페 + 텀블러도 공통으로(부분 실패 허용 — rewrite-publish.ts와 동일 패턴)
  publishToNaverCafe(supabase, { userId, title, content: `<p>${title}</p>`, blogUrl: articleUrl }).catch(() => {});
  publishToTumblr({ title, canonical_url: articleUrl }).catch(() => {});
}

async function getBloggerTokenAdmin(userId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: tokenRow } = await supabase
    .from('bossai_blogger_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!tokenRow) return null;

  const expiresAt = new Date(tokenRow.expires_at).getTime();
  if (expiresAt > Date.now() + 5 * 60 * 1000) return tokenRow.access_token;

  if (!tokenRow.refresh_token) return null;
  const refreshed = await refreshBloggerToken(tokenRow.refresh_token);
  if (!refreshed) return null;

  await supabase
    .from('bossai_blogger_tokens')
    .update({ access_token: refreshed.access_token, expires_at: refreshed.expires_at, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return refreshed.access_token;
}

async function publishToBlogger(accessToken: string, blogId: string, title: string, content: string, labels: string[]): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, labels, kind: 'blogger#post' }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `Blogger API 오류 ${res.status}`);
  }
  const data = await res.json();
  return data.url || data.id || '';
}

export interface WordPressPublishResult {
  link: string;
  /** 워드프레스 미디어 라이브러리에 실제 업로드된 대표이미지 URL — R2/원본 URL이
   * 메타(스레드/인스타) 크롤러에 막혀도 이건 실제 서비스 도메인이라 SNS 발행에
   * 재사용 가능(lib/rewrite-publish.ts 참고). 업로드 실패/이미지 없으면 null. */
  featuredImageUrl: string | null;
}

// 2days.kr(투데이즈 메인 사이트)는 홈페이지엔 애드센스가 있는데 실제 글
// 페이지에는 광고 삽입 메커니즘이 전혀 없어서(테마/플러그인 확인 불가 —
// 관리자 로그인 정보 없음) 방문자가 실제로 읽는 글에 광고가 안 나가고
// 있었음(실사용 중 확인) — 기존 계정으로 워드프레스 관리자 설정은 못
// 건드리니, 발행하는 본문 자체에 광고 코드를 직접 삽입. 같은 애드센스
// 계정(ca-pub-8940400388075870)을 이미 다른 사이트에서 쓰고 있어 그대로
// 재사용, 슬롯 ID도 기존에 검증된 것 재사용.
// 2026-09-30: 2days.kr 하나에만 하드코딩돼 있던 걸 자동발행되는 나머지
// 2026-09-30 전체 원복: 이 함수를 추가할 때 "이 사이트들에 광고가 아예 안
// 붙고 있다"고 판단했는데 잘못된 전제였음 — app/api/wp-auto/setup/route.ts가
// wp-auto로 만든 사이트 전부에 mu-plugins/aboda-adsense.php(슬롯 4~5개,
// data-ad-slot="4238744126" 포함)를 이미 자동 설치해두고 있어서, 이 함수가
// 사실상 "이미 있던 광고 위에 같은 슬롯을 또 하나 중복 삽입"하는 역할만
// 했음(실사용 확인: 2days.kr/finance/aboda/miracool 전부 4238744126이 한
// 페이지에 2번씩 렌더링됨, 총 슬롯 8개). 광고 밀도 과다로 구글이 미충전
// 처리하는 게 "매출이 거의 안 느는" 증상의 유력한 원인이라 판단해 전체 원복.
function injectAdSenseForSite(_wpUrl: string, content: string): string {
  return content;
}

// 2days.kr는 카테고리를 안 정해주면 기본값인 "미분류"(id 1)로 들어가는데,
// 이 사이트에 "/category/미분류/ → /category/aboda/" 301 리다이렉트 규칙이
// 있고 그게 글 개별 URL(퍼머링크에 카테고리 슬러그가 들어가는 구조)에도
// 걸려서 글 URL이 "미분류"↔"aboda" 사이를 무한 리다이렉트하는 버그를
// 실사용 중 발견함(방문자가 글을 아예 못 봄). 미분류 카테고리를 아예 안
// 쓰도록 발행 시 명시적으로 다른 카테고리를 지정해서 회피.
function getSafeCategoryFor(wpUrl: string): number[] | undefined {
  let host: string;
  try { host = new URL(wpUrl).host; } catch { return undefined; }
  return host === '2days.kr' ? [968] : undefined; // 968 = economic
}

export async function publishToWordPress(wpUrl: string, username: string, appPassword: string, title: string, content: string, featuredImageUrl: string | null, status: 'publish' | 'draft' = 'publish'): Promise<WordPressPublishResult> {
  content = injectAdSenseForSite(wpUrl, content);
  const creds = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const apiUrl = `${wpUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;

  // 대표 이미지를 Featured Image로 등록
  let featuredMediaId: number | undefined;
  let uploadedImageUrl: string | null = null;
  if (featuredImageUrl) {
    try {
      const imgRes = await fetch(featuredImageUrl, { signal: AbortSignal.timeout(15000) });
      if (imgRes.ok) {
        const imgBuffer = await imgRes.arrayBuffer();
        const ext = featuredImageUrl.split('.').pop()?.split('?')[0] || 'png';
        const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
        const mime = mimeMap[ext] || 'image/png';
        const uploadRes = await fetch(`${wpUrl.replace(/\/$/, '')}/wp-json/wp/v2/media`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${creds}`,
            'Content-Type': mime,
            'Content-Disposition': `attachment; filename="thumbnail.${ext}"`,
          },
          body: imgBuffer,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          featuredMediaId = uploadData.id;
          uploadedImageUrl = uploadData.source_url || null;
        }
      }
    } catch { /* featured image optional */ }
  }

  const body: Record<string, unknown> = { title, content, status };
  if (featuredMediaId) body.featured_media = featuredMediaId;
  const safeCategories = getSafeCategoryFor(wpUrl);
  if (safeCategories) body.categories = safeCategories;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WordPress API 오류 ${res.status}: ${err.slice(0, 100)}`);
  }
  const data = await res.json();
  const link = data.link || '';
  // 발행 직후 검색엔진(네이버/빙 등 IndexNow 참여 엔진)에 새 글을 바로 알려서
  // 크롤링/노출을 앞당김 — 실패해도 발행 자체에는 영향 없음(fire-and-forget)
  if (link) submitToIndexNow(link).catch(() => {});
  return { link, featuredImageUrl: uploadedImageUrl };
}

export async function getWpCredentials(siteId: string): Promise<{ url: string; username: string; appPassword: string }> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('wordpress_sites')
    .select('site_url, wp_username, app_password')
    .eq('id', siteId)
    .single();
  if (!data) throw new Error('등록된 WordPress 사이트를 찾을 수 없습니다');
  return { url: data.site_url, username: data.wp_username, appPassword: data.app_password };
}

export async function runBlogAuto(schedule: Schedule): Promise<{ keyword: string; url: string; title: string }> {
  const config = schedule.config as BlogAutoConfig;

  // 키워드 자동 발굴 — config.keywords가 있으면(고CPC 카테고리 시범 등 특정
  // 주제로 고정하고 싶은 스케줄) 그 목록에서 순환/랜덤 선택하되, dynamic_category가
  // 같이 설정돼 있으면 그 카테고리의 실시간 발굴 후보를 먼저 시도하고 없을 때만
  // 정적 목록으로 폴백 — 정적 목록만 쓸 때보다 소재가 더 다양해짐.
  // config.keywords가 아예 없으면 기존대로 범용 캐시/트렌드 기반 자동 발굴.
  let keyword: string;
  try {
    if (config.keywords?.length) {
      const dynamic = config.dynamic_category
        ? await pickDynamicKeywordByCategory(schedule, config.dynamic_category)
        : null;
      keyword = dynamic || await pickFromKeywordList(schedule, config.keywords, config.keyword_mode || 'rotate');
    } else {
      keyword = await pickKeywordForUser(schedule.user_id);
    }
  } catch (e) {
    throw new Error(`[키워드 발굴 실패] ${(e as Error).message}`);
  }

  // 콘텐츠 생성
  let title: string, content: string, keywords: string[], imageUrl: string | null;
  try {
    const result = await generateBlogContent(keyword, config.ai_model);
    title = result.title; content = result.content; keywords = result.keywords; imageUrl = result.imageUrl;
    if (!title || !content) throw new Error('AI 출력 파싱 오류 (title/content 없음)');
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('[키워드')) throw e;
    throw new Error(`[AI 생성 실패] ${msg}`);
  }

  // 발행
  let publishedUrl = '';
  let publishedSiteUrl = ''; // SNS 계정 매칭용(사이트별 전용 스레드/인스타 계정 라우팅)
  try {
    if (config.blog_platform === 'blogger') {
      const accessToken = await getBloggerTokenAdmin(schedule.user_id);
      if (!accessToken) throw new Error('Blogger 계정이 연결되지 않았습니다');
      const blogId = config.blogger_blog_id || '7951763866955162015';
      publishedUrl = await publishToBlogger(accessToken, blogId, title, content, keywords);
    } else if (config.blog_platform === 'wordpress') {
      let wpUrl: string, wpUser: string, wpPass: string;
      if (config.wp_site_id) {
        const creds = await getWpCredentials(config.wp_site_id);
        wpUrl = creds.url; wpUser = creds.username; wpPass = creds.appPassword;
      } else if (config.wp_url && config.wp_username && config.wp_app_password) {
        wpUrl = config.wp_url; wpUser = config.wp_username; wpPass = config.wp_app_password;
      } else {
        throw new Error('WordPress 사이트를 선택하거나 직접 입력해주세요');
      }
      publishedSiteUrl = wpUrl;
      // 외부 백링크(핀터레스트/미디엄)가 정책상 막혀서, LOOV 소유 사이트끼리라도
      // 상호링크를 걸어 체류시간/내부 SEO 신호를 확보 — 실패해도 발행은 진행
      const crossLink = await findCrossSiteLink(wpUrl, keyword).catch(() => null);
      const contentWithLink = appendCrossLink(content, crossLink);
      publishedUrl = (await publishToWordPress(wpUrl, wpUser, wpPass, title, contentWithLink, imageUrl)).link;
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('[')) throw e;
    throw new Error(`[발행 실패] ${msg}`);
  }

  // 블로거/워드프레스 어느 쪽으로 발행했든 워드프레스닷컴 위성 블로그에도
  // 요약+링크를 올려 백링크/유입 경로 확보 — 실패해도 본 발행에는 영향 없음
  if (publishedUrl) {
    publishToWordpressCom({ title, content, articleUrl: publishedUrl }).catch(() => {});
    publishToGithubPages({ title, content, articleUrl: publishedUrl }).catch(() => {});
    // engmag/japmag 자동 번역 크로스발행은 토큰 소모가 커서 중단(2026-09-29) —
    // 블로그자동화(수동)에서 engmag.2days.kr/japmag.2days.kr을 직접 선택했을 때만 발행됨.
    // 사이트 전용 스레드/인스타 계정에 링크 포스팅(미라클/아보다 → @aboda_miracool, 2days.kr → @2dayskr)
    // 블로거는 publishedSiteUrl이 비어있는데, threadsAccountFor('')가 @2dayskr로
    // 떨어져서 자동으로 처리됨(어떤 계정이든 상관없다고 확인됨)
    crossPostBlogToSns(schedule.user_id, publishedSiteUrl, title, publishedUrl).catch(() => {});
  }

  return { keyword, url: publishedUrl, title };
}
