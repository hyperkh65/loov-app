import { NextRequest, NextResponse } from 'next/server';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

interface Stock { symbol: string; name: string; exchange: string; market: string }

// ── 서버 메모리 캐시 (재시작 전까지 유지) ─────────────────────────────────
const cache: { kr: Stock[]; us: Stock[]; expiry: number } = { kr: [], us: [], expiry: 0 };

// ── 최근 영업일 목록 (주말 제외, 최대 5개) ───────────────────────────────
function recentWeekdays(n = 5): string[] {
  const dates: string[] = [];
  const d = new Date();
  while (dates.length < n) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`);
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

// ── 한국 KRX 전체 목록 fetch ──────────────────────────────────────────────
async function fetchKrxAll(): Promise<Stock[]> {
  const results: Stock[] = [];

  for (const [mktId, exchange] of [['STK', 'KOSPI'], ['KSQ', 'KOSDAQ']] as const) {
    let fetched = false;
    for (const trdDd of recentWeekdays(5)) {
      try {
        const body = new URLSearchParams({
          bld: 'dbms/MDC/STAT/standard/MDCSTAT01901',
          locale: 'ko_KR',
          mktId,
          trdDd,
          share: '1',
          money: '1',
          csvxls_isNo: 'false',
        });
        const res = await fetch('https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': 'https://data.krx.co.kr/',
            'Accept': 'application/json',
          },
          body: body.toString(),
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) continue;
        const data = await res.json() as { OutBlock_1?: Array<{ ISU_SRT_CD: string; ISU_ABBRV: string }> };
        const rows = data.OutBlock_1 || [];
        if (!rows.length) continue; // 휴장일이면 빈 배열 → 이전 날 재시도
        for (const r of rows) {
          if (r.ISU_SRT_CD && r.ISU_ABBRV) {
            results.push({
              symbol: `${r.ISU_SRT_CD}.${mktId === 'STK' ? 'KS' : 'KQ'}`,
              name: r.ISU_ABBRV.trim(),
              exchange,
              market: 'KR',
            });
          }
        }
        fetched = true;
        break;
      } catch (e) {
        console.error(`[krx] ${mktId} ${trdDd}:`, (e as Error).message);
      }
    }
    if (!fetched) console.error(`[krx] ${mktId}: 모든 날짜 실패`);
  }
  return results;
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
