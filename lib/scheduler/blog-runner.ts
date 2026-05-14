import { createAdminClient } from '@/lib/supabase-server';
import { refreshBloggerToken } from '@/lib/blogger-token';
import { pickKeywordForUser } from './keyword-picker';
import { generateBlogContent } from '@/lib/blog-content-generator';
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

async function publishToWordPress(wpUrl: string, username: string, appPassword: string, title: string, content: string, featuredImageUrl: string | null): Promise<string> {
  const creds = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const apiUrl = `${wpUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;

  // 대표 이미지를 Featured Image로 등록
  let featuredMediaId: number | undefined;
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
        }
      }
    } catch { /* featured image optional */ }
  }

  const body: Record<string, unknown> = { title, content, status: 'publish' };
  if (featuredMediaId) body.featured_media = featuredMediaId;

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
  return data.link || '';
}

async function getWpCredentials(siteId: string): Promise<{ url: string; username: string; appPassword: string }> {
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

  // 키워드 자동 발굴
  const keyword = await pickKeywordForUser(schedule.user_id);

  // 기존 블로그 자동화와 동일한 품질로 콘텐츠 생성 (뉴스 수집 + 이미지 + 썸네일)
  const { title, content, keywords, imageUrl } = await generateBlogContent(keyword);

  if (!title || !content) throw new Error('AI 글 생성 실패: 출력 파싱 오류');

  let publishedUrl = '';

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
    publishedUrl = await publishToWordPress(wpUrl, wpUser, wpPass, title, content, imageUrl);
  }

  return { keyword, url: publishedUrl, title };
}
