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

/** 이미지 URL을 h2/h3 소제목 뒤에 순서대로 삽입 */
function injectImagesIntoContent(html: string, imageUrls: string[]): string {
  if (!imageUrls.length) return html;
  let idx = 0;
  const result = html.replace(/<\/h[23]>/gi, (match) => {
    if (idx < imageUrls.length) {
      const figure = `${match}\n<figure class="wp-block-image size-large"><img src="${imageUrls[idx++]}" alt="" /></figure>`;
      return figure;
    }
    return match;
  });
  // 남은 이미지는 본문 끝에 추가
  if (idx < imageUrls.length) {
    return result + '\n' + imageUrls.slice(idx).map(
      (url) => `<figure class="wp-block-image size-large"><img src="${url}" alt="" /></figure>`,
    ).join('\n');
  }
  return result;
}

/** WordPress 미디어 업로드 → media ID 반환 */
async function uploadImage(siteUrl: string, auth: string, file: File): Promise<{ id: number; url: string } | null> {
  try {
    const buffer = await file.arrayBuffer();
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': file.type || 'image/jpeg',
        'Content-Disposition': `attachment; filename="${file.name}"`,
      },
      body: buffer,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.id, url: data.source_url };
  } catch {
    return null;
  }
}

async function resolveTerms(siteUrl: string, auth: string, names: string[], type: 'categories' | 'tags'): Promise<number[]> {
  const endpoint = type === 'categories' ? 'categories' : 'tags';
  const ids: number[] = [];
  for (const name of names) {
    try {
      const search = await fetch(`${siteUrl}/wp-json/wp/v2/${endpoint}?search=${encodeURIComponent(name)}`, {
        headers: { Authorization: auth },
      });
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

  // FormData 파싱
  const formData = await req.formData();
  const metaRaw = formData.get('meta');
  if (!metaRaw) return NextResponse.json({ error: 'meta 누락' }, { status: 400 });

  const { title, content, status = 'publish', categories = [], tags = [], siteIds, notionPageId = '' }
    = JSON.parse(metaRaw as string) as {
      title: string; content: string; status: string;
      categories: string[]; tags: string[];
      siteIds: string[]; notionPageId: string;
    };

  const imageFiles = formData.getAll('images') as File[];

  if (!title || !content || !siteIds?.length)
    return NextResponse.json({ error: '제목, 내용, 사이트 선택은 필수입니다' }, { status: 400 });

  // 사이트 정보 조회
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
    const baseUrl = site.site_url;

    try {
      // ① 이미지 업로드 (각 사이트마다)
      const uploadedIds: number[] = [];
      const uploadedUrls: string[] = [];

      for (const file of imageFiles) {
        const result = await uploadImage(baseUrl, auth, file);
        if (result) {
          uploadedIds.push(result.id);
          uploadedUrls.push(result.url);
        }
      }

      // ② 첫 이미지 = 대표 이미지, 나머지 = 본문 삽입
      const featuredMediaId = uploadedIds[0] || undefined;
      const bodyImageUrls = uploadedUrls.slice(1);

      // ③ 본문에 이미지 주입 (h2/h3 뒤에 순서대로)
      const finalContent = injectImagesIntoContent(content, bodyImageUrls);

      // ④ 카테고리/태그 ID 해석
      const [catIds, tagIds] = await Promise.all([
        resolveTerms(baseUrl, auth, categories, 'categories'),
        resolveTerms(baseUrl, auth, tags, 'tags'),
      ]);

      // ⑤ 발행
      const postBody: Record<string, unknown> = { title, content: finalContent, status };
      if (catIds.length) postBody.categories = catIds;
      if (tagIds.length) postBody.tags = tagIds;
      if (featuredMediaId) postBody.featured_media = featuredMediaId;

      const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        results.push({ siteId: site.id, siteName: site.site_name, success: false, error: `${res.status}: ${errText.substring(0, 120)}` });
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
