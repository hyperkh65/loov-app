import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  if (!q || q.length < 1) return NextResponse.json([]);

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false&region=KR`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`search ${res.status}`);
    const data = await res.json() as {
      quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; exchDisp?: string; typeDisp?: string; quoteType?: string }>;
    };
    const quotes = (data.quotes || [])
      .filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
      .map(q => ({
        symbol: q.symbol || '',
        name: q.shortname || q.longname || q.symbol || '',
        exchange: q.exchDisp || '',
        type: q.typeDisp || q.quoteType || '',
        market: (q.symbol || '').endsWith('.KS') || (q.symbol || '').endsWith('.KQ') ? 'KR' : 'US',
      }))
      .slice(0, 8);
    return NextResponse.json(quotes);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
