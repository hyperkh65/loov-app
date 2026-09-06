/**
 * 리라이팅 소스 사이트 — RSS 피드 감지/파싱 + 원문 기사 스크랩
 */
import { XMLParser } from 'fast-xml-parser';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
const FEED_CANDIDATES = ['/feed', '/feed/', '/rss', '/rss.xml', '/feed.xml', '/atom.xml'];

async function fetchText(url: string, timeoutMs = 6000): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

/** 사이트 URL만 주어졌을 때 RSS/Atom 피드 주소를 찾는다 */
export async function discoverFeedUrl(siteUrl: string): Promise<string | null> {
  const base = siteUrl.replace(/\/$/, '');

  const html = await fetchText(siteUrl);
  if (html) {
    const m =
      html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i) ||
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(?:rss|atom)\+xml["']/i);
    if (m?.[1]) {
      try { return new URL(m[1], siteUrl).toString(); } catch { /* fallthrough */ }
    }
  }

  for (const path of FEED_CANDIDATES) {
    const url = `${base}${path}`;
    const text = await fetchText(url, 4000);
    if (text && /<rss|<feed/i.test(text)) return url;
  }
  return null;
}

export interface FeedItem { title: string; link: string }

/** RSS 2.0 / Atom 피드를 파싱해 최신 글 목록을 반환 */
export async function fetchFeedItems(feedUrl: string, limit = 10): Promise<FeedItem[]> {
  const xml = await fetchText(feedUrl, 8000);
  if (!xml) return [];

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let doc: unknown;
  try { doc = parser.parse(xml); } catch { return []; }

  const d = doc as Record<string, unknown>;
  const rssItems = (d?.rss as Record<string, unknown>)?.channel as Record<string, unknown> | undefined;
  const rawItems: unknown[] = rssItems
    ? ([] as unknown[]).concat((rssItems.item as unknown) ?? [])
    : ([] as unknown[]).concat(((d?.feed as Record<string, unknown>)?.entry as unknown) ?? []);

  const items: FeedItem[] = [];
  for (const raw of rawItems) {
    const it = raw as Record<string, unknown>;
    const title = String(it.title ?? '').trim() || '(제목 없음)';
    let link = '';
    if (typeof it.link === 'string') link = it.link;
    else if (Array.isArray(it.link)) {
      const alt = (it.link as Array<Record<string, string>>).find(l => !l['@_rel'] || l['@_rel'] === 'alternate');
      link = alt?.['@_href'] || (it.link[0] as Record<string, string>)?.['@_href'] || '';
    } else if (it.link && typeof it.link === 'object') {
      link = (it.link as Record<string, string>)['@_href'] || '';
    }
    if (!link) continue;
    items.push({ title, link });
    if (items.length >= limit) break;
  }
  return items;
}

export interface ScrapedArticle { text: string; images: string[] }

/** 원문 기사 페이지에서 본문 텍스트 + 이미지 여러 장을 스크랩 */
export async function scrapeArticleFull(url: string): Promise<ScrapedArticle> {
  const html = await fetchText(url, 8000);
  if (!html) return { text: '', images: [] };

  // 이미지: og:image 우선 + 본문 <img> 태그들 (아이콘/로고/배너류 제외)
  const images: string[] = [];
  const ogMatch =
    html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (ogMatch?.[1]?.startsWith('http')) images.push(ogMatch[1]);

  const imgMatches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi)];
  for (const m of imgMatches) {
    const u = m[1];
    if (images.includes(u)) continue;
    if (/(icon|logo|button|banner|sprite|pixel|blank|tracking|avatar)/i.test(u)) continue;
    images.push(u);
    if (images.length >= 6) break;
  }

  // 본문 텍스트: script/style 제거 후 태그 벗기고 공백 정리
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  return { text, images };
}
