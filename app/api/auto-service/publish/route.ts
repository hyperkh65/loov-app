import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 120;

// WordPress: 이미지 URL → WP 미디어 업로드 → 미디어 ID/URL 반환
async function uploadImageToWordpress(
  imageUrl: string,
  siteUrl: string,
  auth: string,
): Promise<{ id: number; url: string } | null> {
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) return null;
    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.split('/')[1]?.split(';')[0]?.split('+')[0] || 'jpg';
    const filename = `auto_blog_${Date.now()}.${ext}`;

    const res = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': contentType,
      },
      body: buffer,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.id, url: data.source_url };
  } catch { return null; }
}

// WP 카테고리/태그 이름 → ID 조회 (없으면 생성)
async function resolveTermId(
  siteUrl: string,
  auth: string,
  name: string,
  type: 'categories' | 'tags',
): Promise<number | null> {
  try {
    const search = await fetch(
      `${siteUrl}/wp-json/wp/v2/${type}?search=${encodeURIComponent(name)}&per_page=1`,
      { headers: { Authorization: auth }, signal: AbortSignal.timeout(10_000) },
    );
    if (search.ok) {
      const list = await search.json();
      if (list.length > 0) return list[0].id;
    }
    // 없으면 생성
    const create = await fetch(`${siteUrl}/wp-json/wp/v2/${type}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(10_000),
    });
    if (create.ok) return (await create.json()).id;
  } catch { /* skip */ }
  return null;
}

// 콘텐츠 내 이미지를 WP 미디어로 업로드 후 URL 교체
async function uploadContentImages(
  content: string,
  siteUrl: string,
  auth: string,
): Promise<string> {
  const imgRegex = /<img([^>]+)src="([^"]+)"([^>]*)>/gi;
  const matches = [...content.matchAll(imgRegex)];
  let processed = content;

  for (const match of matches) {
    const originalUrl = match[2];
    if (!originalUrl.startsWith('http')) continue;
    const uploaded = await uploadImageToWordpress(originalUrl, siteUrl, auth);
    if (uploaded) {
      processed = processed.replaceAll(originalUrl, uploaded.url);
    }
  }
  return processed;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { article_id, blog_platforms = [], sns_platforms = [], wp_site_ids = [] } = await req.json();
  if (!article_id) return NextResponse.json({ error: 'article_id 필요' }, { status: 400 });

  const { data: article, error: fetchErr } = await supabase
    .from('bossai_auto_articles')
    .select('*')
    .eq('id', article_id)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !article) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
  const results: Record<string, { success: boolean; url?: string; error?: string }> = {};
  const cookieHeader = req.headers.get('cookie') || '';

  for (const platform of blog_platforms) {
    try {
      if (platform === 'naver') {
        const res = await fetch(`${baseUrl}/api/naver/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({
            title: article.title,
            content: article.content,
            tags: article.focus_keyword ? [article.focus_keyword] : [],
          }),
        });
        const data = await res.json();
        results.naver = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };

      } else if (platform === 'blogger') {
        const res = await fetch(`${baseUrl}/api/blogger/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({
            title: article.title,
            content: article.content,
            labels: article.focus_keyword ? [article.focus_keyword] : [],
          }),
        });
        const data = await res.json();
        results.blogger = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };

      } else if (platform === 'wordpress') {
        // 선택된 사이트 ID로 조회, 없으면 사용자 전체 WP 사이트 조회
        let sitesQuery = supabase
          .from('wordpress_sites')
          .select('id, site_name, site_url, wp_username, app_password')
          .eq('user_id', user.id);

        if (wp_site_ids.length > 0) {
          sitesQuery = sitesQuery.in('id', wp_site_ids);
        }

        const { data: sites } = await sitesQuery;

        if (!sites?.length) {
          results.wordpress = { success: false, error: 'WordPress 사이트가 등록되지 않았습니다. WordPress 관리에서 사이트를 추가하세요.' };
          continue;
        }

        // 기본 카테고리 이름 (대시보드 설정에서 추후 변경 가능)
        const DEFAULT_CATEGORY = 'Aboda';

        for (const site of sites) {
          const auth = 'Basic ' + Buffer.from(`${site.wp_username}:${site.app_password}`).toString('base64');
          const siteKey = `wordpress_${site.site_name}`;

          try {
            // 1. 대표이미지(SVG 썸네일)를 WP 미디어로 먼저 업로드
            let featuredMediaId: number | undefined;
            if (article.representative_image_url) {
              const thumb = await uploadImageToWordpress(article.representative_image_url, site.site_url, auth);
              if (thumb) featuredMediaId = thumb.id;
            }

            // 2. 본문 내 이미지를 WP 미디어로 업로드 + URL 교체
            const wpContent = await uploadContentImages(article.content, site.site_url, auth);

            // 3. 카테고리 "Aboda" 조회 또는 생성
            const catId = await resolveTermId(site.site_url, auth, DEFAULT_CATEGORY, 'categories');

            // 4. 태그: focus_keyword + 추가 키워드
            const tagNames = [
              article.focus_keyword,
              article.keyword !== article.focus_keyword ? article.keyword : null,
            ].filter(Boolean) as string[];
            const tagIds: number[] = [];
            for (const tagName of tagNames) {
              const tid = await resolveTermId(site.site_url, auth, tagName, 'tags');
              if (tid) tagIds.push(tid);
            }

            // 5. 포스트 발행
            const postBody: Record<string, unknown> = {
              title: article.title,
              content: wpContent,
              status: 'publish',
            };
            if (featuredMediaId) postBody.featured_media = featuredMediaId;
            if (catId) postBody.categories = [catId];
            if (tagIds.length) postBody.tags = tagIds;

            const res = await fetch(`${site.site_url}/wp-json/wp/v2/posts`, {
              method: 'POST',
              headers: { Authorization: auth, 'Content-Type': 'application/json' },
              body: JSON.stringify(postBody),
              signal: AbortSignal.timeout(60_000),
            });

            if (res.ok) {
              const post = await res.json();
              results[siteKey] = { success: true, url: post.link };
            } else {
              const errText = await res.text();
              results[siteKey] = { success: false, error: `WP 오류(${res.status}): ${errText.slice(0, 200)}` };
            }
          } catch (siteErr) {
            results[siteKey] = { success: false, error: siteErr instanceof Error ? siteErr.message : String(siteErr) };
          }
        }
      }
    } catch (err) {
      results[platform] = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // SNS 발행
  if (sns_platforms.length > 0) {
    try {
      // 블로그 발행 결과 URL 수집 (SNS에 링크 포함)
      const blogUrls = Object.entries(results)
        .filter(([k, v]) => !k.startsWith('sns_') && v.success && v.url)
        .map(([, v]) => v.url!);
      const blogLinkText = blogUrls.length > 0 ? '\n\n🔗 ' + blogUrls.join('\n🔗 ') : '';
      const snsContent = `${article.title}\n\n${article.meta_description || ''}${blogLinkText}`.trim();
      const res = await fetch(`${baseUrl}/api/sns/post-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
        body: JSON.stringify({
          content: snsContent,
          platforms: sns_platforms,
          media_urls: article.representative_image_url ? [article.representative_image_url] : [],
        }),
      });
      const data = await res.json();
      if (data.results) {
        for (const r of data.results) {
          results[`sns_${r.platform}`] = { success: r.success, error: r.error };
        }
      }
    } catch (err) {
      results.sns = { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const anySuccess = Object.values(results).some(r => r.success);
  const publishedUrls: Record<string, string> = {};
  for (const [k, v] of Object.entries(results)) {
    if (v.success && v.url) publishedUrls[k] = v.url;
  }

  await supabase
    .from('bossai_auto_articles')
    .update({
      status: anySuccess ? 'published' : 'failed',
      blog_platforms,
      sns_platforms,
      published_urls: publishedUrls,
      published_at: anySuccess ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', article_id)
    .eq('user_id', user.id);

  return NextResponse.json({ results, published_urls: publishedUrls });
}
