import { NextRequest, NextResponse } from 'next/server';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function parseRss(xml: string) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return items.map((m, idx) => {
    const c = m[1];
    const title = (
      c.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ??
      c.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''
    ).trim();
    const link = (
      c.match(/<link>([\s\S]*?)<\/link>/)?.[1] ??
      c.match(/href="([^"]+)"/)?.[1] ?? ''
    ).trim();
    const pubDate = (c.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '').trim();
    const source = (c.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? '').trim();
    return {
      id: link || String(idx),
      title: title
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
      publisher: source,
      link,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : '',
      thumbnail: null as string | null,
    };
  }).filter(n => n.title && n.link);
}

async function fetchGoogleNews(query: string, isKR: boolean) {
  const [hl, gl, ceid] = isKR ? ['ko', 'KR', 'KR:ko'] : ['en', 'US', 'US:en'];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google News RSS ${res.status}`);
  return parseRss(await res.text());
}

async function fetchYahooRss(symbol: string) {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Yahoo RSS ${res.status}`);
  return parseRss(await res.text());
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') || '';
  const name = req.nextUrl.searchParams.get('name') || '';
  if (!symbol) return NextResponse.json([]);

  const isKorean = symbol.endsWith('.KS') || symbol.endsWith('.KQ');
  const searchTerm = name || symbol.replace(/\.(KS|KQ)$/, '');
  const query = isKorean ? `${searchTerm} 주식` : `${searchTerm} stock`;

  const results = await Promise.allSettled([
    fetchGoogleNews(query, isKorean),
    isKorean ? Promise.resolve([]) : fetchYahooRss(symbol),
  ]);

  const news: ReturnType<typeof parseRss> = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const item of r.value) {
        if (!seen.has(item.id)) { seen.add(item.id); news.push(item); }
      }
    }
  }

  if (!news.length) {
    const err = results.find(r => r.status === 'rejected');
    if (err) return NextResponse.json({ error: (err as PromiseRejectedResult).reason?.message }, { status: 500 });
  }

  return NextResponse.json(news.slice(0, 12), {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
