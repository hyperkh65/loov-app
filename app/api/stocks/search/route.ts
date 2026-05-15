import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
};

// 인기 종목 (검색어 없을 때 또는 API 실패 시 폴백)
const POPULAR = [
  { symbol: '005930.KS', name: '삼성전자', exchange: 'KRX', market: 'KR' },
  { symbol: '000660.KS', name: 'SK하이닉스', exchange: 'KRX', market: 'KR' },
  { symbol: '035420.KS', name: 'NAVER', exchange: 'KRX', market: 'KR' },
  { symbol: '035720.KS', name: '카카오', exchange: 'KRX', market: 'KR' },
  { symbol: '373220.KS', name: 'LG에너지솔루션', exchange: 'KRX', market: 'KR' },
  { symbol: '005380.KS', name: '현대차', exchange: 'KRX', market: 'KR' },
  { symbol: '068270.KS', name: '셀트리온', exchange: 'KRX', market: 'KR' },
  { symbol: '207940.KS', name: '삼성바이오로직스', exchange: 'KRX', market: 'KR' },
  { symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'AMZN', name: 'Amazon', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'TSLA', name: 'Tesla', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'META', name: 'Meta', exchange: 'NASDAQ', market: 'US' },
];

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';

  // 검색어 없으면 인기 종목 반환
  if (!q.trim()) return NextResponse.json(POPULAR);

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&enableFuzzyQuery=true&region=KR&lang=ko-KR`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`${res.status}`);

    const data = await res.json() as {
      quotes?: Array<{
        symbol?: string; shortname?: string; longname?: string;
        exchDisp?: string; typeDisp?: string; quoteType?: string;
      }>;
    };

    const quotes = (data.quotes || [])
      .filter(q => q.symbol && q.quoteType !== 'CURRENCY' && q.quoteType !== 'CRYPTOCURRENCY' && q.quoteType !== 'INDEX')
      .map(q => ({
        symbol: q.symbol || '',
        name: q.shortname || q.longname || q.symbol || '',
        exchange: q.exchDisp || '',
        type: q.typeDisp || '',
        market: (q.symbol || '').endsWith('.KS') || (q.symbol || '').endsWith('.KQ') ? 'KR' : 'US',
      }))
      .slice(0, 8);

    // 결과 없으면 인기 종목에서 필터
    if (quotes.length === 0) {
      const lq = q.toLowerCase();
      return NextResponse.json(POPULAR.filter(p =>
        p.symbol.toLowerCase().includes(lq) || p.name.toLowerCase().includes(lq)
      ));
    }

    return NextResponse.json(quotes);
  } catch {
    // API 실패 시 인기 종목에서 필터
    const lq = q.toLowerCase();
    return NextResponse.json(POPULAR.filter(p =>
      p.symbol.toLowerCase().includes(lq) || p.name.toLowerCase().includes(lq)
    ));
  }
}
