import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
};

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') || '';
  if (!symbol) return NextResponse.json([]);

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=8&enableFuzzyQuery=false`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`news ${res.status}`);
    const data = await res.json() as {
      news?: Array<{
        uuid?: string;
        title?: string;
        publisher?: string;
        link?: string;
        providerPublishTime?: number;
        thumbnail?: { resolutions?: Array<{ url?: string }> };
      }>;
    };
    const news = (data.news || []).map(n => ({
      id: n.uuid || '',
      title: n.title || '',
      publisher: n.publisher || '',
      link: n.link || '',
      publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : '',
      thumbnail: n.thumbnail?.resolutions?.[0]?.url || null,
    }));
    return NextResponse.json(news, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
