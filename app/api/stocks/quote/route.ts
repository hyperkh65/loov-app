// KR stocks: Naver Finance polling API (실시간)
// US stocks: Finnhub (실시간)
// Indices / fallback: Yahoo Finance v8 chart meta
import { NextRequest, NextResponse } from 'next/server';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

const isKR = (s: string) => s.endsWith('.KS') || s.endsWith('.KQ');
const parseNum = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v.replace(/,/g, '')) || 0;
  return 0;
};

// ── 네이버 금융 실시간 (한국 주식) ─────────────────────────────────────────
async function fetchNaver(symbol: string) {
  const code = symbol.replace(/\.(KS|KQ)$/, '');
  const url = `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Referer': 'https://finance.naver.com/', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.error(`[naver] ${symbol} HTTP ${res.status}`); return null; }
    const data = await res.json() as Record<string, unknown>;
    const d = (data?.datas as Record<string, unknown>)?.[code] as Record<string, unknown> | undefined;
    if (!d) return null;

    const cur = parseNum(d.closePrice);
    const prevPriceInfo = d.compareToPreviousPrice as Record<string, unknown> | undefined;
    const code2 = String(prevPriceInfo?.compareToPreviousCode ?? '3');
    const sign = (code2 === '4' || code2 === '5') ? -1 : 1;
    const chgAmt = parseNum(d.compareToPreviousClosePrice) * sign;
    const chgPct = parseNum(prevPriceInfo?.fluctuationRatio) * sign;
    const prev = cur - chgAmt;

    return {
      symbol, shortName: undefined as string | undefined,
      regularMarketPrice: cur, regularMarketChange: chgAmt,
      regularMarketChangePercent: chgPct, previousClose: prev,
      regularMarketOpen: parseNum(d.openPrice) || undefined,
      regularMarketDayHigh: parseNum(d.highPrice) || undefined,
      regularMarketDayLow: parseNum(d.lowPrice) || undefined,
      regularMarketVolume: parseNum(d.accumulatedTradingVolume) || undefined,
      currency: 'KRW', marketState: 'REGULAR',
      regularMarketTime: undefined as number | undefined,
      fiftyTwoWeekHigh: undefined as number | undefined,
      fiftyTwoWeekLow: undefined as number | undefined,
      marketCap: null,
    };
  } catch (e) {
    console.error(`[naver] ${symbol}: ${(e as Error).message}`);
    return null;
  }
}

// ── Finnhub (미국 주식) ────────────────────────────────────────────────────
async function fetchFinnhub(symbol: string) {
  if (!FINNHUB_KEY) return null;
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.error(`[finnhub] ${symbol} HTTP ${res.status}`); return null; }
    const d = await res.json() as { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number };
    if (!d.c) return null;
    return {
      symbol, shortName: undefined as string | undefined,
      regularMarketPrice: d.c, regularMarketChange: d.d,
      regularMarketChangePercent: d.dp, previousClose: d.pc,
      regularMarketOpen: d.o || undefined,
      regularMarketDayHigh: d.h || undefined,
      regularMarketDayLow: d.l || undefined,
      regularMarketVolume: undefined as number | undefined,
      currency: 'USD', marketState: 'REGULAR',
      regularMarketTime: d.t || undefined,
      fiftyTwoWeekHigh: undefined as number | undefined,
      fiftyTwoWeekLow: undefined as number | undefined,
      marketCap: null,
    };
  } catch (e) {
    console.error(`[finnhub] ${symbol}: ${(e as Error).message}`);
    return null;
  }
}

// ── Yahoo Finance v8 chart meta (지수 + fallback) ─────────────────────────
async function fetchYahoo(symbol: string) {
  for (const host of ['query1', 'query2']) {
    const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=2m&range=2d&includePrePost=false`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json() as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } };
      const meta = data.chart?.result?.[0]?.meta;
      if (!meta) continue;
      const cur = (meta.regularMarketPrice as number) || 0;
      const prev = (meta.chartPreviousClose as number) || (meta.previousClose as number) || 0;
      return {
        symbol: (meta.symbol as string) || symbol,
        shortName: (meta.shortName as string) || symbol,
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
      console.error(`[yahoo] ${symbol} ${host}: ${(e as Error).message}`);
    }
  }
  return null;
}

async function fetchOne(symbol: string) {
  if (symbol.startsWith('^')) return fetchYahoo(symbol);
  if (isKR(symbol)) { const r = await fetchNaver(symbol); return r ?? fetchYahoo(symbol); }
  const r = await fetchFinnhub(symbol); return r ?? fetchYahoo(symbol);
}

export async function GET(req: NextRequest) {
  const symbolsRaw = req.nextUrl.searchParams.get('symbols') || '';
  const symbols = symbolsRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (!symbols.length) return NextResponse.json([]);

  const results = await Promise.allSettled(symbols.map(fetchOne));
  const data = results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchOne>>> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
