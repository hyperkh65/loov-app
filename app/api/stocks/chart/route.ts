import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
};

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') || '';
  const interval = req.nextUrl.searchParams.get('interval') || '1d';
  const range = req.nextUrl.searchParams.get('range') || '3mo';
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Yahoo Finance chart ${res.status}`);
    const data = await res.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: (number | null)[];
              high?: (number | null)[];
              low?: (number | null)[];
              close?: (number | null)[];
              volume?: (number | null)[];
            }>;
          };
        }>;
        error?: { message?: string };
      };
    };

    if (data.chart?.error) throw new Error(data.chart.error.message || 'chart error');
    const r = data.chart?.result?.[0];
    if (!r) throw new Error('no chart data');

    const timestamps = r.timestamp || [];
    const q = r.indicators?.quote?.[0] || {};
    const candles = timestamps.map((t, i) => ({
      time: t,
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close: q.close?.[i] ?? null,
      volume: q.volume?.[i] ?? null,
    })).filter(c => c.close !== null);

    return NextResponse.json(candles, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
