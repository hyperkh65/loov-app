import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”');
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ''));
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('site_id');
  const perPage = Math.min(parseInt(searchParams.get('per_page') || '12'), 50);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || 'publish';

  if (!siteId) return NextResponse.json({ error: 'site_id 필요' }, { status: 400 });

  const { data: site } = await supabase
    .from('wordpress_sites')
    .select('site_url, wp_username, app_password')
    .eq('id', siteId)
    .eq('user_id', user.id)
    .single();

  if (!site) return NextResponse.json({ error: '사이트를 찾을 수 없습니다' }, { status: 404 });

  const auth = 'Basic ' + Buffer.from(`${site.wp_username}:${site.app_password}`).toString('base64');

  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

  const params = new URLSearchParams({
    '_embed': 'wp:featuredmedia',
    'per_page': String(perPage),
    'page': String(page),
    'orderby': 'date',
    'order': order,
  });
  if (status !== 'any') params.set('status', status);
  if (search.trim()) params.set('search', search.trim());

  let wpRes: Response;
  try {
    wpRes = await fetch(`${site.site_url}/wp-json/wp/v2/posts?${params}`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return NextResponse.json({ error: 'WordPress 사이트에 연결할 수 없습니다' }, { status: 502 });
  }

  if (!wpRes.ok) {
    const errText = await wpRes.text().catch(() => '');
    return NextResponse.json(
      { error: `WP API 오류 (${wpRes.status}): ${errText.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const total = parseInt(wpRes.headers.get('X-WP-Total') || '0');
  const totalPages = parseInt(wpRes.headers.get('X-WP-TotalPages') || '1');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPosts = await wpRes.json() as any[];

  const posts = rawPosts.map((p) => {
    const media = p._embedded?.['wp:featuredmedia']?.[0];
    const fullImage: string | null = media?.source_url ?? null;
    const thumbImage: string | null =
      media?.media_details?.sizes?.medium_large?.source_url ??
      media?.media_details?.sizes?.medium?.source_url ??
      fullImage;

    return {
      id: p.id as number,
      title: stripTags(p.title?.rendered ?? ''),
      excerpt: stripTags(p.excerpt?.rendered ?? '').slice(0, 250),
      date: p.date as string,
      link: p.link as string,
      status: p.status as string,
      featured_image: fullImage,
      featured_image_thumb: thumbImage,
    };
  });

  return NextResponse.json({ posts, total, totalPages });
}
