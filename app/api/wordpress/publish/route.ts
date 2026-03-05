import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

interface PublishResult {
  siteId: string;
  siteName: string;
  success: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
}

async function uploadFeaturedImage(
  siteUrl: string,
  authHeader: string,
  imageUrl: string,
): Promise<number | null> {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.split('/')[1] || 'jpg';
    const fileName = `wp-auto-${Date.now()}.${ext}`;

    const res = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
      body: buffer,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id || null;
  } catch {
    return null;
  }
}

async function resolveCategories(siteUrl: string, authHeader: string, categoryNames: string[]): Promise<number[]> {
  if (!categoryNames.length) return [];
  try {
    const ids: number[] = [];
    for (const name of categoryNames) {
      // 기존 카테고리 검색
      const search = await fetch(`${siteUrl}/wp-json/wp/v2/categories?search=${encodeURIComponent(name)}`, {
        headers: { Authorization: authHeader },
      });
      if (search.ok) {
        const cats = await search.json();
        if (cats.length > 0) { ids.push(cats[0].id); continue; }
      }
      // 없으면 생성
      const create = await fetch(`${siteUrl}/wp-json/wp/v2/categories`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (create.ok) {
        const cat = await create.json();
        ids.push(cat.id);
      }
    }
    return ids;
  } catch {
    return [];
  }
}

async function resolveTags(siteUrl: string, authHeader: string, tagNames: string[]): Promise<number[]> {
  if (!tagNames.length) return [];
  try {
    const ids: number[] = [];
    for (const name of tagNames) {
      const search = await fetch(`${siteUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}`, {
        headers: { Authorization: authHeader },
      });
      if (search.ok) {
        const tags = await search.json();
        if (tags.length > 0) { ids.push(tags[0].id); continue; }
      }
      const create = await fetch(`${siteUrl}/wp-json/wp/v2/tags`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (create.ok) {
        const tag = await create.json();
        ids.push(tag.id);
      }
    }
    return ids;
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const {
    title,
    content,
    status = 'publish',
    categories = [],   // string[]
    tags = [],         // string[]
    featuredImageUrl,
    siteIds,           // uuid[]
    notionPageId = '',
  } = await req.json();

  if (!title || !content || !siteIds?.length)
    return NextResponse.json({ error: '제목, 내용, 사이트 선택은 필수입니다' }, { status: 400 });

  // 선택한 사이트 정보 조회
  const { data: sites } = await supabase
    .from('wordpress_sites')
    .select('id, site_name, site_url, wp_username, app_password')
    .eq('user_id', user.id)
    .in('id', siteIds);

  if (!sites?.length)
    return NextResponse.json({ error: '유효한 사이트가 없습니다' }, { status: 400 });

  const results: PublishResult[] = [];

  for (const site of sites) {
    const authHeader = 'Basic ' + Buffer.from(`${site.wp_username}:${site.app_password}`).toString('base64');
    const baseUrl = site.site_url;

    try {
      // 카테고리/태그 ID 해석
      const [catIds, tagIds] = await Promise.all([
        resolveCategories(baseUrl, authHeader, categories),
        resolveTags(baseUrl, authHeader, tags),
      ]);

      // 대표 이미지 업로드
      let featuredMediaId: number | undefined;
      if (featuredImageUrl) {
        const mediaId = await uploadFeaturedImage(baseUrl, authHeader, featuredImageUrl);
        if (mediaId) featuredMediaId = mediaId;
      }

      // 발행
      const postBody: Record<string, unknown> = { title, content, status };
      if (catIds.length) postBody.categories = catIds;
      if (tagIds.length) postBody.tags = tagIds;
      if (featuredMediaId) postBody.featured_media = featuredMediaId;

      const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        results.push({ siteId: site.id, siteName: site.site_name, success: false, error: `${res.status}: ${errText.substring(0, 100)}` });
        continue;
      }

      const post = await res.json();
      results.push({ siteId: site.id, siteName: site.site_name, success: true, postId: post.id, postUrl: post.link });
    } catch (e) {
      results.push({ siteId: site.id, siteName: site.site_name, success: false, error: String(e) });
    }
  }

  // 히스토리 저장
  const successSites = results.filter((r) => r.success).map((r) => r.siteName);
  if (successSites.length > 0) {
    await supabase.from('wordpress_post_history').insert({
      user_id: user.id,
      notion_page_id: notionPageId,
      title,
      sites: successSites,
      results,
    });
  }

  return NextResponse.json({ results });
}
