import { createAdminClient } from '@/lib/supabase-server';

export const revalidate = 3600; // 1시간 캐시

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

function pickBestUrl(published_urls: Record<string, string>): string | null {
  // WordPress > Tistory > Naver > Blogger 우선순위
  const priority = ['wordpress', 'tistory', 'naver', 'blogger'];
  for (const key of priority) {
    if (published_urls[key]) return published_urls[key];
  }
  const first = Object.values(published_urls).find(Boolean);
  return first || null;
}

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
  const siteName = 'LOOV 블로그';
  const siteDesc = '최신 트렌드 정보와 유용한 콘텐츠';

  try {
    const supabase = createAdminClient();

    const { data: articles } = await supabase
      .from('bossai_auto_articles')
      .select('id, title, keyword, focus_keyword, meta_description, content, representative_image_url, published_urls, published_at, created_at')
      .eq('status', 'published')
      .not('published_urls', 'is', null)
      .order('published_at', { ascending: false })
      .limit(30);

    const items = (articles || [])
      .map(a => {
        const url = pickBestUrl(a.published_urls || {});
        if (!url) return null;
        const title = escapeXml(stripHtml(a.title || ''));
        const desc = escapeXml(a.meta_description ? stripHtml(a.meta_description) : stripHtml(a.content || '').slice(0, 200));
        const pubDate = new Date(a.published_at || a.created_at).toUTCString();
        const category = escapeXml(a.keyword || a.focus_keyword || '');
        const imgUrl = a.representative_image_url ? escapeXml(a.representative_image_url) : null;

        return `    <item>
      <title>${title}</title>
      <link>${escapeXml(url)}</link>
      <description>${desc}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      ${category ? `<category>${category}</category>` : ''}
      ${imgUrl ? `<enclosure url="${imgUrl}" type="image/jpeg" length="0"/>` : ''}
      ${imgUrl ? `<media:content url="${imgUrl}" medium="image"/>` : ''}
    </item>`;
      })
      .filter(Boolean)
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(siteName)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(siteDesc)}</description>
    <language>ko</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${siteUrl}/favicon.ico</url>
      <title>${escapeXml(siteName)}</title>
      <link>${siteUrl}</link>
    </image>
${items}
  </channel>
</rss>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch {
    return new Response('<?xml version="1.0"?><rss version="2.0"><channel><title>Error</title></channel></rss>', {
      status: 500,
      headers: { 'Content-Type': 'application/rss+xml' },
    });
  }
}
