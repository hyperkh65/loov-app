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
  regularMarketTime?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number; marketCap?: number;
}
interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
interface NewsItem { id: string; title: string; publisher: string; link: string; publishedAt: string; thumbnail: string | null }
interface JournalEntry {
  id: string; symbol: string; name: string; trade_date: string;
  trade_type: 'buy' | 'sell'; quantity: number; price: number; fee: number; memo: string;
}
interface Prediction {
  id: string; symbol: string; prediction_date: string; predicted_close: number;
  actual_close: number | null; accuracy_pct: number | null; direction: string | null; note: string | null;
}
interface SearchResult { symbol: string; name: string; exchange: string; market: string }

// ── 유틸 ────────────────────────────────────────────────────────────────────
function isKrSymbol(sym: string) { return sym.endsWith('.KS') || sym.endsWith('.KQ') }
function fmtPrice(p: number | undefined, sym: string): string {
  if (p == null) return '-';
  return isKrSymbol(sym)
    ? p.toLocaleString('ko-KR') + '원'
    : '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(p: number | undefined): string {
  if (p == null) return '';
  return (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
}
function fmtVol(v: number | undefined): string {
  if (!v) return '-';
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '억';
  if (v >= 1e4) return (v / 1e4).toFixed(1) + '만';
  return v.toLocaleString();
}
function todayStr() { return new Date().toISOString().slice(0, 10) }
function relTime(iso: string): string {
  if (!iso) return '';
  const d = Date.now() - new Date(iso).getTime();
  if (d < 3600000) return Math.floor(d / 60000) + '분 전';
  if (d < 86400000) return Math.floor(d / 3600000) + '시간 전';
  return Math.floor(d / 86400000) + '일 전';
}

// ── 스파크라인 ───────────────────────────────────────────────────────────────
function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) return <div className="w-16 h-8" />;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const W = 64, H = 28;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * (H - 2) - 1}`).join(' ');
  const color = up ? '#00C73C' : '#FF3B30';
  const id = `sg-${Math.random().toString(36).slice(2)}`;
  const lastX = (data.length - 1) / (data.length - 1) * W;
  const lastY = H - ((data[data.length - 1] - min) / range) * (H - 2) - 1;
  return (
    <svg width={W} height={H} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${lastX},${H}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

// ── 캔들차트 (Canvas) ────────────────────────────────────────────────────────
function CandleChart({ candles, interval }: { candles: Candle[]; interval: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!candles.length || !ref.current) return;
    const c = ref.current;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.offsetWidth * window.devicePixelRatio, H = c.offsetHeight * window.devicePixelRatio;
    c.width = W; c.height = H; ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const cW = c.offsetWidth, cH = c.offsetHeight;
    const PL = 60, PR = 8, PT = 12, PB = 40;
    const chartW = cW - PL - PR, chartH = cH - PT - PB;
    const vis = candles.slice(-Math.min(candles.length, Math.floor(chartW / 9)));
    const px = vis.flatMap(c => [c.high, c.low]);
    const minP = Math.min(...px), maxP = Math.max(...px), rng = maxP - minP || 1;
    const maxVol = Math.max(...vis.map(c => c.volume)) || 1;
    const VH = Math.floor(chartH * 0.2);
    const toY = (p: number) => PT + chartH - ((p - minP) / rng) * (chartH - VH - 6);
    const bW = Math.max(3, Math.floor(chartW / vis.length) - 2);

    ctx.fillStyle = '#111116'; ctx.fillRect(0, 0, cW, cH);

    // grid lines
    for (let i = 0; i <= 4; i++) {
      const y = PT + (chartH - VH - 6) / 4 * i;
      ctx.strokeStyle = '#ffffff10'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(cW - PR, y); ctx.stroke();
      const val = maxP - (maxP - minP) / 4 * i;
      ctx.fillStyle = '#666'; ctx.font = `${10}px -apple-system,sans-serif`; ctx.textAlign = 'right';
      ctx.fillText(isKrSymbol('') ? val.toLocaleString('ko-KR') : val.toFixed(2), PL - 4, y + 4);
    }

    vis.forEach((c, i) => {
      const x = PL + i * (chartW / vis.length) + (chartW / vis.length - bW) / 2;
      const up = c.close >= c.open;
      const col = up ? '#00C73C' : '#FF3B30';
      // volume
      const vh = (c.volume / maxVol) * VH;
      ctx.fillStyle = up ? '#00C73C22' : '#FF3B3022';
      ctx.fillRect(x, cH - PB - vh, bW, vh);
      // wick
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + bW / 2, toY(c.high)); ctx.lineTo(x + bW / 2, toY(c.low)); ctx.stroke();
      // body
      const bt = toY(Math.max(c.open, c.close));
      const bh = Math.max(1, Math.abs(toY(c.open) - toY(c.close)));
      ctx.fillStyle = col; ctx.fillRect(x, bt, bW, bh);
    });

    // x labels
    ctx.fillStyle = '#555'; ctx.font = `9px -apple-system,sans-serif`; ctx.textAlign = 'center';
    const step = Math.ceil(vis.length / 6);
    vis.forEach((c, i) => {
      if (i % step !== 0) return;
      const x = PL + (i + 0.5) * (chartW / vis.length);
      const d = new Date(c.time * 1000);
      const lbl = interval.includes('m') || interval === '1h'
        ? `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`
        : interval === '1wk' || interval === '1mo' ? `${d.getFullYear().toString().slice(2)}/${d.getMonth()+1}`
        : `${d.getMonth()+1}/${d.getDate()}`;
      ctx.fillText(lbl, x, cH - PB + 14);
    });

    // last price
    const last = vis[vis.length - 1];
    if (last) {
      const y = toY(last.close);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = '#FFB74D55'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(cW - PR, y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [candles, interval]);
  return <canvas ref={ref} className="w-full h-full" style={{ display: 'block' }} />;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function StocksPage() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'chart' | 'news' | 'journal' | 'prediction'>('chart');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartInterval, setChartInterval] = useState('1d');
  const [chartRange, setChartRange] = useState('3mo');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);

  // 검색 모달
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 매매일지 폼
  const [showJournalForm, setShowJournalForm] = useState(false);
  const [jForm, setJForm] = useState({ trade_date: todayStr(), trade_type: 'buy' as 'buy'|'sell', quantity: '', price: '', fee: '', memo: '' });

  // 종가예측 폼
  const [showPredForm, setShowPredForm] = useState(false);
  const [pForm, setPForm] = useState({ prediction_date: todayStr(), predicted_close: '', direction: 'up', note: '' });
  const [actualInput, setActualInput] = useState<Record<string, string>>({});

  const [toast, setToast] = useState('');
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const [dbError, setDbError] = useState(false);

  // ── 초기 로드 ────────────────────────────────────────────────────────────
  useEffect(() => { loadWatchlist(); }, []);

  useEffect(() => {
    if (watchlist.length === 0) return;
    refreshQuotes();
    loadSparklines();
    const iv = setInterval(refreshQuotes, 10000); // 10초
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

  // 검색 모달 열릴 때 인기종목 로드
  useEffect(() => {
    if (showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
      loadPopular();
    }
  }, [showSearch]);

  // ── API ──────────────────────────────────────────────────────────────────
  const loadWatchlist = async () => {
    const res = await fetch('/api/stocks/watchlist');
    if (res.status === 500) { setDbError(true); return; }
    if (res.ok) {
      const data = await res.json() as WatchItem[];
      setWatchlist(data);
      if (data.length > 0 && !selected) setSelected(data[0].symbol);
    }
  };

  const refreshQuotes = useCallback(async () => {
    if (watchlist.length === 0) return;
    const syms = watchlist.map(w => w.symbol).join(',');
    const res = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(syms)}`);
    if (res.ok) {
      const data = await res.json() as Quote[];
      const map: Record<string, Quote> = {};
      data.forEach(q => { map[q.symbol] = q; });
      setQuotes(map);
    }
  }, [watchlist]);

  const loadSparklines = async () => {
    const map: Record<string, number[]> = {};
    await Promise.allSettled(watchlist.map(async w => {
      const res = await fetch(`/api/stocks/chart?symbol=${w.symbol}&interval=1d&range=1mo`);
      if (res.ok) {
        const data = await res.json() as Candle[];
        map[w.symbol] = data.map(c => c.close);
      }
    }));
    setSparklines(map);
  };

  const loadChart = async (sym: string, interval: string, range: string) => {
    setLoadingChart(true);
    const res = await fetch(`/api/stocks/chart?symbol=${sym}&interval=${interval}&range=${range}`);
    if (res.ok) setCandles(await res.json() as Candle[]);
    setLoadingChart(false);
  };
  const loadNews = async (sym: string) => {
    const res = await fetch(`/api/stocks/news?symbol=${sym}`);
    if (res.ok) setNews(await res.json() as NewsItem[]);
  };
  const loadJournal = async (sym: string) => {
    const res = await fetch(`/api/stocks/journal?symbol=${sym}`);
    if (res.ok) setJournal(await res.json() as JournalEntry[]);
  };
  const loadPredictions = async (sym: string) => {
    const res = await fetch(`/api/stocks/prediction?symbol=${sym}`);
    if (res.ok) setPredictions(await res.json() as Prediction[]);
  };

  // ── 검색 ─────────────────────────────────────────────────────────────────
  const loadPopular = async () => {
    const res = await fetch('/api/stocks/search?q=');
    if (res.ok) setSearchResults(await res.json() as SearchResult[]);
  };

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQ.trim()) { loadPopular(); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(searchQ)}`);
      if (res.ok) setSearchResults(await res.json() as SearchResult[]);
      setSearching(false);
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ]);

  const addStock = async (r: SearchResult) => {
    const res = await fetch('/api/stocks/watchlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: r.symbol, name: r.name, market: r.market }),
    });
    if (res.status === 500) { setDbError(true); showToast('DB 테이블 생성 필요'); return; }
    if (res.ok) {
      setShowSearch(false); setSearchQ('');
      await loadWatchlist();
      setSelected(r.symbol);
      showToast(`${r.name} 추가됨`);
    }
  };

  const removeStock = async (item: WatchItem) => {
    await fetch(`/api/stocks/watchlist/${item.id}`, { method: 'DELETE' });
    const next = watchlist.filter(w => w.id !== item.id);
    setWatchlist(next);
    if (selected === item.symbol) setSelected(next[0]?.symbol || null);
  };

  // ── 매매일지 ──────────────────────────────────────────────────────────────
  const saveJournal = async () => {
    if (!selected || !jForm.quantity || !jForm.price) return;
    const wItem = watchlist.find(w => w.symbol === selected);
    const res = await fetch('/api/stocks/journal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: selected, name: wItem?.name || selected,
        trade_date: jForm.trade_date, trade_type: jForm.trade_type,
        quantity: parseInt(jForm.quantity), price: parseFloat(jForm.price),
        fee: parseFloat(jForm.fee || '0'), memo: jForm.memo }),
    });
    if (res.ok) { setShowJournalForm(false); setJForm({ trade_date: todayStr(), trade_type: 'buy', quantity: '', price: '', fee: '', memo: '' }); loadJournal(selected); showToast('거래 기록됨'); }
  };

  const deleteJournal = async (id: string) => {
    if (!confirm('삭제할까요?')) return;
    await fetch(`/api/stocks/journal/${id}`, { method: 'DELETE' });
    if (selected) loadJournal(selected);
  };

  // ── 종가예측 ──────────────────────────────────────────────────────────────
  const savePrediction = async () => {
    if (!selected || !pForm.predicted_close) return;
    const wItem = watchlist.find(w => w.symbol === selected);
    const res = await fetch('/api/stocks/prediction', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: selected, name: wItem?.name || selected,
        prediction_date: pForm.prediction_date, predicted_close: parseFloat(pForm.predicted_close),
        direction: pForm.direction, note: pForm.note }),
    });
    if (res.ok) { setShowPredForm(false); setPForm({ prediction_date: todayStr(), predicted_close: '', direction: 'up', note: '' }); loadPredictions(selected); showToast('예측 기록됨'); }
  };

  const updateActual = async (pred: Prediction) => {
    const v = actualInput[pred.id]; if (!v) return;
    const res = await fetch('/api/stocks/prediction', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pred.id, actual_close: parseFloat(v) }) });
    if (res.ok) { setActualInput(p => { const n = { ...p }; delete n[pred.id]; return n; }); if (selected) loadPredictions(selected); showToast('실제 종가 기록됨'); }
  };

  // ── 포트폴리오 계산 ───────────────────────────────────────────────────────
  const calcPortfolio = (sym: string) => {
    const entries = journal.filter(j => j.symbol === sym);
    let shares = 0, totalCost = 0;
    entries.forEach(e => { if (e.trade_type === 'buy') { shares += e.quantity; totalCost += e.quantity * e.price + (e.fee || 0); } else { shares -= e.quantity; } });
    if (shares <= 0) return null;
    const sellQty = entries.filter(e => e.trade_type === 'sell').reduce((s, e) => s + e.quantity, 0);
    const avgCost = totalCost / ((shares + sellQty) || 1);
    const cur = quotes[sym]?.regularMarketPrice;
    return { shares, avgCost, pnl: cur ? (cur - avgCost) * shares : null, pnlPct: cur ? ((cur - avgCost) / avgCost) * 100 : null };
  };

  const sq = selected ? quotes[selected] : null;
  const isUp = (sq?.regularMarketChange ?? 0) >= 0;
  const portfolio = selected ? calcPortfolio(selected) : null;
  const selName = watchlist.find(w => w.symbol === selected)?.name || selected || '';

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#0A0A0F] text-white select-none overflow-hidden">

      {/* 토스트 */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white text-gray-900 px-4 py-2 rounded-full text-sm font-medium shadow-2xl">
          {toast}
        </div>
      )}

      {/* DB 오류 배너 */}
      {dbError && (
        <div className="flex-shrink-0 bg-orange-500/10 border-b border-orange-500/30 px-4 py-2 text-xs text-orange-300">
          ⚠️ DB 테이블 없음 — Supabase에서 <strong>bossai_stock_watchlist</strong>, <strong>bossai_stock_journal</strong>, <strong>bossai_stock_predictions</strong> 테이블을 생성해주세요
        </div>
      )}

      {/* 검색 모달 오버레이 */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowSearch(false); setSearchQ(''); } }}>
          <div className="mx-auto w-full max-w-lg mt-16 rounded-2xl overflow-hidden" style={{ background: '#1C1C1E' }}>
            {/* 검색 입력 */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input ref={searchInputRef} value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder="종목명 또는 코드 검색"
                className="flex-1 bg-transparent text-white text-base placeholder-gray-500 focus:outline-none" />
              {searching && <div className="w-4 h-4 border-2 border-gray-500 border-t-white rounded-full animate-spin" />}
              <button onClick={() => { setShowSearch(false); setSearchQ(''); }} className="text-gray-400 hover:text-white text-sm">닫기</button>
            </div>
            {/* 결과 */}
            <div className="max-h-96 overflow-y-auto">
              {!searchQ && <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">인기 종목</div>}
              {searchResults.map(r => (
                <button key={r.symbol} onClick={() => addStock(r)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${r.market === 'KR' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                      {r.name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.symbol} · {r.exchange}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.market === 'KR' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'}`}>
                    {r.market === 'KR' ? '국내' : '미국'}
                  </span>
                </button>
              ))}
              {searchResults.length === 0 && searchQ && !searching && (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">검색 결과 없음</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #ffffff0d' }}>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">📈</span>
          <span className="font-bold text-base">주식</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-600">10초 갱신</div>
          <button onClick={() => setShowSearch(true)}
            className="flex items-center gap-2 bg-white/8 hover:bg-white/12 transition-colors rounded-xl px-3 py-2 text-sm text-gray-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            종목 추가
          </button>
        </div>
      </div>

      {/* ── 메인 레이아웃 ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 왼쪽: 관심종목 ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 w-52 flex flex-col border-r overflow-y-auto" style={{ borderColor: '#ffffff0d', background: '#0D0D12' }}>
          <div className="px-3 pt-3 pb-1">
            <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">관심종목</span>
          </div>
          {watchlist.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl">📊</div>
              <div className="text-xs text-gray-500 leading-relaxed">관심 종목을<br/>추가해보세요</div>
              <button onClick={() => setShowSearch(true)} className="text-xs bg-white/8 hover:bg-white/12 px-3 py-1.5 rounded-lg text-gray-300 transition-colors">+ 종목 추가</button>
            </div>
          ) : (
            <div className="space-y-0.5 px-1.5 pb-2">
              {watchlist.map(w => {
                const q = quotes[w.symbol];
                const up = (q?.regularMarketChange ?? 0) >= 0;
                const isSelected = selected === w.symbol;
                const sp = sparklines[w.symbol] || [];
                return (
                  <div key={w.symbol} onClick={() => { setSelected(w.symbol); setTab('chart'); }}
                    className={`group relative cursor-pointer rounded-xl p-2.5 transition-all ${isSelected ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                    {isSelected && <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-white rounded-full" />}
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate">{w.name}</div>
                        <div className="text-[10px] text-gray-600 mt-0.5">{w.symbol.endsWith('.KS') ? 'KOSPI' : w.symbol.endsWith('.KQ') ? 'KOSDAQ' : 'NASDAQ/NYSE'}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); removeStock(w); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400 text-xs flex-shrink-0">✕</button>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-sm font-bold tabular-nums">
                          {q ? fmtPrice(q.regularMarketPrice, w.symbol) : <span className="text-gray-600">-</span>}
                        </div>
                        <div className={`text-[11px] font-medium ${up ? 'text-[#00C73C]' : 'text-[#FF3B30]'}`}>
                          {q ? fmtPct(q.regularMarketChangePercent) : ''}
                        </div>
                      </div>
                      <Sparkline data={sp} up={up} />
                    </div>
                  </div>
                );
              })}
              <button onClick={() => setShowSearch(true)} className="w-full mt-1 py-2 text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center justify-center gap-1">
                <span>+</span> 종목 추가
              </button>
            </div>
          )}
        </div>

        {/* ── 오른쪽: 종목 상세 ───────────────────────────────────────────── */}
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <div className="text-center">
              <div className="text-5xl mb-3 opacity-30">📈</div>
              <div className="text-sm">왼쪽에서 종목을 선택하세요</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 종목 헤더 */}
            <div className="flex-shrink-0 px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #ffffff0d' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl font-bold truncate">{sq?.shortName || sq?.longName || selName}</h2>
                    {sq?.marketState && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${sq.marketState === 'REGULAR' ? 'bg-[#00C73C]/15 text-[#00C73C]' : 'bg-gray-700 text-gray-400'}`}>
                        {sq.marketState === 'REGULAR' ? '● 장중' : sq.marketState === 'PRE' ? '프리마켓' : sq.marketState === 'POST' ? '애프터' : '마감'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600">{selected}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-3xl font-black tabular-nums ${isUp ? 'text-white' : 'text-white'}`}>
                    {fmtPrice(sq?.regularMarketPrice, selected)}
                  </div>
                  <div className={`text-sm font-semibold mt-0.5 ${isUp ? 'text-[#00C73C]' : 'text-[#FF3B30]'}`}>
                    {sq ? (isUp ? '+' : '') + sq.regularMarketChange?.toFixed(isKrSymbol(selected) ? 0 : 2) + ' (' + fmtPct(sq.regularMarketChangePercent) + ')' : ''}
                  </div>
                </div>
              </div>

              {/* 주요 지표 */}
              <div className="mt-4 grid grid-cols-4 gap-2">
                {[
                  { label: '시가', value: fmtPrice(sq?.regularMarketOpen, selected) },
                  { label: '고가', value: fmtPrice(sq?.regularMarketDayHigh, selected), color: 'text-[#00C73C]' },
                  { label: '저가', value: fmtPrice(sq?.regularMarketDayLow, selected), color: 'text-[#FF3B30]' },
                  { label: '거래량', value: fmtVol(sq?.regularMarketVolume) },
                ].map(item => (
                  <div key={item.label} className="rounded-xl p-2.5" style={{ background: '#1C1C1E' }}>
                    <div className="text-[10px] text-gray-600 mb-0.5">{item.label}</div>
                    <div className={`text-xs font-semibold tabular-nums ${item.color || 'text-white'}`}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* 포트폴리오 요약 (보유 시) */}
              {portfolio && (
                <div className="mt-3 rounded-xl px-3 py-2.5 flex items-center justify-between" style={{ background: '#1C1C1E' }}>
                  <div className="text-xs text-gray-500">{portfolio.shares}주 보유 · 평균 {fmtPrice(portfolio.avgCost, selected)}</div>
                  {portfolio.pnl !== null && (
                    <div className={`text-sm font-bold ${(portfolio.pnl) >= 0 ? 'text-[#00C73C]' : 'text-[#FF3B30]'}`}>
                      {portfolio.pnl >= 0 ? '+' : ''}{portfolio.pnl.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
                      <span className="text-xs ml-1">({portfolio.pnlPct! >= 0 ? '+' : ''}{portfolio.pnlPct!.toFixed(2)}%)</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 탭 */}
            <div className="flex-shrink-0 flex px-6 gap-6" style={{ borderBottom: '1px solid #ffffff0d' }}>
              {[{ id: 'chart', label: '차트' }, { id: 'news', label: '뉴스' }, { id: 'journal', label: '매매일지' }, { id: 'prediction', label: '종가예측' }].map(t => (
                <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
                  className={`py-3 text-sm font-semibold border-b-2 transition-colors -mb-px ${tab === t.id ? 'border-white text-white' : 'border-transparent text-gray-600 hover:text-gray-400'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* 탭 콘텐츠 */}
            <div className="flex-1 overflow-y-auto">

              {/* 차트 탭 */}
              {tab === 'chart' && (
                <div className="flex flex-col h-full">
                  {/* 인터벌 버튼 */}
                  <div className="flex-shrink-0 flex gap-1 px-4 pt-3 pb-2 flex-wrap">
                    {[
                      { i: '5m',  r: '5d',  l: '5분' },
                      { i: '15m', r: '5d',  l: '15분' },
                      { i: '1h',  r: '1mo', l: '1시간' },
                      { i: '1d',  r: '3mo', l: '일봉' },
                      { i: '1d',  r: '1y',  l: '1년' },
                      { i: '1wk', r: '2y',  l: '주봉' },
                      { i: '1mo', r: '5y',  l: '월봉' },
                    ].map(o => (
                      <button key={o.i+o.r} onClick={() => { setChartInterval(o.i); setChartRange(o.r); }}
                        className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${chartInterval === o.i && chartRange === o.r ? 'bg-white text-black' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'}`}>
                        {o.l}
                      </button>
                    ))}
                    {loadingChart && <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin ml-1 self-center" />}
                  </div>
                  <div className="flex-1 min-h-0 px-2 pb-2">
                    {candles.length > 0
                      ? <CandleChart candles={candles} interval={chartInterval} />
                      : <div className="flex items-center justify-center h-full text-gray-700 text-sm">{loadingChart ? '로딩중...' : '데이터 없음'}</div>}
                  </div>
                </div>
              )}

              {/* 뉴스 탭 */}
              {tab === 'news' && (
                <div className="px-4 py-3 space-y-2">
                  {news.length === 0 && <div className="py-12 text-center text-gray-600 text-sm">뉴스가 없습니다</div>}
                  {news.map(n => (
                    <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer"
                      className="flex gap-3 p-3 rounded-2xl hover:bg-white/5 transition-colors"
                      style={{ background: '#1C1C1E' }}>
                      {n.thumbnail && <img src={n.thumbnail} alt="" className="w-16 h-12 object-cover rounded-xl flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-snug line-clamp-2">{n.title}</div>
                        <div className="text-[11px] text-gray-600 mt-1.5">{n.publisher} · {relTime(n.publishedAt)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {/* 매매일지 탭 */}
              {tab === 'journal' && (
                <div className="px-4 py-3">
                  <button onClick={() => setShowJournalForm(true)}
                    className="w-full py-3 rounded-2xl text-sm font-semibold mb-4 transition-colors"
                    style={{ background: '#1C1C1E', color: '#fff' }}>
                    + 거래 기록
                  </button>

                  {showJournalForm && (
                    <div className="rounded-2xl p-4 mb-4" style={{ background: '#1C1C1E' }}>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                          <span className="text-xs text-gray-600">날짜</span>
                          <input type="date" value={jForm.trade_date} onChange={e => setJForm(p => ({ ...p, trade_date: e.target.value }))}
                            className="w-full mt-1 bg-white/5 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20" />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-600">구분</span>
                          <div className="flex gap-2 mt-1">
                            {['buy','sell'].map(t => (
                              <button key={t} onClick={() => setJForm(p => ({ ...p, trade_type: t as 'buy'|'sell' }))}
                                className={`flex-1 py-2 text-sm rounded-xl font-semibold transition-colors ${jForm.trade_type === t ? (t==='buy' ? 'bg-blue-500 text-white' : 'bg-[#FF3B30] text-white') : 'bg-white/5 text-gray-500'}`}>
                                {t === 'buy' ? '매수' : '매도'}
                              </button>
                            ))}
                          </div>
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-600">수량</span>
                          <input type="number" value={jForm.quantity} onChange={e => setJForm(p => ({ ...p, quantity: e.target.value }))}
                            placeholder="100" className="w-full mt-1 bg-white/5 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20" />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-600">단가</span>
                          <input type="number" value={jForm.price} onChange={e => setJForm(p => ({ ...p, price: e.target.value }))}
                            placeholder="83200" className="w-full mt-1 bg-white/5 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20" />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-600">수수료</span>
                          <input type="number" value={jForm.fee} onChange={e => setJForm(p => ({ ...p, fee: e.target.value }))}
                            placeholder="0" className="w-full mt-1 bg-white/5 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20" />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-600">메모</span>
                          <input value={jForm.memo} onChange={e => setJForm(p => ({ ...p, memo: e.target.value }))}
                            placeholder="메모" className="w-full mt-1 bg-white/5 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20" />
                        </label>
                      </div>
                      {jForm.quantity && jForm.price && (
                        <div className="mt-3 text-sm text-gray-400">
                          거래금액 <span className="font-bold text-white">{(parseInt(jForm.quantity) * parseFloat(jForm.price)).toLocaleString('ko-KR')}</span>
                        </div>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button onClick={saveJournal} className="flex-1 py-2.5 bg-white text-black text-sm font-bold rounded-xl">저장</button>
                        <button onClick={() => setShowJournalForm(false)} className="flex-1 py-2.5 bg-white/8 text-gray-400 text-sm rounded-xl">취소</button>
                      </div>
                    </div>
                  )}

                  {journal.length === 0 && !showJournalForm && <div className="py-8 text-center text-gray-600 text-sm">매매 기록이 없습니다</div>}
                  <div className="space-y-2">
                    {journal.map(j => (
                      <div key={j.id} className="flex items-center justify-between rounded-2xl px-3 py-3" style={{ background: '#1C1C1E' }}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${j.trade_type === 'buy' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                            {j.trade_type === 'buy' ? '매' : '도'}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{j.trade_date} · {j.quantity.toLocaleString()}주 × {j.price.toLocaleString('ko-KR')}</div>
                            <div className="text-xs text-gray-600">
                              합계 {(j.quantity * j.price).toLocaleString('ko-KR')}{j.memo ? ` · ${j.memo}` : ''}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => deleteJournal(j.id)} className="text-gray-700 hover:text-red-400 text-xs transition-colors">삭제</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 종가예측 탭 */}
              {tab === 'prediction' && (
                <div className="px-4 py-3">
                  <button onClick={() => setShowPredForm(true)}
                    className="w-full py-3 rounded-2xl text-sm font-semibold mb-4" style={{ background: '#1C1C1E', color: '#fff' }}>
                    + 오늘 종가 예측
                  </button>

                  {showPredForm && (
                    <div className="rounded-2xl p-4 mb-4" style={{ background: '#1C1C1E' }}>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                          <span className="text-xs text-gray-600">날짜</span>
                          <input type="date" value={pForm.prediction_date} onChange={e => setPForm(p => ({ ...p, prediction_date: e.target.value }))}
                            className="w-full mt-1 bg-white/5 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20" />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-600">예상 종가</span>
                          <input type="number" value={pForm.predicted_close} onChange={e => setPForm(p => ({ ...p, predicted_close: e.target.value }))}
                            placeholder="83500" className="w-full mt-1 bg-white/5 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20" />
                        </label>
                        <label className="col-span-2 block">
                          <span className="text-xs text-gray-600">방향</span>
                          <div className="flex gap-2 mt-1">
                            {[{v:'up',l:'📈 상승'},{v:'down',l:'📉 하락'},{v:'neutral',l:'➡️ 횡보'}].map(d => (
                              <button key={d.v} onClick={() => setPForm(p => ({ ...p, direction: d.v }))}
                                className={`flex-1 py-2 text-sm rounded-xl transition-colors ${pForm.direction === d.v ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-600'}`}>
                                {d.l}
                              </button>
                            ))}
                          </div>
                        </label>
                        <label className="col-span-2 block">
                          <span className="text-xs text-gray-600">예측 근거</span>
                          <input value={pForm.note} onChange={e => setPForm(p => ({ ...p, note: e.target.value }))}
                            placeholder="예측 근거를 입력하세요" className="w-full mt-1 bg-white/5 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-white/20" />
                        </label>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={savePrediction} className="flex-1 py-2.5 bg-white text-black text-sm font-bold rounded-xl">저장</button>
                        <button onClick={() => setShowPredForm(false)} className="flex-1 py-2.5 bg-white/8 text-gray-400 text-sm rounded-xl">취소</button>
                      </div>
                    </div>
                  )}

                  {/* 정확도 통계 */}
                  {predictions.filter(p => p.accuracy_pct !== null).length > 0 && (() => {
                    const w = predictions.filter(p => p.accuracy_pct !== null);
                    const avg = w.reduce((s, p) => s + (p.accuracy_pct ?? 0), 0) / w.length;
                    const hit = w.filter(p => (p.accuracy_pct ?? 0) >= 95).length / w.length * 100;
                    return (
                      <div className="rounded-2xl p-3 mb-3 grid grid-cols-3 gap-2" style={{ background: '#1C1C1E' }}>
                        <div className="text-center"><div className="text-lg font-black">{avg.toFixed(1)}%</div><div className="text-[10px] text-gray-600 mt-0.5">평균 정확도</div></div>
                        <div className="text-center"><div className="text-lg font-black">{hit.toFixed(0)}%</div><div className="text-[10px] text-gray-600 mt-0.5">±5% 적중률</div></div>
                        <div className="text-center"><div className="text-lg font-black">{w.length}</div><div className="text-[10px] text-gray-600 mt-0.5">기록 수</div></div>
                      </div>
                    );
                  })()}

                  {predictions.length === 0 && !showPredForm && <div className="py-8 text-center text-gray-600 text-sm">예측 기록이 없습니다</div>}
                  <div className="space-y-2">
                    {predictions.map(p => (
                      <div key={p.id} className="rounded-2xl px-3 py-3" style={{ background: '#1C1C1E' }}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{p.prediction_date}</span>
                            <span>{p.direction === 'up' ? '📈' : p.direction === 'down' ? '📉' : '➡️'}</span>
                            <span className="text-sm">예상 <span className="font-bold text-yellow-400">{p.predicted_close.toLocaleString('ko-KR')}</span></span>
                            {p.actual_close !== null && <span className="text-sm">실제 <span className={`font-bold ${p.actual_close >= p.predicted_close ? 'text-[#00C73C]' : 'text-[#FF3B30]'}`}>{p.actual_close.toLocaleString('ko-KR')}</span></span>}
                            {p.accuracy_pct !== null && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.accuracy_pct >= 95 ? 'bg-[#00C73C]/15 text-[#00C73C]' : p.accuracy_pct >= 85 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-[#FF3B30]/15 text-[#FF3B30]'}`}>
                                {p.accuracy_pct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          {p.actual_close === null && (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <input type="number" value={actualInput[p.id] || ''} onChange={e => setActualInput(prev => ({ ...prev, [p.id]: e.target.value }))}
                                placeholder="실제종가" className="w-24 bg-white/5 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none" />
                              <button onClick={() => updateActual(p)} className="bg-[#00C73C]/20 text-[#00C73C] text-xs px-2 py-1.5 rounded-lg font-medium">확인</button>
                            </div>
                          )}
                        </div>
                        {p.note && <div className="text-xs text-gray-600 mt-1.5">{p.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
