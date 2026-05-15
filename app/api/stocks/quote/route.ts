import { NextRequest, NextResponse } from 'next/server';

const YF_QUOTE = 'https://query1.finance.yahoo.com/v7/finance/quote';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get('symbols') || '';
  if (!symbols) return NextResponse.json({ error: 'symbols required' }, { status: 400 });

  try {
    const url = `${YF_QUOTE}?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,previousClose,shortName,longName,currency,marketState,regularMarketTime,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Yahoo Finance ${res.status}`);
    const data = await res.json() as {
      quoteResponse?: { result?: Array<Record<string, unknown>> };
    };
    const result = data.quoteResponse?.result || [];
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
