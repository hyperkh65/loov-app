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

export async function publishToWordPress(wpUrl: string, username: string, appPassword: string, title: string, content: string, featuredImageUrl: string | null, status: 'publish' | 'draft' = 'publish'): Promise<string> {
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

  const body: Record<string, unknown> = { title, content, status };
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

  // 키워드 자동 발굴
  let keyword: string;
  try {
    keyword = await pickKeywordForUser(schedule.user_id);
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
      publishedUrl = await publishToWordPress(wpUrl, wpUser, wpPass, title, content, imageUrl);
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('[')) throw e;
    throw new Error(`[발행 실패] ${msg}`);
  }

  return { keyword, url: publishedUrl, title };
}
