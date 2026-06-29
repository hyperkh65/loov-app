import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export const maxDuration = 600;

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
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.id, url: data.source_url };
  } catch { return null; }
}

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

async function uploadContentImages(content: string, siteUrl: string, auth: string): Promise<string> {
  const imgRegex = /<img([^>]+)src="([^"]+)"([^>]*)>/gi;
  const matches = [...content.matchAll(imgRegex)];
  const urlsToUpload = [...new Set(matches.map(m => m[2]).filter(u => u.startsWith('http')))].slice(0, 5);
  if (urlsToUpload.length === 0) return content;
  const results = await Promise.all(urlsToUpload.map(url => uploadImageToWordpress(url, siteUrl, auth)));
  let processed = content;
  urlsToUpload.forEach((originalUrl, i) => {
    if (results[i]) processed = processed.replaceAll(originalUrl, results[i]!.url);
  });
  return processed;
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!(cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`);
  const supabase = isCron ? await createAdminClient() : await createClient();

  let userId: string | undefined;
  if (!isCron) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
    userId = user.id;
  }

  const {
    article_id,
    blog_platforms = [],
    sns_platforms = [],
    wp_site_ids = [],
    tistory_blog_ids = [],
    naver_cafe_menu_id,
    naver_cafe_open_yn = 'Y',
  } = await req.json();

  if (!article_id) return NextResponse.json({ error: 'article_id 필요' }, { status: 400 });

  let articleQuery = supabase.from('bossai_auto_articles').select('*').eq('id', article_id);
  if (userId) articleQuery = articleQuery.eq('user_id', userId);
  const { data: article, error: fetchErr } = await articleQuery.single();
  if (fetchErr || !article) return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });

  // 내부 API 호출은 프록시 우회를 위해 localhost 직접 연결
  const baseUrl = process.env.INTERNAL_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host')}`;
  const results: Record<string, { success: boolean; url?: string; error?: string }> = {};
  const cookieHeader = req.headers.get('cookie') || '';

  // ── Phase 1: 모든 블로그 플랫폼 병렬 실행 ───────────────────────────
  const blogTasks: Promise<void>[] = [];

  if (blog_platforms.includes('naver')) {
    blogTasks.push((async () => {
      try {
        const res = await fetch(`${baseUrl}/api/naver/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({ title: article.title, content: article.content, tags: article.focus_keyword ? [article.focus_keyword] : [] }),
        });
        const data = await res.json();
        results.naver = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };
      } catch (err) { results.naver = { success: false, error: String(err) }; }
    })());
  }

  if (blog_platforms.includes('blogger')) {
    blogTasks.push((async () => {
      try {
        const res = await fetch(`${baseUrl}/api/blogger/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({ title: article.title, content: article.content, labels: article.focus_keyword ? [article.focus_keyword] : [] }),
        });
        const data = await res.json();
        results.blogger = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };
      } catch (err) { results.blogger = { success: false, error: String(err) }; }
    })());
  }

  if (blog_platforms.includes('wordpress')) {
    blogTasks.push((async () => {
      let sitesQuery = supabase.from('wordpress_sites').select('id, site_name, site_url, wp_username, app_password');
      if (userId) sitesQuery = sitesQuery.eq('user_id', userId);
      if (wp_site_ids.length > 0) sitesQuery = sitesQuery.in('id', wp_site_ids);
      const { data: sites } = await sitesQuery;

      if (!sites?.length) {
        results.wordpress = { success: false, error: 'WordPress 사이트가 등록되지 않았습니다. WordPress 관리에서 사이트를 추가하세요.' };
        return;
      }

      const DEFAULT_CATEGORY = 'Aboda';
      await Promise.all(sites.map(site => (async () => {
        const auth = 'Basic ' + Buffer.from(`${site.wp_username}:${site.app_password}`).toString('base64');
        const siteKey = `wordpress_${site.site_name}`;
        try {
          let featuredMediaId: number | undefined;
          if (article.representative_image_url) {
            const thumb = await uploadImageToWordpress(article.representative_image_url, site.site_url, auth);
            if (thumb) featuredMediaId = thumb.id;
          }
          const wpContent = await uploadContentImages(article.content, site.site_url, auth);
          const catId = await resolveTermId(site.site_url, auth, DEFAULT_CATEGORY, 'categories');
          const tagNames = [
            article.focus_keyword,
            article.keyword !== article.focus_keyword ? article.keyword : null,
          ].filter(Boolean) as string[];
          const tagIds: number[] = [];
          for (const tagName of tagNames) {
            const tid = await resolveTermId(site.site_url, auth, tagName, 'tags');
            if (tid) tagIds.push(tid);
          }
          const rawSlug = (article.focus_keyword || article.keyword || article.title)
            .replace(/[,!?\.]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 60);
          const postBody: Record<string, unknown> = {
            title: article.title, content: wpContent, status: 'publish', slug: rawSlug,
          };
          if (featuredMediaId) postBody.featured_media = featuredMediaId;
          if (catId) postBody.categories = [catId];
          if (tagIds.length) postBody.tags = tagIds;

          const res = await fetch(`${site.site_url}/wp-json/wp/v2/posts`, {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/json' },
            body: JSON.stringify(postBody),
            signal: AbortSignal.timeout(120_000),
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
      })()));
    })());
  }

  if (tistory_blog_ids.length > 0) {
    blogTasks.push((async () => {
      let tistoryQuery = supabase.from('tistory_connections').select('id, blog_name, blog_url').eq('is_active', true).in('id', tistory_blog_ids);
      if (userId) tistoryQuery = tistoryQuery.eq('user_id', userId);
      const { data: tistoryBlogs } = await tistoryQuery;
      await Promise.all((tistoryBlogs || []).map(blog => (async () => {
        try {
          const res = await fetch(`${baseUrl}/api/tistory/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
            body: JSON.stringify({ blog_id: blog.id, title: article.title, content: article.content, tags: article.focus_keyword ? [article.focus_keyword] : [] }),
          });
          const data = await res.json();
          results[`tistory_${blog.blog_name}`] = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };
        } catch (err) {
          results[`tistory_${blog.blog_name}`] = { success: false, error: String(err) };
        }
      })()));
    })());
  }

  await Promise.all(blogTasks);

  // ── Phase 2: 네이버 카페 + SNS 병렬 실행 ───────────────────────────
  const newBlogUrls = Object.entries(results)
    .filter(([k, v]) => !k.startsWith('sns_') && !k.startsWith('naver_cafe') && v.success && v.url)
    .map(([, v]) => v.url!);
  const existingBlogUrls = Object.entries(article.published_urls || {})
    .filter(([k]) => !k.startsWith('sns_') && !k.startsWith('naver_cafe'))
    .map(([, v]) => v as string).filter(Boolean);
  const allBlogUrls = [...new Set([...existingBlogUrls, ...newBlogUrls])];
  const cafeBlogUrl = results.naver?.url || newBlogUrls[0] || existingBlogUrls.find(u => u.includes('blog.naver.com')) || existingBlogUrls[0];

  await Promise.all([
    // 네이버 카페
    naver_cafe_menu_id ? (async () => {
      try {
        const res = await fetch(`${baseUrl}/api/naver-cafe/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
          body: JSON.stringify({
            title: article.title,
            content: article.content,
            menu_id: naver_cafe_menu_id,
            open_yn: naver_cafe_open_yn,
            cover_image_url: article.representative_image_url || undefined,
            blog_url: cafeBlogUrl,
          }),
        });
        const data = await res.json();
        results.naver_cafe = res.ok ? { success: true, url: data.url } : { success: false, error: data.error };
      } catch (err) {
        results.naver_cafe = { success: false, error: String(err) };
      }
    })() : Promise.resolve(),

    // SNS: Threads와 나머지 플랫폼을 동시 실행
    sns_platforms.length > 0 ? (async () => {
      const blogLinkText = allBlogUrls.length > 0 ? '\n\n🔗 ' + allBlogUrls.join('\n🔗 ') : '';
      const threadsIncluded = sns_platforms.includes('threads');
      const otherPlatforms = sns_platforms.filter((p: string) => p !== 'threads');

      await Promise.all([
        otherPlatforms.length > 0 ? (async () => {
          try {
            const snsContent = `${article.title}\n\n${article.meta_description || ''}${blogLinkText}`.trim();
            const res = await fetch(`${baseUrl}/api/sns/post-now`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
              body: JSON.stringify({
                content: snsContent,
                platforms: otherPlatforms,
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
            results.sns = { success: false, error: String(err) };
          }
        })() : Promise.resolve(),

        threadsIncluded ? (async () => {
          try {
            const threadsContent = `${article.title}\n\n${article.meta_description || ''}`.trim();
            const threadItems = allBlogUrls.length > 0 ? [{ content: '🔗 ' + allBlogUrls.join('\n🔗 ') }] : [];
            const res = await fetch(`${baseUrl}/api/sns/post-now`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
              body: JSON.stringify({
                content: threadsContent,
                platforms: ['threads'],
                media_urls: article.representative_image_url ? [article.representative_image_url] : [],
                thread_items: threadItems,
              }),
            });
            const data = await res.json();
            if (data.results) {
              for (const r of data.results) {
                results[`sns_${r.platform}`] = { success: r.success, error: r.error };
              }
            }
          } catch (err) {
            results.sns_threads = { success: false, error: String(err) };
          }
        })() : Promise.resolve(),
      ]);
    })() : Promise.resolve(),
  ]);

  // ── 결과 저장 ────────────────────────────────────────────────────────
  const anySuccess = Object.values(results).some(r => r.success);
  const publishedUrls: Record<string, string> = {};
  for (const [k, v] of Object.entries(results)) {
    if (v.success && v.url) publishedUrls[k] = v.url;
  }

  const updateQuery = supabase.from('bossai_auto_articles').update({
    status: anySuccess ? 'published' : 'failed',
    blog_platforms,
    sns_platforms,
    published_urls: publishedUrls,
    published_at: anySuccess ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', article_id);
  await (userId ? updateQuery.eq('user_id', userId) : updateQuery);

  return NextResponse.json({ results, published_urls: publishedUrls });
}
