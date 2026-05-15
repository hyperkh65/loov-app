import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
};

const POPULAR = [
  // ── 국내 KOSPI ──────────────────────────────────────────────────────────
  { symbol: '005930.KS', name: '삼성전자', exchange: 'KOSPI', market: 'KR' },
  { symbol: '000660.KS', name: 'SK하이닉스', exchange: 'KOSPI', market: 'KR' },
  { symbol: '373220.KS', name: 'LG에너지솔루션', exchange: 'KOSPI', market: 'KR' },
  { symbol: '207940.KS', name: '삼성바이오로직스', exchange: 'KOSPI', market: 'KR' },
  { symbol: '005380.KS', name: '현대차', exchange: 'KOSPI', market: 'KR' },
  { symbol: '000270.KS', name: '기아', exchange: 'KOSPI', market: 'KR' },
  { symbol: '005490.KS', name: 'POSCO홀딩스', exchange: 'KOSPI', market: 'KR' },
  { symbol: '051910.KS', name: 'LG화학', exchange: 'KOSPI', market: 'KR' },
  { symbol: '006400.KS', name: '삼성SDI', exchange: 'KOSPI', market: 'KR' },
  { symbol: '068270.KS', name: '셀트리온', exchange: 'KOSPI', market: 'KR' },
  { symbol: '105560.KS', name: 'KB금융', exchange: 'KOSPI', market: 'KR' },
  { symbol: '055550.KS', name: '신한지주', exchange: 'KOSPI', market: 'KR' },
  { symbol: '086790.KS', name: '하나금융지주', exchange: 'KOSPI', market: 'KR' },
  { symbol: '066570.KS', name: 'LG전자', exchange: 'KOSPI', market: 'KR' },
  { symbol: '035420.KS', name: 'NAVER', exchange: 'KOSPI', market: 'KR' },
  { symbol: '035720.KS', name: '카카오', exchange: 'KOSPI', market: 'KR' },
  { symbol: '012330.KS', name: '현대모비스', exchange: 'KOSPI', market: 'KR' },
  { symbol: '017670.KS', name: 'SK텔레콤', exchange: 'KOSPI', market: 'KR' },
  { symbol: '030200.KS', name: 'KT', exchange: 'KOSPI', market: 'KR' },
  { symbol: '096770.KS', name: 'SK이노베이션', exchange: 'KOSPI', market: 'KR' },
  { symbol: '012450.KS', name: '한화에어로스페이스', exchange: 'KOSPI', market: 'KR' },
  { symbol: '329180.KS', name: 'HD현대중공업', exchange: 'KOSPI', market: 'KR' },
  { symbol: '003550.KS', name: 'LG', exchange: 'KOSPI', market: 'KR' },
  { symbol: '028260.KS', name: '삼성물산', exchange: 'KOSPI', market: 'KR' },
  { symbol: '009150.KS', name: '삼성전기', exchange: 'KOSPI', market: 'KR' },
  { symbol: '000810.KS', name: '삼성화재', exchange: 'KOSPI', market: 'KR' },
  { symbol: '015760.KS', name: '한국전력', exchange: 'KOSPI', market: 'KR' },
  { symbol: '032830.KS', name: '삼성생명', exchange: 'KOSPI', market: 'KR' },
  { symbol: '036570.KS', name: '엔씨소프트', exchange: 'KOSPI', market: 'KR' },
  { symbol: '251270.KS', name: '넷마블', exchange: 'KOSPI', market: 'KR' },
  // ── 국내 KOSDAQ ─────────────────────────────────────────────────────────
  { symbol: '247540.KQ', name: '에코프로비엠', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '091990.KQ', name: '셀트리온헬스케어', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '263750.KQ', name: '펄어비스', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '293490.KQ', name: '카카오게임즈', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '058470.KQ', name: '리노공업', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '145020.KQ', name: '휴젤', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '357780.KQ', name: '솔브레인', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '086900.KQ', name: '메디톡스', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '039030.KQ', name: '이오테크닉스', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '041510.KQ', name: 'SM엔터테인먼트', exchange: 'KOSDAQ', market: 'KR' },
  // ── 미국 ────────────────────────────────────────────────────────────────
  { symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'AMZN', name: 'Amazon', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'TSLA', name: 'Tesla', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'META', name: 'Meta', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'AVGO', name: 'Broadcom', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'LLY', name: 'Eli Lilly', exchange: 'NYSE', market: 'US' },
  { symbol: 'JPM', name: 'JPMorgan Chase', exchange: 'NYSE', market: 'US' },
  { symbol: 'V', name: 'Visa', exchange: 'NYSE', market: 'US' },
  { symbol: 'WMT', name: 'Walmart', exchange: 'NYSE', market: 'US' },
  { symbol: 'XOM', name: 'ExxonMobil', exchange: 'NYSE', market: 'US' },
  { symbol: 'NFLX', name: 'Netflix', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'AMD', name: 'AMD', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'QCOM', name: 'Qualcomm', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'TSM', name: 'Taiwan Semiconductor', exchange: 'NYSE', market: 'US' },
  { symbol: 'PLTR', name: 'Palantir', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'COIN', name: 'Coinbase', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'MU', name: 'Micron Technology', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'INTC', name: 'Intel', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'ORCL', name: 'Oracle', exchange: 'NYSE', market: 'US' },
  { symbol: 'CRM', name: 'Salesforce', exchange: 'NYSE', market: 'US' },
  { symbol: 'UBER', name: 'Uber', exchange: 'NYSE', market: 'US' },
  { symbol: 'BA', name: 'Boeing', exchange: 'NYSE', market: 'US' },
  { symbol: 'DIS', name: 'Disney', exchange: 'NYSE', market: 'US' },
  { symbol: 'PYPL', name: 'PayPal', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'SPOT', name: 'Spotify', exchange: 'NYSE', market: 'US' },
  { symbol: 'HOOD', name: 'Robinhood', exchange: 'NASDAQ', market: 'US' },
];

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';

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
        market: (q.symbol || '').endsWith('.KS') || (q.symbol || '').endsWith('.KQ') ? 'KR' : 'US',
      }))
      .slice(0, 10);

    if (quotes.length === 0) {
      const lq = q.toLowerCase();
      return NextResponse.json(POPULAR.filter(p =>
        p.symbol.toLowerCase().includes(lq) || p.name.toLowerCase().includes(lq)
      ));
    }

    return NextResponse.json(quotes);
  } catch {
    const lq = q.toLowerCase();
    return NextResponse.json(POPULAR.filter(p =>
      p.symbol.toLowerCase().includes(lq) || p.name.toLowerCase().includes(lq)
    ));
  }
}
