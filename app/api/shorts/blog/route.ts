import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const BLOG_BASE = 'https://2days.kr';

// ── RSS 파싱 ──────────────────────────────────────────────────────────────────
function extractCDATA(str: string): string {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
  return m ? extractCDATA(m[1]).trim() : '';
}

function extractFirstImage(html: string): string {
  // Featured image first (fifu plugin marker)
  const fifu = html.match(/data-fifu-featured[^>]*src="([^"]+)"/);
  if (fifu) return fifu[1];
  // wp-content uploads images
  const wpImg = html.match(/<img[^>]+src="(https?:\/\/[^"]*(?:wp-content\/uploads|2days\.kr)[^"]*?\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)[^"]*"/i);
  if (wpImg) return wpImg[1];
  // Any image
  const anyImg = html.match(/<img[^>]+src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i);
  return anyImg ? anyImg[1] : '';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

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
    const url = extractTag(item, 'link');
    const pubDate = extractTag(item, 'pubDate');
    const description = stripHtml(extractTag(item, 'description')).slice(0, 200);
    const contentEncoded = extractTag(item, 'content:encoded');
    const image = extractFirstImage(contentEncoded) || extractFirstImage(extractTag(item, 'description'));

    const catMatches = [...item.matchAll(/<category><!\[CDATA\[(.*?)\]\]>/g)];
    const categories = catMatches.map(c => c[1]);

    const cleanContent = stripHtml(contentEncoded).slice(0, 1000);

    items.push({
      id: url,
      title,
      url,
      image,
      excerpt: description,
      content: cleanContent,
      date: pubDate ? new Date(pubDate).toLocaleDateString('ko-KR') : '',
      categories,
    });
  }
  return items;
}

// ── 홈페이지 HTML 파싱 (최대 20개) ────────────────────────────────────────────
function parseHomepage(html: string) {
  const posts: {
    id: string; title: string; url: string; image: string;
    excerpt: string; content: string; date: string; categories: string[];
  }[] = [];

  // td_module_wrap 블록 추출
  const moduleRegex = /class="td_module_wrap[\s\S]*?(?=class="td_module_wrap|<\/div>\s*<\/div>\s*<\/section)/g;
  const modules = html.match(moduleRegex) ?? [];

  for (const mod of modules.slice(0, 20)) {
    // 제목 + URL
    const titleMatch = mod.match(/class="entry-title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const url = titleMatch[1];
    const title = stripHtml(titleMatch[2]).trim();
    if (!title || !url.startsWith('http')) continue;

    // 이미지
    const imgMatch = mod.match(/data-img-url="([^"]+)"|src="([^"]*wp-content\/uploads\/[^"]+)"/);
    const image = imgMatch ? (imgMatch[1] || imgMatch[2] || '') : '';

    // 카테고리
    const catMatch = mod.match(/class="td-post-category"[^>]*>([^<]+)/);
    const categories = catMatch ? [catMatch[1].trim()] : [];

    // 발췌
    const excerptMatch = mod.match(/class="td-excerpt"[^>]*>([\s\S]*?)<\/p>/);
    const excerpt = excerptMatch ? stripHtml(excerptMatch[1]).slice(0, 200) : '';

    // 날짜
    const dateMatch = mod.match(/datetime="([^"]+)"/);
    const date = dateMatch ? new Date(dateMatch[1]).toLocaleDateString('ko-KR') : '';

    posts.push({ id: url, title, url, image, excerpt, content: '', date, categories });
  }
  return posts;
}

// ── 개별 포스트 내용 가져오기 ─────────────────────────────────────────────────
async function fetchPostContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LOOV/1.0)' },
      next: { revalidate: 300 },
    });
    const html = await res.text();
    // .tdb-block-inner 또는 .td-post-content에서 본문 추출
    const contentMatch = html.match(/class="(?:tdb-block-inner|td-post-content)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    if (contentMatch) return stripHtml(contentMatch[1]).slice(0, 3000);
    // 폴백: article 태그
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
    const postUrl = searchParams.get('url');

    // 개별 포스트 내용 조회
    if (postUrl) {
      const content = await fetchPostContent(postUrl);
      return NextResponse.json({ content });
    }

    // 포스트 목록 (RSS + 홈페이지 HTML 병합)
    const [rssRes, htmlRes] = await Promise.allSettled([
      fetch(`${BLOG_BASE}/feed`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LOOV/1.0)' },
        next: { revalidate: 300 },
      }),
      fetch(BLOG_BASE, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LOOV/1.0)' },
        next: { revalidate: 300 },
      }),
    ]);

    let posts: ReturnType<typeof parseRSS> = [];

    // RSS (최신 5개 - 이미지 포함)
    if (rssRes.status === 'fulfilled' && rssRes.value.ok) {
      const xml = await rssRes.value.text();
      posts = parseRSS(xml);
    }

    // 홈페이지 (최대 20개 - 더 많은 포스트)
    if (htmlRes.status === 'fulfilled' && htmlRes.value.ok) {
      const html = await htmlRes.value.text();
      const homePosts = parseHomepage(html);
      // 중복 제거 후 합치기
      for (const hp of homePosts) {
        if (!posts.find(p => p.url === hp.url)) {
          posts.push(hp);
        }
      }
    }

    return NextResponse.json({ posts: posts.slice(0, 25), total: posts.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
