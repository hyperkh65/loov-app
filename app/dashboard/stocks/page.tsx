'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

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
interface JournalEntry { id: string; symbol: string; name: string; trade_date: string; trade_type: 'buy'|'sell'; quantity: number; price: number; fee: number; memo: string }
interface Prediction { id: string; symbol: string; prediction_date: string; predicted_close: number; actual_close: number|null; accuracy_pct: number|null; direction: string|null; note: string|null }
interface SearchResult { symbol: string; name: string; exchange: string; market: string }

// ── 상수 ─────────────────────────────────────────────────────────────────────
const INDICES = [
  { symbol: '^KS11', label: 'KOSPI' },
  { symbol: '^KQ11', label: 'KOSDAQ' },
  { symbol: '^GSPC', label: 'S&P500' },
  { symbol: '^IXIC', label: 'NASDAQ' },
];

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const isKR = (s: string) => s.endsWith('.KS') || s.endsWith('.KQ');
const fmtPrice = (p: number|undefined, sym: string) => {
  if (p == null) return '—';
  return isKR(sym) ? p.toLocaleString('ko-KR') + '원' : '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtPct = (p: number|undefined) => p == null ? '' : (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
const fmtVol = (v: number|undefined) => { if (!v) return '—'; if (v >= 1e8) return (v/1e8).toFixed(1)+'억'; if (v >= 1e4) return (v/1e4).toFixed(1)+'만'; return v.toLocaleString(); };
const fmtCap = (v: number|undefined) => { if (!v) return '—'; if (v >= 1e12) return (v/1e12).toFixed(1)+'T'; if (v >= 1e9) return (v/1e9).toFixed(1)+'B'; if (v >= 1e4) return (v/1e4).toFixed(0)+'억'; return v.toLocaleString(); };
const todayStr = () => new Date().toISOString().slice(0,10);
const relTime = (iso: string) => { if (!iso) return ''; const d = Date.now()-new Date(iso).getTime(); if (d<3600000) return Math.floor(d/60000)+'분 전'; if (d<86400000) return Math.floor(d/3600000)+'시간 전'; return Math.floor(d/86400000)+'일 전'; };
const upColor = (sym: string) => isKR(sym) ? '#F04452' : '#00D084';
const dnColor = (sym: string) => isKR(sym) ? '#1B6BFF' : '#F04452';

// ── 스파크라인 ────────────────────────────────────────────────────────────────
function Spark({ data, sym }: { data: number[]; sym: string }) {
  if (!data || data.length < 2) return <div className="w-14 h-7" />;
  const last = data[data.length - 1], first = data[0];
  const up = last >= first;
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const W = 56, H = 28;
  const pts = data.map((v, i) => `${(i/(data.length-1))*W},${H-((v-min)/rng)*(H-2)-1}`).join(' ');
  const color = up ? upColor(sym) : dnColor(sym);
  const gid = `s${Math.random().toString(36).slice(2)}`;
  return (
    <svg width={W} height={H} className="overflow-visible flex-shrink-0">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
        <stop offset="100%" stopColor={color} stopOpacity="0"/>
      </linearGradient></defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#${gid})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── lightweight-charts 캔들차트 ───────────────────────────────────────────────
function LWChart({ candles, symbol }: { candles: Candle[]; symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi|null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'>|null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'>|null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    import('lightweight-charts').then(({ createChart, CandlestickSeries, HistogramSeries }) => {
      if (!containerRef.current) return;
      const chart = createChart(containerRef.current, {
        layout: { background: { color: '#14141E' }, textColor: '#9999BB' },
        grid: { vertLines: { color: '#1E1E2E' }, horzLines: { color: '#1E1E2E' } },
        crosshair: { vertLine: { color: '#555577' }, horzLine: { color: '#555577' } },
        rightPriceScale: { borderColor: '#2A2A3E', scaleMargins: { top: 0.1, bottom: 0.25 } },
        timeScale: { borderColor: '#2A2A3E', timeVisible: true, secondsVisible: false },
        handleScroll: true,
        handleScale: true,
      });
      const up = upColor(symbol), dn = dnColor(symbol);
      const cs = chart.addSeries(CandlestickSeries, { upColor: up, downColor: dn, borderVisible: false, wickUpColor: up, wickDownColor: dn });
      const vs = chart.addSeries(HistogramSeries, { color: '#2A2A3E', priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      chartRef.current = chart;
      candleRef.current = cs;
      volRef.current = vs;
      const obs = new ResizeObserver(() => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight }); });
      obs.observe(containerRef.current);
      return () => { obs.disconnect(); };
    });
    return () => { chartRef.current?.remove(); chartRef.current = null; };
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!candleRef.current || !volRef.current || candles.length === 0) return;
    const up = upColor(symbol), dn = dnColor(symbol);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candleRef.current.setData(candles.map(c => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    volRef.current.setData(candles.map(c => ({ time: c.time as any, value: c.volume, color: c.close >= c.open ? up + '66' : dn + '66' })));
    chartRef.current?.timeScale().fitContent();
  }, [candles, symbol]);

  return <div ref={containerRef} className="w-full h-full" />;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function StocksPage() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [indices, setIndices] = useState<Record<string, Quote>>({});
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  const [selected, setSelected] = useState<string|null>(null);
  const [tab, setTab] = useState<'chart'|'news'|'journal'|'prediction'>('chart');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [cInterval, setCInterval] = useState('1d');
  const [cRange, setCRange] = useState('3mo');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [showJForm, setShowJForm] = useState(false);
  const [jForm, setJForm] = useState({ trade_date: todayStr(), trade_type: 'buy' as 'buy'|'sell', quantity: '', price: '', fee: '', memo: '' });
  const [showPForm, setShowPForm] = useState(false);
  const [pForm, setPForm] = useState({ prediction_date: todayStr(), predicted_close: '', direction: 'up', note: '' });
  const [actualInput, setActualInput] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  // ── 초기화 ──────────────────────────────────────────────────────────────
  useEffect(() => { loadWatchlist(); fetchIndices(); }, []);

  useEffect(() => {
    if (watchlist.length === 0) return;
    fetchQuotes(watchlist.map(w => w.symbol));
    fetchSparks();
    const iv = setInterval(() => fetchQuotes(watchlist.map(w => w.symbol)), 10000);
    return () => clearInterval(iv);
  }, [watchlist]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!selected) return; if (tab==='chart') loadChart(selected,cInterval,cRange); else if (tab==='news') loadNews(selected); else if (tab==='journal') loadJournal(selected); else loadPreds(selected); }, [selected, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected && tab==='chart') loadChart(selected,cInterval,cRange); }, [cInterval, cRange]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (showSearch) { setTimeout(()=>searchRef.current?.focus(),80); fetchSearch(''); } }, [showSearch]);

  // ── API ─────────────────────────────────────────────────────────────────
  const loadWatchlist = async () => {
    const res = await fetch('/api/stocks/watchlist');
    if (!res.ok) return;
    const data = await res.json() as WatchItem[];
    setWatchlist(data);
    if (data.length > 0) setSelected(prev => prev || data[0].symbol);
  };

  const fetchQuotes = useCallback(async (syms: string[]) => {
    if (!syms.length) return;
    const res = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(syms.join(','))}`);
    if (!res.ok) return;
    const data = await res.json() as Quote[];
    setQuotes(prev => { const m = { ...prev }; data.forEach(q => { m[q.symbol] = q; }); return m; });
  }, []);

  const fetchIndices = async () => {
    const syms = INDICES.map(i => i.symbol).join(',');
    const res = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(syms)}`);
    if (!res.ok) return;
    const data = await res.json() as Quote[];
    const m: Record<string, Quote> = {}; data.forEach(q => { m[q.symbol] = q; }); setIndices(m);
  };

  useEffect(() => { const iv = setInterval(fetchIndices, 30000); return () => clearInterval(iv); }, []);

  const fetchSparks = async () => {
    const m: Record<string, number[]> = {};
    await Promise.allSettled(watchlist.map(async w => {
      const res = await fetch(`/api/stocks/chart?symbol=${w.symbol}&interval=1d&range=1mo`);
      if (res.ok) { const d = await res.json() as Candle[]; m[w.symbol] = d.map(c => c.close); }
    }));
    setSparks(m);
  };

  const fetchSearch = async (q: string) => {
    const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
    if (res.ok) setSearchRes(await res.json() as SearchResult[]);
  };

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQ.trim()) { fetchSearch(''); return; }
    searchTimer.current = setTimeout(() => { setSearching(true); fetchSearch(searchQ).finally(()=>setSearching(false)); }, 300);
  }, [searchQ]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadChart = async (sym: string, interval: string, range: string) => {
    setLoadingChart(true); setCandles([]);
    const res = await fetch(`/api/stocks/chart?symbol=${sym}&interval=${interval}&range=${range}`);
    if (res.ok) setCandles(await res.json() as Candle[]);
    setLoadingChart(false);
  };
  const loadNews = async (sym: string) => { const res = await fetch(`/api/stocks/news?symbol=${sym}`); if (res.ok) setNews(await res.json() as NewsItem[]); };
  const loadJournal = async (sym: string) => { const res = await fetch(`/api/stocks/journal?symbol=${sym}`); if (res.ok) setJournal(await res.json() as JournalEntry[]); };
  const loadPreds = async (sym: string) => { const res = await fetch(`/api/stocks/prediction?symbol=${sym}`); if (res.ok) setPreds(await res.json() as Prediction[]); };

  const addStock = async (r: SearchResult) => {
    const res = await fetch('/api/stocks/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: r.symbol, name: r.name, market: r.market }) });
    if (res.ok) { setShowSearch(false); setSearchQ(''); await loadWatchlist(); setSelected(r.symbol); showToast(`${r.name} 추가됨`); }
    else { const e = await res.json(); showToast('오류: ' + (e.error||'추가 실패')); }
  };

  const removeStock = async (item: WatchItem) => {
    await fetch(`/api/stocks/watchlist/${item.id}`, { method: 'DELETE' });
    const next = watchlist.filter(w => w.id !== item.id);
    setWatchlist(next);
    if (selected === item.symbol) setSelected(next[0]?.symbol || null);
    showToast(item.name + ' 삭제됨');
  };

  const saveJournal = async () => {
    if (!selected || !jForm.quantity || !jForm.price) return;
    const wItem = watchlist.find(w => w.symbol === selected);
    const res = await fetch('/api/stocks/journal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: selected, name: wItem?.name||selected, trade_date: jForm.trade_date, trade_type: jForm.trade_type, quantity: parseInt(jForm.quantity), price: parseFloat(jForm.price), fee: parseFloat(jForm.fee||'0'), memo: jForm.memo }) });
    if (res.ok) { setShowJForm(false); setJForm({trade_date:todayStr(),trade_type:'buy',quantity:'',price:'',fee:'',memo:''}); loadJournal(selected); showToast('거래 기록됨'); }
  };

  const deleteJournal = async (id: string) => {
    if (!confirm('삭제할까요?')) return;
    await fetch(`/api/stocks/journal/${id}`, { method: 'DELETE' });
    if (selected) loadJournal(selected);
  };

  const savePred = async () => {
    if (!selected || !pForm.predicted_close) return;
    const wItem = watchlist.find(w => w.symbol === selected);
    const res = await fetch('/api/stocks/prediction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: selected, name: wItem?.name||selected, prediction_date: pForm.prediction_date, predicted_close: parseFloat(pForm.predicted_close), direction: pForm.direction, note: pForm.note }) });
    if (res.ok) { setShowPForm(false); setPForm({prediction_date:todayStr(),predicted_close:'',direction:'up',note:''}); loadPreds(selected); showToast('예측 기록됨'); }
  };

  const updateActual = async (pred: Prediction) => {
    const v = actualInput[pred.id]; if (!v) return;
    const res = await fetch('/api/stocks/prediction', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pred.id, actual_close: parseFloat(v) }) });
    if (res.ok) { setActualInput(p => { const n={...p}; delete n[pred.id]; return n; }); if (selected) loadPreds(selected); showToast('실제 종가 기록됨'); }
  };

  const calcPortfolio = (sym: string) => {
    const entries = journal.filter(j => j.symbol === sym);
    let shares = 0, totalCost = 0;
    entries.forEach(e => { if (e.trade_type==='buy') { shares += e.quantity; totalCost += e.quantity*e.price+(e.fee||0); } else shares -= e.quantity; });
    if (shares <= 0) return null;
    const sellQ = entries.filter(e=>e.trade_type==='sell').reduce((s,e)=>s+e.quantity,0);
    const avgCost = totalCost / ((shares+sellQ)||1);
    const cur = quotes[sym]?.regularMarketPrice;
    return { shares, avgCost, pnl: cur?(cur-avgCost)*shares:null, pnlPct: cur?((cur-avgCost)/avgCost)*100:null };
  };

  const sq = selected ? quotes[selected] : null;
  const chg = sq?.regularMarketChange ?? 0;
  const isUp = chg >= 0;
  const uc = selected ? upColor(selected) : '#00D084';
  const dc = selected ? dnColor(selected) : '#F04452';
  const priceColor = isUp ? uc : dc;
  const selName = watchlist.find(w => w.symbol === selected)?.name || selected || '';
  const portfolio = selected && journal.length > 0 ? calcPortfolio(selected) : null;

  const CHART_OPTS = [
    {i:'5m',r:'5d',l:'5분'},{i:'15m',r:'5d',l:'15분'},{i:'1h',r:'1mo',l:'1시간'},
    {i:'1d',r:'3mo',l:'일봉'},{i:'1d',r:'1y',l:'1년'},{i:'1wk',r:'2y',l:'주봉'},{i:'1mo',r:'5y',l:'월봉'},
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0F0F17', color: '#FFFFFF' }}>

      {/* 토스트 */}
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-white text-gray-900 px-5 py-2.5 rounded-full text-sm font-semibold shadow-2xl">{toast}</div>}

      {/* 검색 모달 */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex flex-col items-center pt-14 px-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
          onClick={e => { if (e.target===e.currentTarget) { setShowSearch(false); setSearchQ(''); } }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#1C1C2A' }}>
            <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid #2A2A3E' }}>
              <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#666688' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input ref={searchRef} value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="종목명 또는 코드 (예: 삼성전자, AAPL)"
                className="flex-1 bg-transparent text-white text-[15px] placeholder-gray-600 focus:outline-none"/>
              {searching && <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin"/>}
              <button onClick={() => { setShowSearch(false); setSearchQ(''); }} style={{ color: '#5555FF', fontSize: 14, fontWeight: 600 }}>닫기</button>
            </div>
            <div className="max-h-[380px] overflow-y-auto">
              {!searchQ && <div className="px-4 pt-3 pb-1 text-[11px] font-bold tracking-widest uppercase" style={{ color: '#555577' }}>인기 종목</div>}
              {searchRes.map(r => (
                <button key={r.symbol} onClick={() => addStock(r)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${r.market==='KR' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                    {r.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold">{r.name}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: '#555577' }}>{r.symbol} · {r.exchange}</div>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg flex-shrink-0 ${r.market==='KR' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                    {r.market==='KR' ? '국내' : '미국'}
                  </span>
                </button>
              ))}
              {searchRes.length===0 && searchQ && !searching && <div className="py-10 text-center text-sm" style={{ color: '#555577' }}>검색 결과 없음</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── 시장 지수 바 ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-4 px-4 py-2 overflow-x-auto" style={{ background: '#13131D', borderBottom: '1px solid #1E1E2E' }}>
        {INDICES.map(idx => {
          const q = indices[idx.symbol];
          const up = (q?.regularMarketChange ?? 0) >= 0;
          return (
            <div key={idx.symbol} className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[12px] font-bold" style={{ color: '#777799' }}>{idx.label}</span>
              <span className="text-[13px] font-bold tabular-nums">
                {q ? (idx.symbol.startsWith('^K') ? q.regularMarketPrice?.toLocaleString('ko-KR') : q.regularMarketPrice?.toLocaleString('en-US', { minimumFractionDigits: 2 })) : '—'}
              </span>
              {q && <span className={`text-[11px] font-semibold`} style={{ color: up ? '#F04452' : '#4B8FFF' }}>{fmtPct(q.regularMarketChangePercent)}</span>}
            </div>
          );
        })}
        <div className="flex-1" />
        <button onClick={() => setShowSearch(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-semibold flex-shrink-0 transition-colors hover:opacity-80"
          style={{ background: '#1E1E2E', color: '#AAAACC' }}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          종목 추가
        </button>
      </div>

      {/* ── 메인 레이아웃 ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 왼쪽 관심종목 ────────────────────────────────────────────── */}
        <div className="flex-shrink-0 w-48 flex flex-col overflow-y-auto" style={{ background: '#13131D', borderRight: '1px solid #1E1E2E' }}>
          <div className="px-3 pt-3 pb-1.5">
            <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: '#444466' }}>관심종목</span>
          </div>
          {watchlist.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 text-center py-8">
              <div className="text-3xl opacity-30">📊</div>
              <p className="text-[12px]" style={{ color: '#555577' }}>종목을 추가해보세요</p>
              <button onClick={() => setShowSearch(true)} className="text-[12px] px-3 py-1.5 rounded-lg mt-1" style={{ background: '#1E1E2E', color: '#AAAACC' }}>+ 추가</button>
            </div>
          ) : (
            <div className="pb-2">
              {watchlist.map(w => {
                const q = quotes[w.symbol];
                const up = (q?.regularMarketChange ?? 0) >= 0;
                const isSel = selected === w.symbol;
                return (
                  <div key={w.symbol} onClick={() => { setSelected(w.symbol); setTab('chart'); }}
                    className="group relative cursor-pointer px-3 py-2.5 transition-colors"
                    style={{ background: isSel ? '#1E1E2E' : 'transparent' }}>
                    {isSel && <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: '#5555FF' }} />}
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="min-w-0 flex-1 pr-1">
                        <div className="text-[13px] font-bold truncate">{w.name}</div>
                        <div className="text-[10px] mt-0.5 truncate" style={{ color: '#444466' }}>
                          {w.symbol.endsWith('.KS') ? 'KOSPI' : w.symbol.endsWith('.KQ') ? 'KOSDAQ' : 'NASDAQ/NYSE'}
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); removeStock(w); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] flex-shrink-0 mt-0.5" style={{ color: '#444466' }}>✕</button>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[14px] font-black tabular-nums leading-none">
                          {q?.regularMarketPrice != null
                            ? (isKR(w.symbol) ? q.regularMarketPrice.toLocaleString('ko-KR') : '$' + q.regularMarketPrice.toFixed(2))
                            : <span style={{ color: '#444466' }}>—</span>}
                        </div>
                        <div className="text-[11px] font-semibold mt-0.5" style={{ color: up ? upColor(w.symbol) : dnColor(w.symbol) }}>
                          {q ? fmtPct(q.regularMarketChangePercent) : ''}
                        </div>
                      </div>
                      <Spark data={sparks[w.symbol] || []} sym={w.symbol} />
                    </div>
                  </div>
                );
              })}
              <button onClick={() => setShowSearch(true)} className="w-full py-2 text-[12px] transition-colors" style={{ color: '#444466' }}>
                + 종목 추가
              </button>
            </div>
          )}
        </div>

        {/* ── 오른쪽 상세 ──────────────────────────────────────────────── */}
        {!selected ? (
          <div className="flex-1 flex items-center justify-center" style={{ color: '#333355' }}>
            <div className="text-center"><div className="text-5xl mb-3 opacity-20">📈</div><div className="text-sm">왼쪽에서 종목을 선택하세요</div></div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* 종목 헤더 */}
            <div className="flex-shrink-0 px-6 pt-5 pb-4" style={{ borderBottom: '1px solid #1E1E2E', background: '#13131D' }}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                {/* 왼쪽: 이름 + 지표 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-[18px] font-black">{sq?.shortName || sq?.longName || selName}</h2>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#1E1E2E', color: '#777799' }}>{selected}</span>
                    {sq?.marketState && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: sq.marketState==='REGULAR' ? '#00D08420' : '#33334A', color: sq.marketState==='REGULAR' ? '#00D084' : '#777799' }}>
                        {sq.marketState==='REGULAR' ? '● 장중' : sq.marketState==='PRE' ? '프리마켓' : sq.marketState==='POST' ? '애프터' : '장마감'}
                      </span>
                    )}
                  </div>
                  {/* 현재가 */}
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-[36px] font-black tabular-nums leading-none" style={{ color: priceColor }}>
                      {sq?.regularMarketPrice != null
                        ? (isKR(selected) ? sq.regularMarketPrice.toLocaleString('ko-KR') + '원' : '$' + sq.regularMarketPrice.toFixed(2))
                        : <span style={{ color: '#333355' }}>—</span>}
                    </span>
                    {sq && sq.regularMarketChange != null && (
                      <span className="text-[16px] font-bold" style={{ color: priceColor }}>
                        {chg >= 0 ? '+' : ''}{isKR(selected) ? Math.round(chg).toLocaleString('ko-KR') : chg.toFixed(2)}
                        &nbsp;({fmtPct(sq.regularMarketChangePercent)})
                      </span>
                    )}
                    {sq?.previousClose != null && (
                      <span className="text-[12px]" style={{ color: '#555577' }}>전일 {fmtPrice(sq.previousClose, selected)}</span>
                    )}
                  </div>
                  {/* 52주 범위 바 */}
                  {sq?.fiftyTwoWeekLow != null && sq?.fiftyTwoWeekHigh != null && sq?.regularMarketPrice != null && (() => {
                    const low = sq.fiftyTwoWeekLow!, high = sq.fiftyTwoWeekHigh!, cur = sq.regularMarketPrice!;
                    const pct = Math.min(100, Math.max(0, (cur - low) / (high - low) * 100));
                    return (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px]" style={{ color: dnColor(selected) }}>{fmtPrice(low, selected)}</span>
                        <div className="flex-1 h-1 rounded-full relative" style={{ background: '#2A2A3E' }}>
                          <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: pct+'%', background: 'linear-gradient(to right, '+dnColor(selected)+', '+upColor(selected)+')' }}/>
                          <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white" style={{ left: `calc(${pct}% - 4px)` }}/>
                        </div>
                        <span className="text-[11px]" style={{ color: upColor(selected) }}>{fmtPrice(high, selected)}</span>
                        <span className="text-[11px]" style={{ color: '#555577' }}>52주</span>
                      </div>
                    );
                  })()}
                </div>

                {/* 오른쪽: 지표 그리드 */}
                <div className="grid grid-cols-2 gap-2 flex-shrink-0">
                  {[
                    { l: '시가', v: fmtPrice(sq?.regularMarketOpen, selected), c: '' },
                    { l: '고가', v: fmtPrice(sq?.regularMarketDayHigh, selected), c: upColor(selected) },
                    { l: '저가', v: fmtPrice(sq?.regularMarketDayLow, selected), c: dnColor(selected) },
                    { l: '거래량', v: fmtVol(sq?.regularMarketVolume), c: '' },
                    { l: '시가총액', v: fmtCap(sq?.marketCap), c: '' },
                    { l: '통화', v: sq?.currency || '—', c: '' },
                  ].map(item => (
                    <div key={item.l} className="rounded-xl px-3 py-2" style={{ background: '#1E1E2E', minWidth: 90 }}>
                      <div className="text-[10px] font-semibold mb-1" style={{ color: '#444466' }}>{item.l}</div>
                      <div className="text-[13px] font-bold tabular-nums" style={{ color: item.c || '#FFFFFF' }}>{item.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 포트폴리오 */}
              {portfolio && (
                <div className="mt-3 flex items-center justify-between rounded-xl px-4 py-2.5" style={{ background: '#1E1E2E' }}>
                  <div className="flex gap-4 text-[12px]" style={{ color: '#777799' }}>
                    <span>보유 <b className="text-white">{portfolio.shares}주</b></span>
                    <span>평균 <b className="text-white">{fmtPrice(portfolio.avgCost, selected)}</b></span>
                  </div>
                  {portfolio.pnl != null && (
                    <div className="text-[14px] font-black" style={{ color: portfolio.pnl >= 0 ? upColor(selected) : dnColor(selected) }}>
                      {portfolio.pnl >= 0 ? '+' : ''}{isKR(selected) ? Math.round(portfolio.pnl).toLocaleString('ko-KR')+'원' : '$'+portfolio.pnl.toFixed(2)}
                      <span className="text-[12px] ml-1">({portfolio.pnlPct!>=0?'+':''}{portfolio.pnlPct!.toFixed(2)}%)</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 탭 */}
            <div className="flex-shrink-0 flex px-6 gap-5" style={{ background: '#13131D', borderBottom: '1px solid #1E1E2E' }}>
              {[{id:'chart',l:'차트'},{id:'news',l:'뉴스'},{id:'journal',l:'매매일지'},{id:'prediction',l:'종가예측'}].map(t => (
                <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
                  className="py-3 text-[14px] font-bold border-b-2 -mb-px transition-colors"
                  style={{ borderColor: tab===t.id ? '#5555FF' : 'transparent', color: tab===t.id ? '#FFFFFF' : '#555577' }}>
                  {t.l}
                </button>
              ))}
            </div>

            {/* 탭 콘텐츠 */}
            <div className="flex-1 overflow-y-auto" style={{ background: '#14141E' }}>

              {/* 차트 */}
              {tab === 'chart' && (
                <div className="flex flex-col h-full">
                  <div className="flex-shrink-0 flex items-center gap-1.5 px-4 pt-3 pb-2 flex-wrap">
                    {CHART_OPTS.map(o => (
                      <button key={o.i+o.r} onClick={() => { setCInterval(o.i); setCRange(o.r); }}
                        className="px-3 py-1 text-[12px] font-semibold rounded-lg transition-colors"
                        style={{ background: cInterval===o.i&&cRange===o.r ? '#5555FF' : '#1E1E2E', color: cInterval===o.i&&cRange===o.r ? '#FFFFFF' : '#666688' }}>
                        {o.l}
                      </button>
                    ))}
                    {loadingChart && <div className="w-4 h-4 border-2 border-gray-700 border-t-blue-400 rounded-full animate-spin ml-1"/>}
                  </div>
                  <div className="flex-1 min-h-0 px-2 pb-2">
                    {candles.length > 0
                      ? <LWChart candles={candles} symbol={selected} />
                      : <div className="flex items-center justify-center h-full text-[13px]" style={{ color: '#333355' }}>
                          {loadingChart ? '차트 로딩중...' : '데이터 없음'}
                        </div>}
                  </div>
                </div>
              )}

              {/* 뉴스 */}
              {tab === 'news' && (
                <div className="p-4 space-y-2">
                  {news.length === 0 && <div className="py-12 text-center text-[13px]" style={{ color: '#333355' }}>뉴스가 없습니다</div>}
                  {news.map(n => (
                    <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer"
                      className="flex gap-3 p-3.5 rounded-2xl transition-colors hover:opacity-80"
                      style={{ background: '#1C1C2A' }}>
                      {n.thumbnail && <img src={n.thumbnail} alt="" className="w-16 h-12 object-cover rounded-xl flex-shrink-0"/>}
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold leading-snug line-clamp-2">{n.title}</div>
                        <div className="text-[11px] mt-1.5" style={{ color: '#555577' }}>{n.publisher} · {relTime(n.publishedAt)}</div>
                      </div>
                      <svg className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: '#333355' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                    </a>
                  ))}
                </div>
              )}

              {/* 매매일지 */}
              {tab === 'journal' && (
                <div className="p-4">
                  <button onClick={() => setShowJForm(v => !v)}
                    className="w-full py-3 rounded-2xl text-[14px] font-bold mb-4 transition-colors hover:opacity-80"
                    style={{ background: '#5555FF', color: '#FFFFFF' }}>
                    {showJForm ? '취소' : '+ 거래 기록'}
                  </button>
                  {showJForm && (
                    <div className="rounded-2xl p-4 mb-4" style={{ background: '#1C1C2A' }}>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { l:'날짜', el: <input type="date" value={jForm.trade_date} onChange={e=>setJForm(p=>({...p,trade_date:e.target.value}))} className="w-full rounded-xl px-3 py-2 text-[13px] focus:outline-none" style={{background:'#14141E',color:'#fff',border:'1px solid #2A2A3E'}}/> },
                          { l:'구분', el: <div className="flex gap-2">{['buy','sell'].map(t=><button key={t} onClick={()=>setJForm(p=>({...p,trade_type:t as 'buy'|'sell'}))} className="flex-1 py-2 text-[13px] font-bold rounded-xl" style={{background:jForm.trade_type===t?(t==='buy'?'#5555FF':'#F04452'):'#14141E',color:'#fff',border:'1px solid #2A2A3E'}}>{t==='buy'?'매수':'매도'}</button>)}</div> },
                          { l:'수량', el: <input type="number" value={jForm.quantity} onChange={e=>setJForm(p=>({...p,quantity:e.target.value}))} placeholder="100" className="w-full rounded-xl px-3 py-2 text-[13px] focus:outline-none" style={{background:'#14141E',color:'#fff',border:'1px solid #2A2A3E'}}/> },
                          { l:'단가', el: <input type="number" value={jForm.price} onChange={e=>setJForm(p=>({...p,price:e.target.value}))} placeholder="55400" className="w-full rounded-xl px-3 py-2 text-[13px] focus:outline-none" style={{background:'#14141E',color:'#fff',border:'1px solid #2A2A3E'}}/> },
                          { l:'수수료', el: <input type="number" value={jForm.fee} onChange={e=>setJForm(p=>({...p,fee:e.target.value}))} placeholder="0" className="w-full rounded-xl px-3 py-2 text-[13px] focus:outline-none" style={{background:'#14141E',color:'#fff',border:'1px solid #2A2A3E'}}/> },
                          { l:'메모', el: <input value={jForm.memo} onChange={e=>setJForm(p=>({...p,memo:e.target.value}))} placeholder="메모" className="w-full rounded-xl px-3 py-2 text-[13px] focus:outline-none" style={{background:'#14141E',color:'#fff',border:'1px solid #2A2A3E'}}/> },
                        ].map(item => (
                          <div key={item.l}>
                            <div className="text-[11px] font-semibold mb-1" style={{ color: '#555577' }}>{item.l}</div>
                            {item.el}
                          </div>
                        ))}
                      </div>
                      {jForm.quantity && jForm.price && (
                        <div className="mt-3 text-[13px]" style={{ color: '#777799' }}>
                          거래금액 <span className="font-black text-white">{(parseInt(jForm.quantity)*parseFloat(jForm.price)).toLocaleString('ko-KR')}</span>
                          {isKR(selected) ? '원' : '$'}
                        </div>
                      )}
                      <button onClick={saveJournal} className="w-full mt-3 py-3 rounded-xl text-[14px] font-black" style={{ background: '#5555FF', color: '#fff' }}>저장</button>
                    </div>
                  )}
                  {journal.length === 0 && !showJForm && <div className="py-10 text-center text-[13px]" style={{ color: '#333355' }}>매매 기록이 없습니다</div>}
                  <div className="space-y-2">
                    {journal.map(j => (
                      <div key={j.id} className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: '#1C1C2A' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-black flex-shrink-0"
                            style={{ background: j.trade_type==='buy' ? '#5555FF22' : '#F0445222', color: j.trade_type==='buy' ? '#7777FF' : '#F04452' }}>
                            {j.trade_type==='buy'?'매':'도'}
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold">{j.trade_date} · {j.quantity.toLocaleString()}주 × {j.price.toLocaleString('ko-KR')}</div>
                            <div className="text-[11px] mt-0.5" style={{ color: '#555577' }}>합계 {(j.quantity*j.price).toLocaleString('ko-KR')}{j.memo ? ` · ${j.memo}` : ''}</div>
                          </div>
                        </div>
                        <button onClick={() => deleteJournal(j.id)} className="text-[11px] transition-colors hover:text-red-400" style={{ color: '#333355' }}>삭제</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 종가예측 */}
              {tab === 'prediction' && (
                <div className="p-4">
                  <button onClick={() => setShowPForm(v => !v)}
                    className="w-full py-3 rounded-2xl text-[14px] font-bold mb-4 hover:opacity-80"
                    style={{ background: '#7733EE', color: '#FFFFFF' }}>
                    {showPForm ? '취소' : '+ 오늘 종가 예측'}
                  </button>
                  {showPForm && (
                    <div className="rounded-2xl p-4 mb-4" style={{ background: '#1C1C2A' }}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[11px] font-semibold mb-1" style={{ color: '#555577' }}>날짜</div>
                          <input type="date" value={pForm.prediction_date} onChange={e=>setPForm(p=>({...p,prediction_date:e.target.value}))} className="w-full rounded-xl px-3 py-2 text-[13px] focus:outline-none" style={{background:'#14141E',color:'#fff',border:'1px solid #2A2A3E'}}/>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold mb-1" style={{ color: '#555577' }}>예상 종가</div>
                          <input type="number" value={pForm.predicted_close} onChange={e=>setPForm(p=>({...p,predicted_close:e.target.value}))} placeholder="55400" className="w-full rounded-xl px-3 py-2 text-[13px] focus:outline-none" style={{background:'#14141E',color:'#fff',border:'1px solid #2A2A3E'}}/>
                        </div>
                        <div className="col-span-2">
                          <div className="text-[11px] font-semibold mb-1" style={{ color: '#555577' }}>방향</div>
                          <div className="flex gap-2">
                            {[{v:'up',l:'📈 상승'},{v:'down',l:'📉 하락'},{v:'neutral',l:'➡️ 횡보'}].map(d=>(
                              <button key={d.v} onClick={()=>setPForm(p=>({...p,direction:d.v}))} className="flex-1 py-2 text-[12px] font-semibold rounded-xl" style={{background:pForm.direction===d.v?'#7733EE':'#14141E',color:'#fff',border:'1px solid #2A2A3E'}}>{d.l}</button>
                            ))}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-[11px] font-semibold mb-1" style={{ color: '#555577' }}>예측 근거</div>
                          <input value={pForm.note} onChange={e=>setPForm(p=>({...p,note:e.target.value}))} placeholder="예측 근거를 입력하세요" className="w-full rounded-xl px-3 py-2 text-[13px] focus:outline-none" style={{background:'#14141E',color:'#fff',border:'1px solid #2A2A3E'}}/>
                        </div>
                      </div>
                      <button onClick={savePred} className="w-full mt-3 py-3 rounded-xl text-[14px] font-black" style={{ background: '#7733EE', color: '#fff' }}>저장</button>
                    </div>
                  )}
                  {preds.filter(p=>p.accuracy_pct!==null).length > 0 && (() => {
                    const w = preds.filter(p=>p.accuracy_pct!==null);
                    const avg = w.reduce((s,p)=>s+(p.accuracy_pct??0),0)/w.length;
                    const hit = w.filter(p=>(p.accuracy_pct??0)>=95).length/w.length*100;
                    return (
                      <div className="rounded-2xl p-4 mb-4 grid grid-cols-3 gap-3 text-center" style={{ background: '#1C1C2A' }}>
                        <div><div className="text-[20px] font-black">{avg.toFixed(1)}%</div><div className="text-[10px] mt-0.5" style={{ color: '#555577' }}>평균 정확도</div></div>
                        <div><div className="text-[20px] font-black">{hit.toFixed(0)}%</div><div className="text-[10px] mt-0.5" style={{ color: '#555577' }}>±5% 적중률</div></div>
                        <div><div className="text-[20px] font-black">{w.length}</div><div className="text-[10px] mt-0.5" style={{ color: '#555577' }}>기록 수</div></div>
                      </div>
                    );
                  })()}
                  {preds.length === 0 && !showPForm && <div className="py-10 text-center text-[13px]" style={{ color: '#333355' }}>예측 기록이 없습니다</div>}
                  <div className="space-y-2">
                    {preds.map(p => (
                      <div key={p.id} className="rounded-2xl px-4 py-3" style={{ background: '#1C1C2A' }}>
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="text-[13px] font-semibold">{p.prediction_date}</span>
                          <span>{p.direction==='up'?'📈':p.direction==='down'?'📉':'➡️'}</span>
                          <span className="text-[13px]">예상 <b style={{ color: '#FFB74D' }}>{p.predicted_close.toLocaleString('ko-KR')}</b></span>
                          {p.actual_close!=null && <span className="text-[13px]">실제 <b style={{ color: p.actual_close>=p.predicted_close?upColor(selected):dnColor(selected) }}>{p.actual_close.toLocaleString('ko-KR')}</b></span>}
                          {p.accuracy_pct!=null && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-black"
                              style={{ background: p.accuracy_pct>=95?upColor(selected)+'22':p.accuracy_pct>=85?'#FFB74D22':'#F0445222', color: p.accuracy_pct>=95?upColor(selected):p.accuracy_pct>=85?'#FFB74D':dnColor(selected) }}>
                              {p.accuracy_pct.toFixed(1)}%
                            </span>
                          )}
                          {p.actual_close===null && (
                            <div className="flex items-center gap-1.5 ml-auto">
                              <input type="number" value={actualInput[p.id]||''} onChange={e=>setActualInput(prev=>({...prev,[p.id]:e.target.value}))} placeholder="실제종가" className="w-24 rounded-lg px-2 py-1 text-[12px] focus:outline-none" style={{background:'#14141E',color:'#fff',border:'1px solid #2A2A3E'}}/>
                              <button onClick={()=>updateActual(p)} className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{background:'#00D08422',color:'#00D084'}}>확인</button>
                            </div>
                          )}
                        </div>
                        {p.note && <div className="text-[11px] mt-1.5" style={{ color: '#555577' }}>{p.note}</div>}
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
