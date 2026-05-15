'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ── 타입 ────────────────────────────────────────────────────────────────────
interface WatchItem { id: string; symbol: string; name: string; market: string }
interface Quote {
  symbol: string; shortName?: string; longName?: string;
  regularMarketPrice?: number; regularMarketChange?: number; regularMarketChangePercent?: number;
  regularMarketVolume?: number; regularMarketOpen?: number;
  regularMarketDayHigh?: number; regularMarketDayLow?: number;
  previousClose?: number; currency?: string; marketState?: string;
  regularMarketTime?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number;
  marketCap?: number;
}
interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
interface NewsItem { id: string; title: string; publisher: string; link: string; publishedAt: string; thumbnail: string | null }
interface JournalEntry {
  id: string; symbol: string; name: string; trade_date: string;
  trade_type: 'buy' | 'sell'; quantity: number; price: number; fee: number; memo: string;
}
interface Prediction {
  id: string; symbol: string; name: string; prediction_date: string;
  predicted_close: number; actual_close: number | null; accuracy_pct: number | null;
  direction: string | null; note: string | null;
}
interface SearchResult { symbol: string; name: string; exchange: string; market: string }

// ── 유틸 ────────────────────────────────────────────────────────────────────
function fmtPrice(p: number | undefined, currency?: string): string {
  if (p === undefined || p === null) return '-';
  if (currency === 'KRW' || currency === 'KRX') return p.toLocaleString('ko-KR') + '원';
  return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtChg(c: number | undefined, pct: number | undefined): string {
  if (c === undefined || pct === undefined) return '';
  const sign = c >= 0 ? '+' : '';
  return `${sign}${c.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
}
function fmtVol(v: number | undefined): string {
  if (!v) return '-';
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '억';
  if (v >= 1e4) return (v / 1e4).toFixed(1) + '만';
  return v.toLocaleString();
}
function fmtMarketCap(v: number | undefined): string {
  if (!v) return '-';
  if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  return v.toLocaleString();
}
function todayStr(): string { return new Date().toISOString().slice(0, 10) }
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 3600000) return Math.floor(diff / 60000) + '분 전';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '시간 전';
  return Math.floor(diff / 86400000) + '일 전';
}

// ── 미니 스파크라인 ──────────────────────────────────────────────────────────
function MiniChart({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length < 2) return <div className="w-16 h-8" />;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 64, H = 32;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`).join(' ');
  const color = positive ? '#10b981' : '#ef4444';
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── 캔들스틱 차트 (Canvas) ───────────────────────────────────────────────────
function CandleChart({ candles, interval }: { candles: Candle[]; interval: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!candles.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const PAD_L = 55, PAD_R = 10, PAD_T = 15, PAD_B = 45;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    const visible = candles.slice(-Math.min(candles.length, Math.floor(chartW / 8)));
    const prices = visible.flatMap(c => [c.high, c.low]);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const priceRange = maxP - minP || 1;
    const volumes = visible.map(c => c.volume);
    const maxVol = Math.max(...volumes) || 1;
    const VBAR_H = Math.floor(chartH * 0.18);

    const toY = (p: number) => PAD_T + chartH - ((p - minP) / priceRange) * (chartH - VBAR_H - 4);
    const barW = Math.max(2, Math.floor(chartW / visible.length) - 1);

    // background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD_T + (chartH - VBAR_H - 4) / 4 * i;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
      const price = maxP - (maxP - minP) / 4 * i;
      ctx.fillStyle = '#6b7280'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(price >= 1000 ? price.toLocaleString('ko-KR') : price.toFixed(2), PAD_L - 3, y + 4);
    }

    // candles + volume
    visible.forEach((c, i) => {
      const x = PAD_L + i * (chartW / visible.length) + (chartW / visible.length - barW) / 2;
      const up = c.close >= c.open;
      const color = up ? '#10b981' : '#ef4444';

      // volume bar
      const volH = (c.volume / maxVol) * VBAR_H;
      ctx.fillStyle = up ? '#064e3b' : '#450a0a';
      ctx.fillRect(x, H - PAD_B - volH, barW, volH);

      // wick
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + barW / 2, toY(c.high));
      ctx.lineTo(x + barW / 2, toY(c.low));
      ctx.stroke();

      // body
      const bodyTop = toY(Math.max(c.open, c.close));
      const bodyH = Math.max(1, Math.abs(toY(c.open) - toY(c.close)));
      ctx.fillStyle = color;
      ctx.fillRect(x, bodyTop, barW, bodyH);
    });

    // x-axis dates
    ctx.fillStyle = '#6b7280'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    const step = Math.ceil(visible.length / 6);
    visible.forEach((c, i) => {
      if (i % step !== 0) return;
      const x = PAD_L + (i + 0.5) * (chartW / visible.length);
      const d = new Date(c.time * 1000);
      const label = interval === '1d' || interval === '5d'
        ? `${d.getMonth() + 1}/${d.getDate()}`
        : interval === '1wk' || interval === '1mo'
          ? `${d.getFullYear().toString().slice(2)}/${d.getMonth() + 1}`
          : `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      ctx.fillText(label, x, H - PAD_B + 14);
    });

    // last price line
    const last = visible[visible.length - 1];
    if (last) {
      const y = toY(last.close);
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(last.close >= 1000 ? last.close.toLocaleString('ko-KR') : last.close.toFixed(2), W - PAD_R + 2, y + 4);
    }
  }, [candles, interval]);

  return <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />;
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function StocksPage() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'chart' | 'news' | 'journal' | 'prediction'>('chart');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartInterval, setChartInterval] = useState<string>('1d');
  const [chartRange, setChartRange] = useState<string>('3mo');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);

  // 검색
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 매매일지 폼
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [jForm, setJForm] = useState({ trade_date: todayStr(), trade_type: 'buy' as 'buy' | 'sell', quantity: '', price: '', fee: '', memo: '' });

  // 종가예측 폼
  const [showPredForm, setShowPredForm] = useState(false);
  const [pForm, setPForm] = useState({ prediction_date: todayStr(), predicted_close: '', direction: 'up', note: '' });
  const [actualInput, setActualInput] = useState<Record<string, string>>({});

  // toast
  const [toast, setToast] = useState('');
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  // ── 초기 로드 ──────────────────────────────────────────────────────────────
  useEffect(() => { loadWatchlist(); }, []);

  useEffect(() => {
    if (watchlist.length === 0) return;
    refreshQuotes();
    const iv = setInterval(refreshQuotes, 30000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist]);

  useEffect(() => {
    if (!selected) return;
    if (tab === 'chart') loadChart(selected, chartInterval, chartRange);
    if (tab === 'news') loadNews(selected);
    if (tab === 'journal') loadJournal(selected);
    if (tab === 'prediction') loadPredictions(selected);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tab]);

  useEffect(() => {
    if (selected && tab === 'chart') loadChart(selected, chartInterval, chartRange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartInterval, chartRange]);

  // ── API 함수 ───────────────────────────────────────────────────────────────
  const loadWatchlist = async () => {
    const res = await fetch('/api/stocks/watchlist');
    if (res.ok) {
      const data = await res.json() as WatchItem[];
      setWatchlist(data);
      if (data.length > 0 && !selected) setSelected(data[0].symbol);
    }
  };

  const refreshQuotes = useCallback(async () => {
    if (watchlist.length === 0) return;
    const symbols = watchlist.map(w => w.symbol).join(',');
    const res = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(symbols)}`);
    if (res.ok) {
      const data = await res.json() as Quote[];
      const map: Record<string, Quote> = {};
      data.forEach(q => { map[q.symbol] = q; });
      setQuotes(map);
    }
  }, [watchlist]);

  const loadChart = async (sym: string, interval: string, range: string) => {
    setLoadingChart(true);
    const res = await fetch(`/api/stocks/chart?symbol=${sym}&interval=${interval}&range=${range}`);
    if (res.ok) setCandles(await res.json() as Candle[]);
    setLoadingChart(false);
  };

  const loadNews = async (sym: string) => {
    setLoadingNews(true);
    const res = await fetch(`/api/stocks/news?symbol=${sym}`);
    if (res.ok) setNews(await res.json() as NewsItem[]);
    setLoadingNews(false);
  };

  const loadJournal = async (sym: string) => {
    const res = await fetch(`/api/stocks/journal?symbol=${sym}`);
    if (res.ok) setJournal(await res.json() as JournalEntry[]);
  };

  const loadPredictions = async (sym: string) => {
    const res = await fetch(`/api/stocks/prediction?symbol=${sym}`);
    if (res.ok) setPredictions(await res.json() as Prediction[]);
  };

  // ── 검색 ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQ.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(searchQ)}`);
      if (res.ok) setSearchResults(await res.json() as SearchResult[]);
      setSearching(false);
    }, 400);
  }, [searchQ]);

  const addToWatchlist = async (r: SearchResult) => {
    const res = await fetch('/api/stocks/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: r.symbol, name: r.name, market: r.market }),
    });
    if (res.ok) {
      setSearchQ(''); setSearchResults([]);
      await loadWatchlist();
      showToast(`${r.name} 추가됨`);
    }
  };

  const removeFromWatchlist = async (item: WatchItem) => {
    await fetch(`/api/stocks/watchlist/${item.id}`, { method: 'DELETE' });
    setWatchlist(prev => prev.filter(w => w.id !== item.id));
    if (selected === item.symbol) setSelected(watchlist.find(w => w.id !== item.id)?.symbol || null);
    showToast(`${item.name} 삭제됨`);
  };

  // ── 매매일지 저장 ──────────────────────────────────────────────────────────
  const saveJournal = async () => {
    if (!selected || !jForm.quantity || !jForm.price) return;
    const wItem = watchlist.find(w => w.symbol === selected);
    const res = await fetch('/api/stocks/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: selected, name: wItem?.name || selected,
        trade_date: jForm.trade_date, trade_type: jForm.trade_type,
        quantity: parseInt(jForm.quantity), price: parseFloat(jForm.price),
        fee: parseFloat(jForm.fee || '0'), memo: jForm.memo,
      }),
    });
    if (res.ok) {
      setShowJournalForm(false);
      setJForm({ trade_date: todayStr(), trade_type: 'buy', quantity: '', price: '', fee: '', memo: '' });
      loadJournal(selected);
      showToast('거래 기록됨');
    }
  };

  const deleteJournal = async (id: string) => {
    if (!confirm('삭제할까요?')) return;
    await fetch(`/api/stocks/journal/${id}`, { method: 'DELETE' });
    if (selected) loadJournal(selected);
  };

  // ── 종가예측 저장 ──────────────────────────────────────────────────────────
  const savePrediction = async () => {
    if (!selected || !pForm.predicted_close) return;
    const wItem = watchlist.find(w => w.symbol === selected);
    const res = await fetch('/api/stocks/prediction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: selected, name: wItem?.name || selected,
        prediction_date: pForm.prediction_date,
        predicted_close: parseFloat(pForm.predicted_close),
        direction: pForm.direction, note: pForm.note,
      }),
    });
    if (res.ok) {
      setShowPredForm(false);
      setPForm({ prediction_date: todayStr(), predicted_close: '', direction: 'up', note: '' });
      loadPredictions(selected);
      showToast('예측 기록됨');
    }
  };

  const updateActual = async (pred: Prediction) => {
    const v = actualInput[pred.id];
    if (!v) return;
    const res = await fetch('/api/stocks/prediction', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pred.id, actual_close: parseFloat(v) }),
    });
    if (res.ok) {
      setActualInput(p => { const n = { ...p }; delete n[pred.id]; return n; });
      if (selected) loadPredictions(selected);
      showToast('실제 종가 기록됨');
    }
  };

  // ── 포트폴리오 계산 ────────────────────────────────────────────────────────
  const calcPortfolio = (sym: string) => {
    const entries = journal.filter(j => j.symbol === sym);
    let shares = 0, totalCost = 0;
    entries.forEach(e => {
      if (e.trade_type === 'buy') { shares += e.quantity; totalCost += e.quantity * e.price + (e.fee || 0); }
      else { shares -= e.quantity; }
    });
    if (shares <= 0) return null;
    const avgCost = totalCost / (shares + entries.filter(e => e.trade_type === 'sell').reduce((s, e) => s + e.quantity, 0) || 1);
    const current = quotes[sym]?.regularMarketPrice;
    const pnl = current ? (current - avgCost) * shares : null;
    const pnlPct = current ? ((current - avgCost) / avgCost) * 100 : null;
    return { shares, avgCost, pnl, pnlPct };
  };

  // ── 선택된 종목 정보 ───────────────────────────────────────────────────────
  const selectedQuote = selected ? quotes[selected] : null;
  const isUp = (selectedQuote?.regularMarketChange ?? 0) >= 0;
  const portfolio = selected ? calcPortfolio(selected) : null;

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* 토스트 */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2 rounded-full text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* ── 헤더 ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">📈 주식 투자</h1>
          {/* 검색창 */}
          <div className="relative flex-1 max-w-sm">
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="종목 검색 (삼성전자, AAPL...)"
              className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-1.5 pl-8 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="absolute left-2.5 top-2 text-gray-400 text-xs">🔍</span>
            {searching && <span className="absolute right-2 top-2 text-gray-400 text-xs">...</span>}
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-gray-800 rounded-lg shadow-xl z-40 max-h-64 overflow-y-auto border border-gray-700">
                {searchResults.map(r => (
                  <button key={r.symbol} onClick={() => addToWatchlist(r)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700 text-left text-sm">
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-gray-400 text-xs">{r.symbol} · {r.exchange}</div>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${r.market === 'KR' ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'}`}>
                      {r.market === 'KR' ? '국내' : '미국'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-xs text-gray-500">30초 자동갱신</div>
        </div>
      </div>

      {/* ── 즐겨찾기 바 ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 overflow-x-auto">
        <div className="flex gap-2 px-3 py-2 min-w-max">
          {watchlist.length === 0 && (
            <div className="text-gray-500 text-sm px-2 py-1">위 검색창에서 종목을 추가하세요</div>
          )}
          {watchlist.map(w => {
            const q = quotes[w.symbol];
            const up = (q?.regularMarketChange ?? 0) >= 0;
            const isKr = w.symbol.endsWith('.KS') || w.symbol.endsWith('.KQ');
            return (
              <div key={w.symbol} className={`relative group flex-shrink-0 cursor-pointer rounded-lg px-3 py-2 border transition-all ${selected === w.symbol ? 'bg-blue-900/40 border-blue-600' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}
                onClick={() => setSelected(w.symbol)}>
                <button onClick={e => { e.stopPropagation(); removeFromWatchlist(w); }}
                  className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 bg-red-500 rounded-full text-xs items-center justify-center leading-none">×</button>
                <div className="flex items-center gap-2">
                  <div>
                    <div className="text-xs font-medium text-gray-300 whitespace-nowrap">{w.name}</div>
                    <div className="text-sm font-bold whitespace-nowrap">
                      {q ? (isKr ? (q.regularMarketPrice?.toLocaleString('ko-KR') + '원') : ('$' + q.regularMarketPrice?.toFixed(2))) : '-'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                      {q ? `${up ? '+' : ''}${q.regularMarketChangePercent?.toFixed(2)}%` : ''}
                    </div>
                    <div className="text-xs text-gray-500">{w.symbol.endsWith('.KS') ? 'KOSPI' : w.symbol.endsWith('.KQ') ? 'KOSDAQ' : 'US'}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 본문 ─────────────────────────────────────────────────────────── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-4xl mb-2">📈</div>
            <div>위에서 종목을 검색해서 추가하세요</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 종목 헤더 */}
          <div className="flex-shrink-0 bg-gray-900 px-4 py-3 border-b border-gray-800">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-1">
              <div>
                <div className="text-xl font-bold">{selectedQuote?.shortName || selectedQuote?.longName || watchlist.find(w => w.symbol === selected)?.name || selected}</div>
                <div className="text-xs text-gray-400">{selected} · {selectedQuote?.marketState === 'REGULAR' ? '🟢 장중' : selectedQuote?.marketState === 'PRE' ? '🌅 프리마켓' : selectedQuote?.marketState === 'POST' ? '🌙 애프터마켓' : '🔴 장 마감'}</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtPrice(selectedQuote?.regularMarketPrice, selectedQuote?.currency)}
                </div>
                <div className={`text-sm ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtChg(selectedQuote?.regularMarketChange, selectedQuote?.regularMarketChangePercent)}
                </div>
              </div>
              <div className="hidden sm:grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-400">
                <div>시가: <span className="text-gray-200">{fmtPrice(selectedQuote?.regularMarketOpen, selectedQuote?.currency)}</span></div>
                <div>고가: <span className="text-emerald-300">{fmtPrice(selectedQuote?.regularMarketDayHigh, selectedQuote?.currency)}</span></div>
                <div>전일: <span className="text-gray-200">{fmtPrice(selectedQuote?.previousClose, selectedQuote?.currency)}</span></div>
                <div>저가: <span className="text-red-300">{fmtPrice(selectedQuote?.regularMarketDayLow, selectedQuote?.currency)}</span></div>
              </div>
              <div className="hidden sm:grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-400">
                <div>거래량: <span className="text-gray-200">{fmtVol(selectedQuote?.regularMarketVolume)}</span></div>
                <div>시총: <span className="text-gray-200">{fmtMarketCap(selectedQuote?.marketCap)}</span></div>
                <div>52주고: <span className="text-emerald-300">{fmtPrice(selectedQuote?.fiftyTwoWeekHigh, selectedQuote?.currency)}</span></div>
                <div>52주저: <span className="text-red-300">{fmtPrice(selectedQuote?.fiftyTwoWeekLow, selectedQuote?.currency)}</span></div>
              </div>
              {portfolio && (
                <div className={`ml-auto px-3 py-1.5 rounded-lg text-xs border ${(portfolio.pnl ?? 0) >= 0 ? 'bg-emerald-900/30 border-emerald-700' : 'bg-red-900/30 border-red-700'}`}>
                  <div className="font-semibold">{portfolio.shares}주 보유</div>
                  <div>평균 {fmtPrice(portfolio.avgCost, selectedQuote?.currency)}</div>
                  {portfolio.pnl !== null && (
                    <div className={(portfolio.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {(portfolio.pnl ?? 0) >= 0 ? '+' : ''}{portfolio.pnl?.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
                      ({(portfolio.pnlPct ?? 0) >= 0 ? '+' : ''}{portfolio.pnlPct?.toFixed(2)}%)
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 탭 */}
          <div className="flex-shrink-0 flex border-b border-gray-800 bg-gray-900">
            {[
              { id: 'chart', label: '📊 차트' },
              { id: 'news', label: '📰 뉴스' },
              { id: 'journal', label: '📝 매매일지' },
              { id: 'prediction', label: '🎯 종가예측' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* 탭 컨텐츠 */}
          <div className="flex-1 overflow-y-auto">

            {/* ── 차트 탭 ─────────────────────────────────────────────── */}
            {tab === 'chart' && (
              <div className="flex flex-col h-full">
                {/* 인터벌 선택 */}
                <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-wrap">
                  <div className="flex gap-1">
                    {[
                      { interval: '1m', range: '1d', label: '1분' },
                      { interval: '5m', range: '5d', label: '5분' },
                      { interval: '15m', range: '5d', label: '15분' },
                      { interval: '1h', range: '1mo', label: '1시간' },
                      { interval: '1d', range: '3mo', label: '일봉' },
                      { interval: '1d', range: '1y', label: '1년' },
                      { interval: '1wk', range: '2y', label: '주봉' },
                      { interval: '1mo', range: '5y', label: '월봉' },
                    ].map(opt => (
                      <button key={`${opt.interval}-${opt.range}`}
                        onClick={() => { setChartInterval(opt.interval); setChartRange(opt.range); }}
                        className={`px-2 py-1 text-xs rounded ${chartInterval === opt.interval && chartRange === opt.range ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {loadingChart && <span className="text-xs text-gray-500">로딩중...</span>}
                </div>
                {/* 캔들 차트 */}
                <div className="flex-1 min-h-0 p-2">
                  {candles.length > 0
                    ? <CandleChart candles={candles} interval={chartInterval} />
                    : <div className="flex items-center justify-center h-full text-gray-500">{loadingChart ? '차트 로딩중...' : '데이터 없음'}</div>
                  }
                </div>
              </div>
            )}

            {/* ── 뉴스 탭 ─────────────────────────────────────────────── */}
            {tab === 'news' && (
              <div className="p-4">
                {loadingNews && <div className="text-gray-500 text-sm">뉴스 로딩중...</div>}
                {!loadingNews && news.length === 0 && <div className="text-gray-500 text-sm">뉴스가 없습니다.</div>}
                <div className="space-y-3">
                  {news.map(n => (
                    <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer"
                      className="flex gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
                      {n.thumbnail && <img src={n.thumbnail} alt="" className="w-16 h-12 object-cover rounded flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium line-clamp-2">{n.title}</div>
                        <div className="text-xs text-gray-400 mt-1">{n.publisher} · {relTime(n.publishedAt)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ── 매매일지 탭 ──────────────────────────────────────────── */}
            {tab === 'journal' && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">매매 기록</h3>
                  <button onClick={() => setShowJournalForm(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded-lg">+ 거래 추가</button>
                </div>

                {/* 거래 입력 폼 */}
                {showJournalForm && (
                  <div className="bg-gray-800 rounded-xl p-4 mb-4 border border-gray-700">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400">날짜</label>
                        <input type="date" value={jForm.trade_date} onChange={e => setJForm(p => ({ ...p, trade_date: e.target.value }))}
                          className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">구분</label>
                        <div className="flex gap-2 mt-0.5">
                          {['buy', 'sell'].map(t => (
                            <button key={t} onClick={() => setJForm(p => ({ ...p, trade_type: t as 'buy' | 'sell' }))}
                              className={`flex-1 py-1.5 text-sm rounded ${jForm.trade_type === t ? (t === 'buy' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white') : 'bg-gray-700 text-gray-400'}`}>
                              {t === 'buy' ? '매수' : '매도'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">수량</label>
                        <input type="number" value={jForm.quantity} onChange={e => setJForm(p => ({ ...p, quantity: e.target.value }))}
                          placeholder="100" className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">단가</label>
                        <input type="number" value={jForm.price} onChange={e => setJForm(p => ({ ...p, price: e.target.value }))}
                          placeholder="83200" className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">수수료</label>
                        <input type="number" value={jForm.fee} onChange={e => setJForm(p => ({ ...p, fee: e.target.value }))}
                          placeholder="0" className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">메모</label>
                        <input value={jForm.memo} onChange={e => setJForm(p => ({ ...p, memo: e.target.value }))}
                          placeholder="기록 메모" className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 mt-0.5" />
                      </div>
                    </div>
                    {jForm.quantity && jForm.price && (
                      <div className="mt-2 text-sm text-gray-300">
                        거래금액: <span className="font-bold text-white">
                          {(parseInt(jForm.quantity) * parseFloat(jForm.price)).toLocaleString('ko-KR')}
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button onClick={saveJournal} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded-lg">저장</button>
                      <button onClick={() => setShowJournalForm(false)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-4 py-1.5 rounded-lg">취소</button>
                    </div>
                  </div>
                )}

                {/* 수익률 요약 */}
                {portfolio && (
                  <div className={`rounded-xl p-3 mb-4 border ${(portfolio.pnl ?? 0) >= 0 ? 'bg-emerald-900/20 border-emerald-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
                    <div className="text-xs text-gray-400 mb-1">포트폴리오 요약</div>
                    <div className="flex gap-4 flex-wrap">
                      <div><span className="text-xs text-gray-400">보유수량 </span><span className="font-bold">{portfolio.shares}주</span></div>
                      <div><span className="text-xs text-gray-400">평균단가 </span><span className="font-bold">{portfolio.avgCost?.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</span></div>
                      {portfolio.pnl !== null && <>
                        <div><span className="text-xs text-gray-400">평가손익 </span><span className={`font-bold ${(portfolio.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(portfolio.pnl ?? 0) >= 0 ? '+' : ''}{portfolio.pnl?.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</span></div>
                        <div><span className="text-xs text-gray-400">수익률 </span><span className={`font-bold ${(portfolio.pnlPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(portfolio.pnlPct ?? 0) >= 0 ? '+' : ''}{portfolio.pnlPct?.toFixed(2)}%</span></div>
                      </>}
                    </div>
                  </div>
                )}

                {/* 거래 목록 */}
                <div className="space-y-2">
                  {journal.length === 0 && <div className="text-gray-500 text-sm">매매 기록이 없습니다.</div>}
                  {journal.map(j => (
                    <div key={j.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${j.trade_type === 'buy' ? 'bg-blue-900 text-blue-300' : 'bg-red-900 text-red-300'}`}>
                          {j.trade_type === 'buy' ? '매수' : '매도'}
                        </span>
                        <div>
                          <div className="text-sm">{j.trade_date} · {j.quantity.toLocaleString()}주 × {j.price.toLocaleString('ko-KR')}</div>
                          <div className="text-xs text-gray-400">
                            합계 {(j.quantity * j.price).toLocaleString('ko-KR')} {j.fee ? `· 수수료 ${j.fee.toLocaleString()}` : ''}
                            {j.memo ? ` · ${j.memo}` : ''}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => deleteJournal(j.id)} className="text-gray-500 hover:text-red-400 text-xs px-2">삭제</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 종가예측 탭 ──────────────────────────────────────────── */}
            {tab === 'prediction' && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">종가 예측 기록</h3>
                  <button onClick={() => setShowPredForm(true)}
                    className="bg-purple-600 hover:bg-purple-500 text-white text-sm px-3 py-1.5 rounded-lg">+ 예측 추가</button>
                </div>

                {/* 예측 입력 폼 */}
                {showPredForm && (
                  <div className="bg-gray-800 rounded-xl p-4 mb-4 border border-gray-700">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400">예측 날짜</label>
                        <input type="date" value={pForm.prediction_date} onChange={e => setPForm(p => ({ ...p, prediction_date: e.target.value }))}
                          className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">예상 종가</label>
                        <input type="number" value={pForm.predicted_close} onChange={e => setPForm(p => ({ ...p, predicted_close: e.target.value }))}
                          placeholder="83500" className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">방향</label>
                        <div className="flex gap-1 mt-0.5">
                          {[{ v: 'up', l: '📈 상승' }, { v: 'down', l: '📉 하락' }, { v: 'neutral', l: '➡️ 횡보' }].map(d => (
                            <button key={d.v} onClick={() => setPForm(p => ({ ...p, direction: d.v }))}
                              className={`flex-1 py-1 text-xs rounded ${pForm.direction === d.v ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                              {d.l}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">메모</label>
                        <input value={pForm.note} onChange={e => setPForm(p => ({ ...p, note: e.target.value }))}
                          placeholder="예측 근거" className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 mt-0.5" />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={savePrediction} className="bg-purple-600 hover:bg-purple-500 text-white text-sm px-4 py-1.5 rounded-lg">저장</button>
                      <button onClick={() => setShowPredForm(false)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-4 py-1.5 rounded-lg">취소</button>
                    </div>
                  </div>
                )}

                {/* 정확도 통계 */}
                {predictions.filter(p => p.accuracy_pct !== null).length > 0 && (() => {
                  const withActual = predictions.filter(p => p.accuracy_pct !== null);
                  const avgAcc = withActual.reduce((s, p) => s + (p.accuracy_pct ?? 0), 0) / withActual.length;
                  const hitRate = withActual.filter(p => (p.accuracy_pct ?? 0) >= 95).length / withActual.length * 100;
                  return (
                    <div className="bg-purple-900/20 border border-purple-700/50 rounded-xl p-3 mb-4">
                      <div className="text-xs text-gray-400 mb-1">예측 성과</div>
                      <div className="flex gap-4">
                        <div><span className="text-xs text-gray-400">평균 정확도 </span><span className="font-bold text-purple-300">{avgAcc.toFixed(1)}%</span></div>
                        <div><span className="text-xs text-gray-400">±5% 적중률 </span><span className="font-bold text-purple-300">{hitRate.toFixed(0)}%</span></div>
                        <div><span className="text-xs text-gray-400">기록 수 </span><span className="font-bold">{withActual.length}건</span></div>
                      </div>
                    </div>
                  );
                })()}

                {/* 예측 목록 */}
                <div className="space-y-2">
                  {predictions.length === 0 && <div className="text-gray-500 text-sm">예측 기록이 없습니다.</div>}
                  {predictions.map(p => (
                    <div key={p.id} className="bg-gray-800 rounded-lg px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{p.prediction_date}</span>
                          <span className="text-xs">{p.direction === 'up' ? '📈' : p.direction === 'down' ? '📉' : '➡️'}</span>
                          <span className="text-sm">예상 <span className="font-bold text-yellow-300">{p.predicted_close.toLocaleString('ko-KR')}</span></span>
                          {p.actual_close !== null && (
                            <span className="text-sm">실제 <span className={`font-bold ${p.actual_close >= p.predicted_close ? 'text-emerald-300' : 'text-red-300'}`}>{p.actual_close.toLocaleString('ko-KR')}</span></span>
                          )}
                          {p.accuracy_pct !== null && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${(p.accuracy_pct ?? 0) >= 95 ? 'bg-emerald-900 text-emerald-300' : (p.accuracy_pct ?? 0) >= 85 ? 'bg-yellow-900 text-yellow-300' : 'bg-red-900 text-red-300'}`}>
                              {p.accuracy_pct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        {/* 실제 종가 입력 */}
                        {p.actual_close === null && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <input type="number" value={actualInput[p.id] || ''} onChange={e => setActualInput(prev => ({ ...prev, [p.id]: e.target.value }))}
                              placeholder="실제종가" className="w-20 bg-gray-700 text-white text-xs rounded px-2 py-1" />
                            <button onClick={() => updateActual(p)} className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-2 py-1 rounded">확인</button>
                          </div>
                        )}
                      </div>
                      {p.note && <div className="text-xs text-gray-400 mt-1">💬 {p.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
