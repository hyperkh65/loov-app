// chart route와 동일한 헤더 사용 (다른 헤더 사용 시 NAS에서 차단됨)
import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
};

async function fetchOneMeta(symbol: string) {
  // query1 실패 시 query2로 fallback
  for (const host of ['query1', 'query2']) {
    const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=2m&range=2d&includePrePost=false`;
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        console.error(`[quote] ${symbol} ${host} HTTP ${res.status}`);
        continue;
      }
      const data = await res.json() as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } };
      const meta = data.chart?.result?.[0]?.meta;
      if (!meta) continue;

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
    } catch (e) {
      console.error(`[quote] ${symbol} ${host} error: ${(e as Error).message}`);
    }
  }
  return null;
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
