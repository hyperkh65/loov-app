/**
 * Tech Hub 소스 수집 — 해외 커뮤니티(HN/Reddit/Lobsters/HF/GitHub) + 해외 매체 + 국내(GeekNews)
 * 모두 병렬 수집 → 소스별 점수 정규화 → 최신성 감쇠 → 여러 소스에 동시에 뜬 이슈 가산 → 발행 이력 중복 제거.
 * 각 소스는 실패해도 나머지로 계속 진행(Promise.allSettled).
 */
import { createAdminClient } from '@/lib/supabase-server';

export interface Candidate {
  title: string;
  link: string;
  source: string;
  /** 0~1 소스 내 정규화 점수(순위+커뮤니티 반응) */
  base: number;
  ageH: number;
  summary: string;
  score: number;
  /** 같은 이슈가 뜬 다른 소스 수 */
  mentions: number;
}

type Raw = { title: string; link: string; at?: number; summary?: string; points?: number };
interface Src { name: string; w: number; get: () => Promise<Raw[]> }

const UA = 'Mozilla/5.0 (compatible; LoovBot/1.0; +https://loov.co.kr)';

async function get(url: string, ms = 12_000): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const unwrap = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const text = (s: string) => unwrap(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();

function parseFeed(xml: string, limit = 25): Raw[] {
  const out: Raw[] = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) || [];
  for (const b of blocks.slice(0, limit)) {
    const title = text(b.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '');
    const link = (b.match(/<link[^>]*?href=["']([^"']+)["']/)?.[1] || text(b.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] || '')).trim();
    const date = b.match(/<(?:pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/)?.[1];
    const desc = b.match(/<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/)?.[1] || '';
    const at = date ? Date.parse(text(date)) : NaN;
    if (title && /^https?:/.test(link)) out.push({ title, link, at: isNaN(at) ? undefined : at, summary: text(desc).slice(0, 300) });
  }
  return out;
}

const rss = (name: string, url: string, w: number): Src => ({ name, w, get: async () => parseFeed(await get(url)) });

// 레딧: RSS 항목의 [link]가 원문 URL (댓글 페이지만 있으면 제외)
const reddit = (sub: string, w: number): Src => ({
  name: `r/${sub}`, w,
  get: async () => {
    const xml = await get(`https://www.reddit.com/r/${sub}/top/.rss?t=day`);
    const out: Raw[] = [];
    for (const b of (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).slice(0, 15)) {
      const title = text(b.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
      const ext = unwrap(b).match(/href="(https?:\/\/(?!www\.reddit\.com|old\.reddit\.com|i\.redd\.it|v\.redd\.it)[^"]+)">\[link\]/)?.[1];
      const at = Date.parse(b.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] || '');
      if (title && ext) out.push({ title, link: ext.replace(/&amp;/g, '&'), at: isNaN(at) ? undefined : at });
    }
    return out;
  },
});

const SOURCES: Src[] = [
  // 커뮤니티 반응(해외)
  { name: 'Hacker News', w: 1.0, get: async () => {
    const j = JSON.parse(await get('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=40'));
    return (j.hits || []).map((h: { title: string; url?: string; objectID: string; points: number; created_at_i: number }) => ({
      title: h.title, link: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, points: h.points, at: h.created_at_i * 1000,
    }));
  } },
  { name: 'Lobsters', w: 0.7, get: async () => (JSON.parse(await get('https://lobste.rs/hottest.json')) as Array<{ title: string; url: string; score: number; created_at: string }>)
    .filter(x => x.url).map(x => ({ title: x.title, link: x.url, points: x.score, at: Date.parse(x.created_at) })) },
  { name: 'HF Papers', w: 0.9, get: async () => {
    const j = JSON.parse(await get('https://huggingface.co/api/daily_papers?limit=20')) as Array<{ paper: { id: string; title: string; upvotes: number; summary?: string; publishedAt?: string } }>;
    return j.map(x => ({ title: x.paper.title, link: `https://huggingface.co/papers/${x.paper.id}`, points: x.paper.upvotes, summary: (x.paper.summary || '').slice(0, 300), at: Date.parse(x.paper.publishedAt || '') || undefined }));
  } },
  { name: 'GitHub Trending', w: 0.9, get: async () => {
    const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const j = JSON.parse(await get(`https://api.github.com/search/repositories?q=created:%3E${since}&sort=stars&per_page=15`));
    return (j.items || []).map((r: { full_name: string; description?: string; html_url: string; stargazers_count: number; created_at: string }) => ({
      title: `${r.full_name} — ${r.description || ''}`.slice(0, 140), link: r.html_url, points: r.stargazers_count, at: Date.parse(r.created_at),
    }));
  } },
  reddit('technology', 0.8), reddit('science', 0.8), reddit('singularity', 0.8), // 레딧은 IP당 429가 잦아 3곳만, 실패해도 무시
  // 국내
  rss('GeekNews', 'https://news.hada.io/rss/news', 0.9),
  // 해외 매체(기술/AI/전자제품/과학)
  rss('The Verge', 'https://www.theverge.com/rss/index.xml', 0.8),
  rss('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 0.8),
  rss('Wired', 'https://www.wired.com/feed/rss', 0.8),
  rss('MIT Tech Review', 'https://www.technologyreview.com/feed/', 0.8),
  rss('IEEE Spectrum', 'https://spectrum.ieee.org/feeds/feed.rss', 0.7),
  rss('Engadget', 'https://www.engadget.com/rss.xml', 0.7),
  rss("Tom's Hardware", 'https://www.tomshardware.com/feeds/all', 0.7),
  rss('Notebookcheck', 'https://www.notebookcheck.net/News.152.100.html', 0.5),
  rss('Techmeme', 'https://www.techmeme.com/feed.xml', 0.8),
  rss('Product Hunt', 'https://www.producthunt.com/feed', 0.6),
  rss('OpenAI', 'https://openai.com/news/rss.xml', 0.7),
  rss('Hugging Face Blog', 'https://huggingface.co/blog/feed.xml', 0.6),
  rss('Nature', 'https://www.nature.com/nature.rss', 0.6),
  rss('Quanta', 'https://api.quantamagazine.org/feed/', 0.6),
  rss('Phys.org', 'https://phys.org/rss-feed/breaking/', 0.5),
  rss('ScienceAlert', 'https://www.sciencealert.com/feed', 0.6),
  rss('Live Science', 'https://www.livescience.com/feeds/all', 0.5),
  rss('Space.com', 'https://www.space.com/feeds/all', 0.5),
  rss('Interesting Engineering', 'https://interestingengineering.com/feed', 0.6),
  rss('NYT Tech', 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', 0.6),
];

const BORING = /\b(deal|deals|discount|coupon|sale|black friday|prime day|horoscope|trump|biden|election|lawsuit|layoffs?|stock|shares|earnings|quarterly|podcast|newsletter|obituary)\b|할인|쿠폰|세일|주가|실적/i;
const STOP = new Set(['with', 'from', 'that', 'this', 'about', 'after', 'will', 'your', 'have', 'what', 'into', 'more', 'than', 'their', 'could', 'says', 'new', 'how', 'why', 'the', 'and', 'for', 'are', 'but', 'not', 'you', 'its']);
const tokens = (t: string) => new Set((t.toLowerCase().match(/[a-z0-9][a-z0-9.+-]{3,}|[가-힣]{2,}/g) || []).filter(w => !STOP.has(w)));
const shared = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };
const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');

export async function collectCandidates(): Promise<{ list: Candidate[]; ok: string[]; failed: string[] }> {
  const results = await Promise.allSettled(SOURCES.map(async s => ({ s, items: await s.get() })));
  const now = Date.now();
  const ok: string[] = []; const failed: string[] = [];
  const all: Candidate[] = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value.items.length) { failed.push(SOURCES[i].name); return; }
    const { s, items } = r.value;
    ok.push(`${s.name}(${items.length})`);
    const maxPts = Math.max(1, ...items.map(x => x.points || 0));
    items.forEach((it, rank) => {
      if (BORING.test(it.title)) return;
      const ageH = it.at ? Math.max(0, (now - it.at) / 36e5) : 12;
      if (ageH > 96) return;
      const rankScore = 1 - rank / items.length;
      const base = it.points ? 0.4 * rankScore + 0.6 * Math.min(1, Math.log1p(it.points) / Math.log1p(maxPts)) : rankScore;
      all.push({ title: it.title, link: it.link, source: s.name, base: base * s.w, ageH, summary: it.summary || '', score: 0, mentions: 1 });
    });
  });

  // 같은 이슈가 여러 소스에 뜬 정도 — 핵심어 2개 이상 겹치면 같은 이슈로 간주
  const tk = all.map(c => tokens(c.title));
  for (let i = 0; i < all.length; i++) {
    const srcs = new Set<string>();
    for (let j = 0; j < all.length; j++) if (i !== j && all[j].source !== all[i].source && shared(tk[i], tk[j]) >= 2) srcs.add(all[j].source);
    all[i].mentions = 1 + srcs.size;
    all[i].score = all[i].base * (1 / (1 + all[i].ageH / 30)) * (1 + Math.min(srcs.size, 4) * 0.35);
  }

  // 같은 링크 중복 제거(높은 점수 유지)
  const best = new Map<string, Candidate>();
  for (const c of all.sort((a, b) => b.score - a.score)) if (!best.has(norm(c.link))) best.set(norm(c.link), c);
  return { list: [...best.values()], ok, failed };
}

/** 이미 쓴 원문/이슈 제외 (bossai_naver_tech_posts 공유 — 기존 전자제품 러너와도 겹치지 않게) */
export async function dropUsed(list: Candidate[]): Promise<Candidate[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('bossai_naver_tech_posts').select('source_url, source_title').order('created_at', { ascending: false }).limit(300);
  const usedUrl = new Set((data || []).map((r: { source_url: string }) => norm(r.source_url || '')));
  const usedTk = (data || []).slice(0, 80).map((r: { source_title: string }) => tokens(r.source_title || ''));
  return list.filter(c => !usedUrl.has(norm(c.link)) && !usedTk.some(t => shared(tokens(c.title), t) >= 3));
}
