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

async function resolveTerms(
  siteUrl: string,
  auth: string,
  names: string[],
  type: 'categories' | 'tags',
): Promise<number[]> {
  const endpoint = type === 'categories' ? 'categories' : 'tags';
  const ids: number[] = [];
  for (const name of names) {
    try {
      const search = await fetch(
        `${siteUrl}/wp-json/wp/v2/${endpoint}?search=${encodeURIComponent(name)}`,
        { headers: { Authorization: auth } },
      );
      if (search.ok) {
        const list = await search.json();
        if (list.length > 0) { ids.push(list[0].id); continue; }
      }
      const create = await fetch(`${siteUrl}/wp-json/wp/v2/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (create.ok) ids.push((await create.json()).id);
    } catch { /* skip */ }
  }
  return ids;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const {
    title, content, status = 'publish',
    categories = [], tags = [],
    siteIds, notionPageId = '',
    featuredMediaIds = {},
  } = await req.json() as {
    title: string; content: string; status: string;
    categories: string[]; tags: string[];
    siteIds: string[]; notionPageId: string;
    featuredMediaIds: Record<string, number>;
  };

  if (!title || !content || !siteIds?.length)
    return NextResponse.json({ error: '제목, 내용, 사이트 선택은 필수입니다' }, { status: 400 });

  const { data: sites } = await supabase
    .from('wordpress_sites')
    .select('id, site_name, site_url, wp_username, app_password')
    .eq('user_id', user.id)
    .in('id', siteIds);

  if (!sites?.length)
    return NextResponse.json({ error: '유효한 사이트가 없습니다' }, { status: 400 });

  const results: PublishResult[] = [];

  for (const site of sites) {
    const auth = 'Basic ' + Buffer.from(`${site.wp_username}:${site.app_password}`).toString('base64');

    try {
      const [catIds, tagIds] = await Promise.all([
        resolveTerms(site.site_url, auth, categories, 'categories'),
        resolveTerms(site.site_url, auth, tags, 'tags'),
      ]);

      // 이미지는 이미 WP 미디어 업로드 완료된 ID 사용
      const featuredMediaId = featuredMediaIds[site.id];

      const postBody: Record<string, unknown> = { title, content, status };
      if (catIds.length) postBody.categories = catIds;
      if (tagIds.length) postBody.tags = tagIds;
      if (featuredMediaId) postBody.featured_media = featuredMediaId;

      const res = await fetch(`${site.site_url}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        results.push({
          siteId: site.id, siteName: site.site_name,
          success: false, error: `발행 실패 (${res.status}): ${errText.slice(0, 120)}`,
        });
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
      user_id: user.id, notion_page_id: notionPageId,
      title, sites: successSites, results,
    });
  }

  return NextResponse.json({ results });
}
