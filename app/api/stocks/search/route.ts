import { NextRequest, NextResponse } from 'next/server';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

interface Stock { symbol: string; name: string; exchange: string; market: string }

// ── 서버 메모리 캐시 (재시작 전까지 유지) ─────────────────────────────────
const cache: { kr: Stock[]; us: Stock[]; expiry: number } = { kr: [], us: [], expiry: 0 };

// ── 네이버 증시 시세 목록 스크래핑 (KOSPI/KOSDAQ 전체 상장 종목) ──────────
async function fetchNaverMarket(sosok: 0|1, exchange: string, suffix: 'KS'|'KQ'): Promise<Stock[]> {
  const stocks: Stock[] = [];
  const seen = new Set<string>();

  async function fetchPage(page: number): Promise<Stock[]> {
    const url = `https://finance.naver.com/sise/sise_market_sum.nhn?sosok=${sosok}&page=${page}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const buf = await res.arrayBuffer();
      const html = new TextDecoder('euc-kr').decode(buf);
      // 종목코드 + 이름 추출
      const items = [...html.matchAll(/code=(\d{6})[^>]*>([^<]+)<\/a>/g)];
      return items
        .filter(m => /^\d{6}$/.test(m[1]))
        .map(m => ({ symbol: `${m[1]}.${suffix}`, name: m[2].trim(), exchange, market: 'KR' }));
    } catch { return []; }
  }

  // 배치 10페이지씩 병렬 fetch, 빈 페이지 만나면 종료
  for (let start = 1; start <= 80; start += 10) {
    const pages = Array.from({ length: 10 }, (_, i) => start + i);
    const results = await Promise.all(pages.map(fetchPage));
    let anyData = false;
    for (const items of results) {
      for (const s of items) {
        if (!seen.has(s.symbol)) { seen.add(s.symbol); stocks.push(s); anyData = true; }
      }
    }
    if (!anyData) break;
  }

  console.log(`[naver] ${exchange}: ${stocks.length}종목 로드`);
  return stocks;
}

async function fetchKrxAll(): Promise<Stock[]> {
  const [kospi, kosdaq] = await Promise.all([
    fetchNaverMarket(0, 'KOSPI', 'KS'),
    fetchNaverMarket(1, 'KOSDAQ', 'KQ'),
  ]);
  return [...kospi, ...kosdaq];
}

// ── 미국 Finnhub 전체 목록 fetch ──────────────────────────────────────────
async function fetchUsAll(): Promise<Stock[]> {
  if (!FINNHUB_KEY) return [];
  const results: Stock[] = [];

  for (const [exchange, mic] of [['NYSE', 'XNYS'], ['NASDAQ', 'XNAS']] as const) {
    try {
      const url = `https://finnhub.io/api/v1/stock/symbol?exchange=US&mic=${mic}&token=${FINNHUB_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
      const data = await res.json() as Array<{ symbol: string; description: string; type: string }>;
      for (const s of data) {
        if (s.type === 'Common Stock' && s.symbol && !s.symbol.includes('.')) {
          results.push({ symbol: s.symbol, name: s.description || s.symbol, exchange, market: 'US' });
        }
      }
    } catch (e) {
      console.error(`[finnhub symbols] ${exchange} error:`, (e as Error).message);
    }
  }
  return results;
}

// ── 캐시 갱신 ─────────────────────────────────────────────────────────────
async function getAll(): Promise<{ kr: Stock[]; us: Stock[] }> {
  const now = Date.now();
  if (cache.expiry > now && (cache.kr.length || cache.us.length)) {
    return { kr: cache.kr, us: cache.us };
  }
  // 병렬 fetch
  const [kr, us] = await Promise.all([fetchKrxAll(), fetchUsAll()]);
  if (kr.length) cache.kr = kr;
  if (us.length) cache.us = us;
  cache.expiry = now + 12 * 60 * 60 * 1000; // 12시간 캐시
  return { kr: cache.kr, us: cache.us };
}

// ── 폴백: 주요 종목 (API 실패 시) ────────────────────────────────────────
const FALLBACK: Stock[] = [
  // KOSPI
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
  { symbol: '316140.KS', name: '우리금융지주', exchange: 'KOSPI', market: 'KR' },
  { symbol: '066570.KS', name: 'LG전자', exchange: 'KOSPI', market: 'KR' },
  { symbol: '035420.KS', name: 'NAVER', exchange: 'KOSPI', market: 'KR' },
  { symbol: '035720.KS', name: '카카오', exchange: 'KOSPI', market: 'KR' },
  { symbol: '012330.KS', name: '현대모비스', exchange: 'KOSPI', market: 'KR' },
  { symbol: '329180.KS', name: 'HD현대중공업', exchange: 'KOSPI', market: 'KR' },
  { symbol: '012450.KS', name: '한화에어로스페이스', exchange: 'KOSPI', market: 'KR' },
  { symbol: '352820.KS', name: '하이브', exchange: 'KOSPI', market: 'KR' },
  { symbol: '003490.KS', name: '대한항공', exchange: 'KOSPI', market: 'KR' },
  // KOSDAQ
  { symbol: '247540.KQ', name: '에코프로비엠', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '086520.KQ', name: '에코프로', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '091990.KQ', name: '셀트리온헬스케어', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '196170.KQ', name: '알테오젠', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '028300.KQ', name: 'HLB', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '041510.KQ', name: 'SM엔터테인먼트', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '035900.KQ', name: 'JYP엔터테인먼트', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '122870.KQ', name: '와이지엔터테인먼트', exchange: 'KOSDAQ', market: 'KR' },
  // US
  { symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'GOOGL', name: 'Alphabet', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'AMZN', name: 'Amazon', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'META', name: 'Meta', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'TSLA', name: 'Tesla', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'PLTR', name: 'Palantir', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'AMD', name: 'AMD', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'COIN', name: 'Coinbase', exchange: 'NASDAQ', market: 'US' },
];

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();

  // ── 검색어 있을 때: Yahoo Finance 실시간 검색 ────────────────────────
  if (q) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&enableFuzzyQuery=true&region=KR&lang=ko-KR`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Accept-Language': 'ko-KR,ko;q=0.9' },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json() as { quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; exchDisp?: string; quoteType?: string }> };
        const quotes = (data.quotes || [])
          .filter(q => q.symbol && !['CURRENCY','CRYPTOCURRENCY','INDEX'].includes(q.quoteType || ''))
          .map(q => ({
            symbol: q.symbol!,
            name: q.shortname || q.longname || q.symbol!,
            exchange: q.exchDisp || '',
            market: q.symbol!.endsWith('.KS') || q.symbol!.endsWith('.KQ') ? 'KR' : 'US',
          }));
        if (quotes.length) return NextResponse.json(quotes);
      }
    } catch { /* fall through */ }

    // Yahoo 실패 시 캐시에서 텍스트 검색
    const { kr, us } = await getAll();
    const all = [...kr, ...us, ...FALLBACK];
    const lq = q.toLowerCase();
    const seen = new Set<string>();
    const filtered = all.filter(s => {
      if (seen.has(s.symbol)) return false;
      seen.add(s.symbol);
      return s.symbol.toLowerCase().includes(lq) || s.name.toLowerCase().includes(lq);
    }).slice(0, 30);
    return NextResponse.json(filtered);
  }

  // ── 검색어 없을 때: 전체 목록 반환 ─────────────────────────────────────
  const { kr, us } = await getAll();

  // KRX/Finnhub 성공 시
  if (kr.length || us.length) {
    return NextResponse.json([...kr, ...us], {
      headers: { 'Cache-Control': 'public, s-maxage=3600' },
    });
  }

  // 완전 실패 시 폴백
  return NextResponse.json(FALLBACK);
}
