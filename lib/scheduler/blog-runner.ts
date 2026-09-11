import { createAdminClient } from '@/lib/supabase-server';
import { refreshBloggerToken } from '@/lib/blogger-token';
import { pickKeywordForUser, pickFromKeywordList } from './keyword-picker';
import { generateBlogContent } from '@/lib/blog-content-generator';
import { submitToIndexNow } from '@/lib/indexnow';
import type { Schedule, BlogAutoConfig } from './index';

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
function injectAdSenseForSite(wpUrl: string, content: string): string {
  let host: string;
  try { host = new URL(wpUrl).host; } catch { return content; }
  if (host !== '2days.kr') return content;
  const ad = `<div class="loov-ad" style="margin:20px auto;text-align:center;clear:both;">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8940400388075870" crossorigin="anonymous"></script>
<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-8940400388075870" data-ad-slot="4238744126" data-ad-format="auto" data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
  const firstParaEnd = content.indexOf('</p>');
  if (firstParaEnd === -1) return ad + content;
  const idx = firstParaEnd + 4;
  return content.slice(0, idx) + ad + content.slice(idx);
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
  // 주제로 고정하고 싶은 스케줄) 그 목록에서만 순환/랜덤 선택, 없으면 기존대로
  // 캐시/트렌드 기반 자동 발굴
  let keyword: string;
  try {
    keyword = config.keywords?.length
      ? await pickFromKeywordList(schedule.user_id, config.keywords, config.keyword_mode || 'rotate')
      : await pickKeywordForUser(schedule.user_id);
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
      publishedUrl = (await publishToWordPress(wpUrl, wpUser, wpPass, title, content, imageUrl)).link;
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('[')) throw e;
    throw new Error(`[발행 실패] ${msg}`);
  }

  return { keyword, url: publishedUrl, title };
}
