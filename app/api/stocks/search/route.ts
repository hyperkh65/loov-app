import { NextRequest, NextResponse } from 'next/server';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
};

const POPULAR = [
  // ════════════════════════════════════════════════
  // 🇰🇷 KOSPI
  // ════════════════════════════════════════════════
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
  { symbol: '003550.KS', name: 'LG', exchange: 'KOSPI', market: 'KR' },
  { symbol: '035420.KS', name: 'NAVER', exchange: 'KOSPI', market: 'KR' },
  { symbol: '035720.KS', name: '카카오', exchange: 'KOSPI', market: 'KR' },
  { symbol: '377300.KS', name: '카카오페이', exchange: 'KOSPI', market: 'KR' },
  { symbol: '293490.KS', name: '카카오게임즈', exchange: 'KOSPI', market: 'KR' },
  { symbol: '012330.KS', name: '현대모비스', exchange: 'KOSPI', market: 'KR' },
  { symbol: '267250.KS', name: 'HD현대', exchange: 'KOSPI', market: 'KR' },
  { symbol: '329180.KS', name: 'HD현대중공업', exchange: 'KOSPI', market: 'KR' },
  { symbol: '042660.KS', name: '한화오션', exchange: 'KOSPI', market: 'KR' },
  { symbol: '010140.KS', name: '삼성중공업', exchange: 'KOSPI', market: 'KR' },
  { symbol: '017670.KS', name: 'SK텔레콤', exchange: 'KOSPI', market: 'KR' },
  { symbol: '030200.KS', name: 'KT', exchange: 'KOSPI', market: 'KR' },
  { symbol: '096770.KS', name: 'SK이노베이션', exchange: 'KOSPI', market: 'KR' },
  { symbol: '034730.KS', name: 'SK', exchange: 'KOSPI', market: 'KR' },
  { symbol: '012450.KS', name: '한화에어로스페이스', exchange: 'KOSPI', market: 'KR' },
  { symbol: '047810.KS', name: '한국항공우주', exchange: 'KOSPI', market: 'KR' },
  { symbol: '028260.KS', name: '삼성물산', exchange: 'KOSPI', market: 'KR' },
  { symbol: '009150.KS', name: '삼성전기', exchange: 'KOSPI', market: 'KR' },
  { symbol: '018260.KS', name: '삼성SDS', exchange: 'KOSPI', market: 'KR' },
  { symbol: '000810.KS', name: '삼성화재', exchange: 'KOSPI', market: 'KR' },
  { symbol: '032830.KS', name: '삼성생명', exchange: 'KOSPI', market: 'KR' },
  { symbol: '028050.KS', name: '삼성엔지니어링', exchange: 'KOSPI', market: 'KR' },
  { symbol: '015760.KS', name: '한국전력', exchange: 'KOSPI', market: 'KR' },
  { symbol: '036570.KS', name: '엔씨소프트', exchange: 'KOSPI', market: 'KR' },
  { symbol: '251270.KS', name: '넷마블', exchange: 'KOSPI', market: 'KR' },
  { symbol: '352820.KS', name: '하이브', exchange: 'KOSPI', market: 'KR' },
  { symbol: '003490.KS', name: '대한항공', exchange: 'KOSPI', market: 'KR' },
  { symbol: '020560.KS', name: '아시아나항공', exchange: 'KOSPI', market: 'KR' },
  { symbol: '010950.KS', name: 'S-Oil', exchange: 'KOSPI', market: 'KR' },
  { symbol: '011170.KS', name: '롯데케미칼', exchange: 'KOSPI', market: 'KR' },
  { symbol: '033780.KS', name: 'KT&G', exchange: 'KOSPI', market: 'KR' },
  { symbol: '009830.KS', name: '한화솔루션', exchange: 'KOSPI', market: 'KR' },
  { symbol: '010130.KS', name: '고려아연', exchange: 'KOSPI', market: 'KR' },
  { symbol: '000100.KS', name: '유한양행', exchange: 'KOSPI', market: 'KR' },
  { symbol: '139480.KS', name: '이마트', exchange: 'KOSPI', market: 'KR' },
  { symbol: '004020.KS', name: '현대제철', exchange: 'KOSPI', market: 'KR' },
  { symbol: '000720.KS', name: '현대건설', exchange: 'KOSPI', market: 'KR' },
  { symbol: '006360.KS', name: 'GS건설', exchange: 'KOSPI', market: 'KR' },
  { symbol: '086280.KS', name: '현대글로비스', exchange: 'KOSPI', market: 'KR' },
  { symbol: '004170.KS', name: '신세계', exchange: 'KOSPI', market: 'KR' },
  { symbol: '023530.KS', name: '롯데쇼핑', exchange: 'KOSPI', market: 'KR' },
  { symbol: '001040.KS', name: 'CJ', exchange: 'KOSPI', market: 'KR' },
  { symbol: '097950.KS', name: 'CJ제일제당', exchange: 'KOSPI', market: 'KR' },
  { symbol: '003230.KS', name: '삼양식품', exchange: 'KOSPI', market: 'KR' },
  { symbol: '011780.KS', name: '금호석유', exchange: 'KOSPI', market: 'KR' },
  { symbol: '000240.KS', name: '한국타이어앤테크놀로지', exchange: 'KOSPI', market: 'KR' },
  { symbol: '051600.KS', name: '한전기술', exchange: 'KOSPI', market: 'KR' },
  { symbol: '069960.KS', name: '현대백화점', exchange: 'KOSPI', market: 'KR' },
  { symbol: '030000.KS', name: '제일기획', exchange: 'KOSPI', market: 'KR' },
  { symbol: '011790.KS', name: 'SKC', exchange: 'KOSPI', market: 'KR' },

  // ════════════════════════════════════════════════
  // 🇰🇷 KOSDAQ
  // ════════════════════════════════════════════════
  { symbol: '247540.KQ', name: '에코프로비엠', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '086520.KQ', name: '에코프로', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '091990.KQ', name: '셀트리온헬스케어', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '068760.KQ', name: '셀트리온제약', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '263750.KQ', name: '펄어비스', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '058470.KQ', name: '리노공업', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '145020.KQ', name: '휴젤', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '357780.KQ', name: '솔브레인', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '086900.KQ', name: '메디톡스', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '039030.KQ', name: '이오테크닉스', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '041510.KQ', name: 'SM엔터테인먼트', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '035900.KQ', name: 'JYP엔터테인먼트', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '122870.KQ', name: '와이지엔터테인먼트', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '196170.KQ', name: '알테오젠', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '028300.KQ', name: 'HLB', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '053800.KQ', name: '안랩', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '112040.KQ', name: '위메이드', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '066970.KQ', name: '엘앤에프', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '240810.KQ', name: '원익IPS', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '214150.KQ', name: '클래시스', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '078340.KQ', name: '컴투스', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '095660.KQ', name: '네오위즈', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '403870.KQ', name: 'HPSP', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '140910.KQ', name: '에스티팜', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '950160.KQ', name: '코오롱티슈진', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '108490.KQ', name: '로보티즈', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '036800.KQ', name: '나스미디어', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '215600.KQ', name: '신라젠', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '041960.KQ', name: '코미팜', exchange: 'KOSDAQ', market: 'KR' },
  { symbol: '900290.KQ', name: 'GRT', exchange: 'KOSDAQ', market: 'KR' },

  // ════════════════════════════════════════════════
  // 🇺🇸 미국 — 빅테크 / 반도체
  // ════════════════════════════════════════════════
  { symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'AMZN', name: 'Amazon', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'META', name: 'Meta', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'TSLA', name: 'Tesla', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'AVGO', name: 'Broadcom', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'AMD', name: 'AMD', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'QCOM', name: 'Qualcomm', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'INTC', name: 'Intel', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'MU', name: 'Micron Technology', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'TXN', name: 'Texas Instruments', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'AMAT', name: 'Applied Materials', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'LRCX', name: 'Lam Research', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'KLAC', name: 'KLA Corporation', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'ASML', name: 'ASML Holding', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'TSM', name: 'Taiwan Semiconductor', exchange: 'NYSE', market: 'US' },
  { symbol: 'MRVL', name: 'Marvell Technology', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'ADI', name: 'Analog Devices', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'ARM', name: 'ARM Holdings', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'SMCI', name: 'Super Micro Computer', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'ON', name: 'ON Semiconductor', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'MPWR', name: 'Monolithic Power', exchange: 'NASDAQ', market: 'US' },
  // ── 소프트웨어 / 클라우드 ─────────────────────────────
  { symbol: 'ORCL', name: 'Oracle', exchange: 'NYSE', market: 'US' },
  { symbol: 'ADBE', name: 'Adobe', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'CRM', name: 'Salesforce', exchange: 'NYSE', market: 'US' },
  { symbol: 'INTU', name: 'Intuit', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'NOW', name: 'ServiceNow', exchange: 'NYSE', market: 'US' },
  { symbol: 'PANW', name: 'Palo Alto Networks', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'CRWD', name: 'CrowdStrike', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'SNPS', name: 'Synopsys', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'CDNS', name: 'Cadence Design', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'DDOG', name: 'Datadog', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'ZS', name: 'Zscaler', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'MDB', name: 'MongoDB', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'NET', name: 'Cloudflare', exchange: 'NYSE', market: 'US' },
  { symbol: 'SNOW', name: 'Snowflake', exchange: 'NYSE', market: 'US' },
  { symbol: 'TEAM', name: 'Atlassian', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'WDAY', name: 'Workday', exchange: 'NASDAQ', market: 'US' },
  // ── AI / 미래기술 ─────────────────────────────────────
  { symbol: 'PLTR', name: 'Palantir', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'MSTR', name: 'MicroStrategy', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'SOUN', name: 'SoundHound AI', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'IONQ', name: 'IonQ', exchange: 'NYSE', market: 'US' },
  { symbol: 'RGTI', name: 'Rigetti Computing', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'BBAI', name: 'BigBear.ai', exchange: 'NYSE', market: 'US' },
  // ── 금융 ─────────────────────────────────────────────
  { symbol: 'JPM', name: 'JPMorgan Chase', exchange: 'NYSE', market: 'US' },
  { symbol: 'BAC', name: 'Bank of America', exchange: 'NYSE', market: 'US' },
  { symbol: 'WFC', name: 'Wells Fargo', exchange: 'NYSE', market: 'US' },
  { symbol: 'GS', name: 'Goldman Sachs', exchange: 'NYSE', market: 'US' },
  { symbol: 'MS', name: 'Morgan Stanley', exchange: 'NYSE', market: 'US' },
  { symbol: 'C', name: 'Citigroup', exchange: 'NYSE', market: 'US' },
  { symbol: 'V', name: 'Visa', exchange: 'NYSE', market: 'US' },
  { symbol: 'MA', name: 'Mastercard', exchange: 'NYSE', market: 'US' },
  { symbol: 'AXP', name: 'American Express', exchange: 'NYSE', market: 'US' },
  { symbol: 'BLK', name: 'BlackRock', exchange: 'NYSE', market: 'US' },
  { symbol: 'SCHW', name: 'Charles Schwab', exchange: 'NYSE', market: 'US' },
  { symbol: 'PYPL', name: 'PayPal', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'COIN', name: 'Coinbase', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'HOOD', name: 'Robinhood', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'SQ', name: 'Block (Square)', exchange: 'NYSE', market: 'US' },
  // ── 헬스케어 ─────────────────────────────────────────
  { symbol: 'LLY', name: 'Eli Lilly', exchange: 'NYSE', market: 'US' },
  { symbol: 'UNH', name: 'UnitedHealth', exchange: 'NYSE', market: 'US' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYSE', market: 'US' },
  { symbol: 'PFE', name: 'Pfizer', exchange: 'NYSE', market: 'US' },
  { symbol: 'ABBV', name: 'AbbVie', exchange: 'NYSE', market: 'US' },
  { symbol: 'MRK', name: 'Merck', exchange: 'NYSE', market: 'US' },
  { symbol: 'AMGN', name: 'Amgen', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'GILD', name: 'Gilead Sciences', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'VRTX', name: 'Vertex Pharmaceuticals', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'ISRG', name: 'Intuitive Surgical', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'REGN', name: 'Regeneron', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb', exchange: 'NYSE', market: 'US' },
  { symbol: 'MRNA', name: 'Moderna', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'DXCM', name: 'DexCom', exchange: 'NASDAQ', market: 'US' },
  // ── 소비재 / 유통 ─────────────────────────────────────
  { symbol: 'NFLX', name: 'Netflix', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'DIS', name: 'Disney', exchange: 'NYSE', market: 'US' },
  { symbol: 'SPOT', name: 'Spotify', exchange: 'NYSE', market: 'US' },
  { symbol: 'RBLX', name: 'Roblox', exchange: 'NYSE', market: 'US' },
  { symbol: 'SNAP', name: 'Snap', exchange: 'NYSE', market: 'US' },
  { symbol: 'PINS', name: 'Pinterest', exchange: 'NYSE', market: 'US' },
  { symbol: 'UBER', name: 'Uber', exchange: 'NYSE', market: 'US' },
  { symbol: 'ABNB', name: 'Airbnb', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'LYFT', name: 'Lyft', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'WMT', name: 'Walmart', exchange: 'NYSE', market: 'US' },
  { symbol: 'COST', name: 'Costco', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'HD', name: 'Home Depot', exchange: 'NYSE', market: 'US' },
  { symbol: 'TGT', name: 'Target', exchange: 'NYSE', market: 'US' },
  { symbol: 'NKE', name: 'Nike', exchange: 'NYSE', market: 'US' },
  { symbol: 'MCD', name: "McDonald's", exchange: 'NYSE', market: 'US' },
  { symbol: 'SBUX', name: 'Starbucks', exchange: 'NASDAQ', market: 'US' },
  // ── 산업재 / 방산 ─────────────────────────────────────
  { symbol: 'BA', name: 'Boeing', exchange: 'NYSE', market: 'US' },
  { symbol: 'GE', name: 'GE Aerospace', exchange: 'NYSE', market: 'US' },
  { symbol: 'HON', name: 'Honeywell', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'RTX', name: 'RTX Corporation', exchange: 'NYSE', market: 'US' },
  { symbol: 'LMT', name: 'Lockheed Martin', exchange: 'NYSE', market: 'US' },
  { symbol: 'NOC', name: 'Northrop Grumman', exchange: 'NYSE', market: 'US' },
  { symbol: 'DE', name: 'Deere & Company', exchange: 'NYSE', market: 'US' },
  { symbol: 'CAT', name: 'Caterpillar', exchange: 'NYSE', market: 'US' },
  // ── 에너지 ────────────────────────────────────────────
  { symbol: 'XOM', name: 'ExxonMobil', exchange: 'NYSE', market: 'US' },
  { symbol: 'CVX', name: 'Chevron', exchange: 'NYSE', market: 'US' },
  { symbol: 'COP', name: 'ConocoPhillips', exchange: 'NYSE', market: 'US' },
  { symbol: 'NEE', name: 'NextEra Energy', exchange: 'NYSE', market: 'US' },
  { symbol: 'ENPH', name: 'Enphase Energy', exchange: 'NASDAQ', market: 'US' },
  // ── 통신 ──────────────────────────────────────────────
  { symbol: 'T', name: 'AT&T', exchange: 'NYSE', market: 'US' },
  { symbol: 'VZ', name: 'Verizon', exchange: 'NYSE', market: 'US' },
  { symbol: 'TMUS', name: 'T-Mobile', exchange: 'NASDAQ', market: 'US' },
  // ── EV / 자동차 ────────────────────────────────────────
  { symbol: 'RIVN', name: 'Rivian', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'LCID', name: 'Lucid Group', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'GM', name: 'General Motors', exchange: 'NYSE', market: 'US' },
  { symbol: 'F', name: 'Ford Motor', exchange: 'NYSE', market: 'US' },
  // ── ETF ───────────────────────────────────────────────
  { symbol: 'SPY', name: 'S&P 500 ETF (SPY)', exchange: 'NYSE Arca', market: 'US' },
  { symbol: 'QQQ', name: 'NASDAQ 100 ETF (QQQ)', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'SOXL', name: '반도체 3x ETF (SOXL)', exchange: 'NYSE Arca', market: 'US' },
  { symbol: 'TQQQ', name: 'NASDAQ 3x ETF (TQQQ)', exchange: 'NASDAQ', market: 'US' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', exchange: 'NYSE Arca', market: 'US' },
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
