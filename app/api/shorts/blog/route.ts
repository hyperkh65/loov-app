import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const DEFAULT_BLOG = 'https://2days.kr';

// ── 유틸 ────────────────────────────────────────────────────────────────────
function extractCDATA(str: string): string {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}
function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
  return m ? extractCDATA(m[1]).trim() : '';
}
function extractFirstImage(html: string): string {
  const fifu = html.match(/data-fifu-featured[^>]*src="([^"]+)"/);
  if (fifu) return fifu[1];
  const wpImg = html.match(/<img[^>]+src="(https?:\/\/[^"]*(?:wp-content\/uploads)[^"]*?\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)[^"]*"/i);
  if (wpImg) return wpImg[1];
  const anyImg = html.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i);
  return anyImg ? anyImg[1] : '';
}
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── 포스트 이미지 목록 추출 ────────────────────────────────────────────────
async function fetchPostImages(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LOOV/1.0)' },
      next: { revalidate: 300 },
    });
    const html = await res.text();
    const seen = new Set<string>();
    const images: string[] = [];
    // content:encoded 영역에서 우선 추출
    const contentArea = html.match(/class="(?:tdb-block-inner|td-post-content|entry-content|post-content)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/) ?.[1] ?? html;
    const imgRegex = /<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/gi;
    let m;
    while ((m = imgRegex.exec(contentArea)) !== null) {
      const src = m[1];
      if (seen.has(src)) continue;
      // 작은 이미지/아이콘/로고 제외
      if (/icon|logo|avatar|emoji|thumb|1x1|pixel/i.test(src)) continue;
      seen.add(src);
      images.push(src);
    }
    return images.slice(0, 12);
  } catch { return []; }
}

// ── RSS 파싱 ────────────────────────────────────────────────────────────────
function parseRSS(xml: string) {
  const items: {
    id: string; title: string; url: string; image: string;
    excerpt: string; content: string; date: string; categories: string[];
  }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const item = m[1];
    const title = extractTag(item, 'title');
    const url   = extractTag(item, 'link');
    const pubDate = extractTag(item, 'pubDate');
    const description = stripHtml(extractTag(item, 'description')).slice(0, 200);
    const contentEncoded = extractTag(item, 'content:encoded');
    const image = extractFirstImage(contentEncoded) || extractFirstImage(extractTag(item, 'description'));
    const catMatches = [...item.matchAll(/<category><!\[CDATA\[(.*?)\]\]>/g)];
    const categories = catMatches.map(c => c[1]);
    const cleanContent = stripHtml(contentEncoded).slice(0, 1000);
    items.push({ id: url, title, url, image, excerpt: description, content: cleanContent,
      date: pubDate ? new Date(pubDate).toLocaleDateString('ko-KR') : '', categories });
  }
  return items;
}

// ── 홈페이지 HTML 파싱 (2days.kr 전용) ─────────────────────────────────────
function parseHomepage(html: string, baseUrl: string) {
  const posts: {
    id: string; title: string; url: string; image: string;
    excerpt: string; content: string; date: string; categories: string[];
  }[] = [];
  const moduleRegex = /class="td_module_wrap[\s\S]*?(?=class="td_module_wrap|<\/div>\s*<\/div>\s*<\/section)/g;
  const modules = html.match(moduleRegex) ?? [];
  for (const mod of modules.slice(0, 20)) {
    const titleMatch = mod.match(/class="entry-title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const url = titleMatch[1];
    const title = stripHtml(titleMatch[2]).trim();
    if (!title || !url.startsWith('http')) continue;
    const imgMatch = mod.match(/data-img-url="([^"]+)"|src="([^"]*wp-content\/uploads\/[^"]+)"/);
    const image = imgMatch ? (imgMatch[1] || imgMatch[2] || '') : '';
    const catMatch = mod.match(/class="td-post-category"[^>]*>([^<]+)/);
    const categories = catMatch ? [catMatch[1].trim()] : [];
    const excerptMatch = mod.match(/class="td-excerpt"[^>]*>([\s\S]*?)<\/p>/);
    const excerpt = excerptMatch ? stripHtml(excerptMatch[1]).slice(0, 200) : '';
    const dateMatch = mod.match(/datetime="([^"]+)"/);
    const date = dateMatch ? new Date(dateMatch[1]).toLocaleDateString('ko-KR') : '';
    posts.push({ id: url, title, url, image, excerpt, content: '', date, categories });
  }
  // 범용 WordPress 파싱 (다른 블로그용)
  if (posts.length === 0) {
    const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/g;
    let am;
    while ((am = articleRegex.exec(html)) !== null && posts.length < 20) {
      const art = am[1];
      const titleM = art.match(/<h[1-3][^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!titleM) continue;
      const url = titleM[1].startsWith('http') ? titleM[1] : baseUrl + titleM[1];
      const title = stripHtml(titleM[2]).trim();
      if (!title) continue;
      const imgM = art.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
      const image = imgM?.[1] ?? '';
      const dateM = art.match(/datetime="([^"]+)"/);
      const date = dateM ? new Date(dateM[1]).toLocaleDateString('ko-KR') : '';
      posts.push({ id: url, title, url, image, excerpt: '', content: '', date, categories: [] });
    }
  }
  return posts;
}

// ── 개별 포스트 본문 ─────────────────────────────────────────────────────────
async function fetchPostContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LOOV/1.0)' },
      next: { revalidate: 300 },
    });
    const html = await res.text();
    const contentMatch = html.match(/class="(?:tdb-block-inner|td-post-content|entry-content|post-content)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    if (contentMatch) return stripHtml(contentMatch[1]).slice(0, 3000);
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
    if (articleMatch) return stripHtml(articleMatch[1]).slice(0, 3000);
    return '';
  } catch { return ''; }
}

// ── Route Handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const postUrl   = searchParams.get('url');
    const getImages = searchParams.get('get_images');
    const blogUrl   = searchParams.get('blog_url');

    // 포스트 이미지 목록 추출
    if (postUrl && getImages) {
      const images = await fetchPostImages(postUrl);
      return NextResponse.json({ images });
    }

    // 개별 포스트 내용
    if (postUrl) {
      const content = await fetchPostContent(postUrl);
      return NextResponse.json({ content });
    }

    // 포스트 목록 (기본: 2days.kr, 또는 커스텀)
    const targetBase = (blogUrl || DEFAULT_BLOG).replace(/\/$/, '');

    const [rssRes, htmlRes] = await Promise.allSettled([
      fetch(`${targetBase}/feed`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LOOV/1.0)' },
        next: { revalidate: 300 },
      }),
      fetch(targetBase, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LOOV/1.0)' },
        next: { revalidate: 300 },
      }),
    ]);

    let posts: ReturnType<typeof parseRSS> = [];

    if (rssRes.status === 'fulfilled' && rssRes.value.ok) {
      const xml = await rssRes.value.text();
      posts = parseRSS(xml);
    }
    if (htmlRes.status === 'fulfilled' && htmlRes.value.ok) {
      const html = await htmlRes.value.text();
      const homePosts = parseHomepage(html, targetBase);
      for (const hp of homePosts) {
        if (!posts.find(p => p.url === hp.url)) posts.push(hp);
      }
    }

    return NextResponse.json({ posts: posts.slice(0, 25), total: posts.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
