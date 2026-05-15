// v7 quote API가 차단됨 → v8 chart API의 meta 객체로 현재가 추출 (동일 엔드포인트, 이미 작동 확인됨)
import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  'Referer': 'https://finance.yahoo.com/',
};

async function fetchOneMeta(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json() as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } };
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const cur = (meta.regularMarketPrice as number) || 0;
  const prev = (meta.chartPreviousClose as number) || (meta.previousClose as number) || 0;
  return {
    symbol: (meta.symbol as string) || symbol,
    shortName: (meta.shortName as string) || symbol,
    longName: (meta.longName as string) || undefined,
    regularMarketPrice: cur,
    regularMarketChange: cur - prev,
    regularMarketChangePercent: prev ? ((cur - prev) / prev) * 100 : 0,
    previousClose: prev,
    regularMarketOpen: meta.regularMarketOpen as number | undefined,
    regularMarketDayHigh: meta.regularMarketDayHigh as number | undefined,
    regularMarketDayLow: meta.regularMarketDayLow as number | undefined,
    regularMarketVolume: meta.regularMarketVolume as number | undefined,
    currency: meta.currency as string | undefined,
    marketState: (meta.marketState as string) || 'CLOSED',
    regularMarketTime: meta.regularMarketTime as number | undefined,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh as number | undefined,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow as number | undefined,
    marketCap: null,
  };
}

export async function GET(req: NextRequest) {
  const symbolsRaw = req.nextUrl.searchParams.get('symbols') || '';
  const symbols = symbolsRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (!symbols.length) return NextResponse.json([]);

  const results = await Promise.allSettled(symbols.map(fetchOneMeta));
  const data = results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchOneMeta>>> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
