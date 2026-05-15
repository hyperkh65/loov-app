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
  fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number; marketCap?: number | null;
}
interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
interface NewsItem { id: string; title: string; publisher: string; link: string; publishedAt: string; thumbnail: string | null }
interface JournalEntry { id: string; symbol: string; name: string; trade_date: string; trade_type: 'buy'|'sell'; quantity: number; price: number; fee: number; memo: string }
interface Prediction { id: string; symbol: string; prediction_date: string; predicted_close: number; actual_close: number|null; accuracy_pct: number|null; direction: string|null; note: string|null }
interface SearchResult { symbol: string; name: string; exchange: string; market: string }

// ── 상수 ────────────────────────────────────────────────────────────────────
const INDICES = [
  { symbol: '^KS11', label: 'KOSPI', isKr: true },
  { symbol: '^KQ11', label: 'KOSDAQ', isKr: true },
  { symbol: '^GSPC', label: 'S&P500', isKr: false },
  { symbol: '^IXIC', label: 'NASDAQ', isKr: false },
];
const CHART_OPTS = [
  {i:'5m',r:'5d',l:'5분'},{i:'15m',r:'5d',l:'15분'},{i:'1h',r:'1mo',l:'1시간'},
  {i:'1d',r:'3mo',l:'3개월'},{i:'1d',r:'1y',l:'1년'},{i:'1wk',r:'2y',l:'주봉'},{i:'1mo',r:'5y',l:'월봉'},
];

// ── 유틸 ────────────────────────────────────────────────────────────────────
const isKR = (s: string) => s.endsWith('.KS') || s.endsWith('.KQ');
const fmtP = (p: number|undefined, sym: string) => {
  if (p == null) return '—';
  return isKR(sym) ? p.toLocaleString('ko-KR')+'원' : '$'+p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
};
const fmtPct = (p: number|undefined) => p==null?'':(p>=0?'+':'')+p.toFixed(2)+'%';
const fmtVol = (v: number|undefined) => { if(!v) return '—'; if(v>=1e8) return (v/1e8).toFixed(1)+'억'; if(v>=1e4) return (v/1e4).toFixed(1)+'만'; return v.toLocaleString(); };
const todayStr = () => new Date().toISOString().slice(0,10);
const relTime = (iso: string) => { if(!iso) return ''; const d=Date.now()-new Date(iso).getTime(); if(d<3600000) return Math.floor(d/60000)+'분 전'; if(d<86400000) return Math.floor(d/3600000)+'시간 전'; return Math.floor(d/86400000)+'일 전'; };
const upC = (sym: string) => isKR(sym) ? '#F04452' : '#00B147';
const dnC = (sym: string) => isKR(sym) ? '#4B6FE4' : '#F04452';

// ── 스파크라인 ───────────────────────────────────────────────────────────────
function Spark({ data, sym }: { data: number[]; sym: string }) {
  if (!data || data.length < 2) return <div style={{width:56,height:28}}/>;
  const up = data[data.length-1] >= data[0];
  const min = Math.min(...data), max = Math.max(...data), rng = max-min||1;
  const W=56, H=28;
  const pts = data.map((v,i)=>`${(i/(data.length-1))*W},${H-((v-min)/rng)*(H-4)-2}`).join(' ');
  const color = up ? upC(sym) : dnC(sym);
  const gid = `sg${Math.random().toString(36).slice(2)}`;
  const lastX = W, lastY = H-((data[data.length-1]-min)/rng)*(H-4)-2;
  return (
    <svg width={W} height={H} style={{overflow:'visible',flexShrink:0}}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
        <stop offset="100%" stopColor={color} stopOpacity="0"/>
      </linearGradient></defs>
      <polygon points={`0,${H} ${pts} ${lastX},${H}`} fill={`url(#${gid})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

// ── 캔들차트 ─────────────────────────────────────────────────────────────────
function CandleChart({ candles, symbol }: { candles: Candle[]; symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const destroyRef = useRef<(()=>void)|null>(null);

  useEffect(() => {
    destroyRef.current?.();
    destroyRef.current = null;
    if (!ref.current || !candles.length) return;
    const el = ref.current;

    import('lightweight-charts').then(({ createChart, CandlestickSeries, HistogramSeries }) => {
      if (!el) return;
      const w = el.clientWidth || el.offsetWidth || 600;
      const h = el.clientHeight || el.offsetHeight || 400;
      const up = upC(symbol), dn = dnC(symbol);
      const chart = createChart(el, {
        width: w, height: h,
        layout: { background: { color: '#FFFFFF' }, textColor: '#888888' },
        grid: { vertLines: { color: '#F3F4F6' }, horzLines: { color: '#F3F4F6' } },
        crosshair: { vertLine: { color: '#CCCCCC' }, horzLine: { color: '#CCCCCC' } },
        rightPriceScale: { borderColor: '#E5E7EB', scaleMargins: { top: 0.1, bottom: 0.22 } },
        timeScale: { borderColor: '#E5E7EB', timeVisible: true, secondsVisible: false },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: { mouseWheel: true, pinch: true },
      });
      const cs = chart.addSeries(CandlestickSeries, { upColor: up, downColor: dn, borderVisible: false, wickUpColor: up, wickDownColor: dn });
      const vs = chart.addSeries(HistogramSeries, { color: '#DDDDDD', priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cs.setData(candles.map(c=>({time:c.time as any,open:c.open,high:c.high,low:c.low,close:c.close})));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vs.setData(candles.map(c=>({time:c.time as any,value:c.volume,color:c.close>=c.open?up+'55':dn+'55'})));
      chart.timeScale().fitContent();

      const obs = new ResizeObserver(() => {
        if (el) chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      });
      obs.observe(el);
      destroyRef.current = () => { obs.disconnect(); chart.remove(); };
    });

    return () => { destroyRef.current?.(); destroyRef.current = null; };
  }, [candles, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} style={{ width: '100%', height: '100%', minHeight: 380 }} />;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
export default function StocksPage() {
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string,Quote>>({});
  const [indices, setIndices] = useState<Record<string,Quote>>({});
  const [sparks, setSparks] = useState<Record<string,number[]>>({});
  const [selected, setSelected] = useState<string|null>(null);
  const [tab, setTab] = useState<'chart'|'news'|'journal'|'prediction'>('chart');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [cI, setCI] = useState('1d'); const [cR, setCR] = useState('3mo');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const stRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const sInputRef = useRef<HTMLInputElement>(null);
  const [showJF, setShowJF] = useState(false);
  const [jF, setJF] = useState({trade_date:todayStr(),trade_type:'buy' as 'buy'|'sell',quantity:'',price:'',fee:'',memo:''});
  const [showPF, setShowPF] = useState(false);
  const [pF, setPF] = useState({prediction_date:todayStr(),predicted_close:'',direction:'up',note:''});
  const [actualInput, setActualInput] = useState<Record<string,string>>({});
  const [toast, setToast] = useState('');
  const showToast = (m:string) => { setToast(m); setTimeout(()=>setToast(''),2500); };
  const lastUpdatedRef = useRef<Date|null>(null);
  const [secAgo, setSecAgo] = useState<number|null>(null);
  const markUpdated = () => { lastUpdatedRef.current=new Date(); setSecAgo(0); };

  // ── 초기화 ──────────────────────────────────────────────────────────────
  useEffect(() => { loadWL(); fetchIdx(); }, []);
  useEffect(() => {
    if (!watchlist.length) return;
    fetchQ(watchlist.map(w=>w.symbol)); loadSparks();
    const iv = setInterval(()=>fetchQ(watchlist.map(w=>w.symbol)), 5000);
    return ()=>clearInterval(iv);
  }, [watchlist]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if(!selected) return; if(tab==='chart') loadChart(selected,cI,cR); else if(tab==='news') loadNews(selected); else if(tab==='journal') loadJournal(selected); else loadPreds(selected); }, [selected,tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if(selected&&tab==='chart') loadChart(selected,cI,cR); }, [cI,cR]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if(showSearch){setTimeout(()=>sInputRef.current?.focus(),80); doSearch('');} }, [showSearch]);
  useEffect(() => {
    const iv = setInterval(fetchIdx, 15000); return ()=>clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 1초 카운터
  useEffect(() => {
    const iv = setInterval(()=>{
      if(lastUpdatedRef.current) setSecAgo(Math.floor((Date.now()-lastUpdatedRef.current.getTime())/1000));
    }, 1000);
    return ()=>clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── API ─────────────────────────────────────────────────────────────────
  const loadWL = async () => {
    const r = await fetch('/api/stocks/watchlist');
    if(!r.ok) return;
    const d = await r.json() as WatchItem[];
    setWatchlist(d);
    if(d.length>0) setSelected(p=>p||d[0].symbol);
  };
  const fetchQ = useCallback(async (syms:string[]) => {
    if(!syms.length) return;
    const r = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(syms.join(','))}`);
    if(!r.ok) return;
    const d = await r.json() as Quote[];
    if(d.length>0){setQuotes(p=>{const m={...p}; d.forEach(q=>{m[q.symbol]=q;}); return m;});markUpdated();}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fetchIdx = useCallback(async () => {
    const syms = INDICES.map(i=>i.symbol).join(',');
    const r = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(syms)}`);
    if(!r.ok) return;
    const d = await r.json() as Quote[];
    const m:Record<string,Quote>={}; d.forEach(q=>{m[q.symbol]=q;}); setIndices(m);
  }, []);
  const loadSparks = async () => {
    const sm:Record<string,number[]>={};
    const qm:Record<string,Quote>={};
    await Promise.allSettled(watchlist.map(async w=>{
      const r = await fetch(`/api/stocks/chart?symbol=${w.symbol}&interval=1d&range=1mo`);
      if(r.ok){
        const d=await r.json() as Candle[];
        sm[w.symbol]=d.map(c=>c.close);
        if(d.length>0){
          const last=d[d.length-1],prev=d.length>1?d[d.length-2]:null,chg=prev?last.close-prev.close:0;
          qm[w.symbol]={symbol:w.symbol,regularMarketPrice:last.close,regularMarketOpen:last.open,regularMarketDayHigh:last.high,regularMarketDayLow:last.low,regularMarketVolume:last.volume,regularMarketChange:chg,regularMarketChangePercent:prev?(chg/prev.close)*100:0,previousClose:prev?.close,currency:isKR(w.symbol)?'KRW':'USD'};
        }
      }
    }));
    setSparks(sm);
    setQuotes(p=>{const m={...p};Object.entries(qm).forEach(([s,q])=>{if(!m[s]?.regularMarketPrice)m[s]=q;});return m;});
    markUpdated();
  };
  const doSearch = async (q:string) => {
    const r = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
    if(r.ok) setSearchRes(await r.json() as SearchResult[]);
  };
  useEffect(()=>{
    if(stRef.current) clearTimeout(stRef.current);
    if(!searchQ.trim()){doSearch('');return;}
    stRef.current = setTimeout(()=>{setSearching(true);doSearch(searchQ).finally(()=>setSearching(false));},300);
  },[searchQ]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadChart = async(sym:string,i:string,r:string)=>{
    setLoadingChart(true);setCandles([]);
    const res=await fetch(`/api/stocks/chart?symbol=${sym}&interval=${i}&range=${r}`);
    if(res.ok){
      const data=await res.json() as Candle[];
      setCandles(data);
      if(data.length>0){
        const last=data[data.length-1],prev=data.length>1?data[data.length-2]:null,chg=prev?last.close-prev.close:0;
        setQuotes(p=>{
          const ex=p[sym]||{};
          return {...p,[sym]:{symbol:sym,regularMarketPrice:last.close,regularMarketOpen:last.open,regularMarketDayHigh:last.high,regularMarketDayLow:last.low,regularMarketVolume:last.volume,regularMarketChange:chg,regularMarketChangePercent:prev?(chg/prev.close)*100:0,previousClose:prev?.close,currency:isKR(sym)?'KRW':'USD',shortName:ex.shortName,longName:ex.longName,marketState:ex.marketState,fiftyTwoWeekHigh:ex.fiftyTwoWeekHigh,fiftyTwoWeekLow:ex.fiftyTwoWeekLow,marketCap:ex.marketCap}};
        });
        markUpdated();
      }
    }
    setLoadingChart(false);
  };
  const loadNews = async(sym:string)=>{const name=watchlist.find(w=>w.symbol===sym)?.name||'';const r=await fetch(`/api/stocks/news?symbol=${encodeURIComponent(sym)}&name=${encodeURIComponent(name)}`);if(r.ok)setNews(await r.json() as NewsItem[]);};
  const loadJournal = async(sym:string)=>{const r=await fetch(`/api/stocks/journal?symbol=${sym}`);if(r.ok)setJournal(await r.json() as JournalEntry[]);};
  const loadPreds = async(sym:string)=>{const r=await fetch(`/api/stocks/prediction?symbol=${sym}`);if(r.ok)setPreds(await r.json() as Prediction[]);};

  const addStock = async(r:SearchResult)=>{
    const res=await fetch('/api/stocks/watchlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:r.symbol,name:r.name,market:r.market})});
    if(res.ok){setShowSearch(false);setSearchQ('');await loadWL();setSelected(r.symbol);showToast(r.name+' 추가됨');}
    else{const e=await res.json();showToast('오류: '+(e.error||'추가 실패'));}
  };
  const removeStock = async(item:WatchItem)=>{
    await fetch(`/api/stocks/watchlist/${item.id}`,{method:'DELETE'});
    const next=watchlist.filter(w=>w.id!==item.id);setWatchlist(next);
    if(selected===item.symbol)setSelected(next[0]?.symbol||null);
    showToast(item.name+' 삭제됨');
  };
  const saveJ = async()=>{
    if(!selected||!jF.quantity||!jF.price)return;
    const w=watchlist.find(w=>w.symbol===selected);
    const r=await fetch('/api/stocks/journal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:selected,name:w?.name||selected,trade_date:jF.trade_date,trade_type:jF.trade_type,quantity:parseInt(jF.quantity),price:parseFloat(jF.price),fee:parseFloat(jF.fee||'0'),memo:jF.memo})});
    if(r.ok){setShowJF(false);setJF({trade_date:todayStr(),trade_type:'buy',quantity:'',price:'',fee:'',memo:''});loadJournal(selected);showToast('거래 기록됨');}
  };
  const delJ = async(id:string)=>{if(!confirm('삭제할까요?'))return;await fetch(`/api/stocks/journal/${id}`,{method:'DELETE'});if(selected)loadJournal(selected);};
  const saveP = async()=>{
    if(!selected||!pF.predicted_close)return;
    const w=watchlist.find(w=>w.symbol===selected);
    const r=await fetch('/api/stocks/prediction',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:selected,name:w?.name||selected,prediction_date:pF.prediction_date,predicted_close:parseFloat(pF.predicted_close),direction:pF.direction,note:pF.note})});
    if(r.ok){setShowPF(false);setPF({prediction_date:todayStr(),predicted_close:'',direction:'up',note:''});loadPreds(selected);showToast('예측 기록됨');}
  };
  const updActual = async(pred:Prediction)=>{
    const v=actualInput[pred.id];if(!v)return;
    const r=await fetch('/api/stocks/prediction',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:pred.id,actual_close:parseFloat(v)})});
    if(r.ok){setActualInput(p=>{const n={...p};delete n[pred.id];return n;});if(selected)loadPreds(selected);showToast('실제 종가 기록됨');}
  };
  const calcPf = (sym:string)=>{
    const e=journal.filter(j=>j.symbol===sym);let sh=0,tc=0;
    e.forEach(j=>{if(j.trade_type==='buy'){sh+=j.quantity;tc+=j.quantity*j.price+(j.fee||0);}else sh-=j.quantity;});
    if(sh<=0)return null;
    const sq2=e.filter(j=>j.trade_type==='sell').reduce((s,j)=>s+j.quantity,0);
    const avg=tc/((sh+sq2)||1);const cur=quotes[sym]?.regularMarketPrice;
    return{shares:sh,avgCost:avg,pnl:cur?(cur-avg)*sh:null,pnlPct:cur?((cur-avg)/avg)*100:null};
  };

  const sq=selected?quotes[selected]:null;
  const chg=sq?.regularMarketChange??0;
  const isUp=chg>=0;
  const uc=selected?upC(selected):'#00B147';
  const dc=selected?dnC(selected):'#F04452';
  const pc=isUp?uc:dc;
  const selName=watchlist.find(w=>w.symbol===selected)?.name||selected||'';
  const pf=selected&&journal.length>0?calcPf(selected):null;

  // ── input 스타일 ──────────────────────────────────────────────────────────
  const iStyle = "w-full rounded-xl px-3 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-900";

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">

      {/* 토스트 */}
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm font-semibold shadow-2xl">{toast}</div>}

      {/* 검색 모달 */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex flex-col items-center pt-14 px-4 bg-black/40 backdrop-blur-sm"
          onClick={e=>{if(e.target===e.currentTarget){setShowSearch(false);setSearchQ('');}}}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input ref={sInputRef} value={searchQ} onChange={e=>setSearchQ(e.target.value)}
                placeholder="종목명 또는 코드 (예: 삼성전자, AAPL)"
                className="flex-1 bg-transparent text-gray-900 text-[15px] placeholder-gray-400 focus:outline-none"/>
              {searching && <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"/>}
              <button onClick={()=>{setShowSearch(false);setSearchQ('');}} className="text-blue-500 text-sm font-semibold">닫기</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {!searchQ && <div className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">인기 종목</div>}
              {searchRes.map(r=>(
                <button key={r.symbol} onClick={()=>addStock(r)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${r.market==='KR'?'bg-blue-50 text-blue-600':'bg-green-50 text-green-600'}`}>
                    {r.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{r.symbol} · {r.exchange}</div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-lg flex-shrink-0 ${r.market==='KR'?'bg-blue-50 text-blue-500':'bg-green-50 text-green-600'}`}>
                    {r.market==='KR'?'국내':'미국'}
                  </span>
                </button>
              ))}
              {searchRes.length===0&&searchQ&&!searching&&<div className="py-10 text-center text-sm text-gray-400">검색 결과 없음</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── 헤더: 지수 바 ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-5 overflow-x-auto">
        {INDICES.map(idx=>{
          const q=indices[idx.symbol];
          const up=(q?.regularMarketChange??0)>=0;
          const uc2=idx.isKr?'#F04452':'#00B147';
          const dc2=idx.isKr?'#4B6FE4':'#F04452';
          return (
            <div key={idx.symbol} className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-xs font-bold text-gray-500">{idx.label}</span>
              <span className="text-sm font-black text-gray-900 tabular-nums">
                {q?.regularMarketPrice!=null?(idx.isKr?q.regularMarketPrice.toLocaleString('ko-KR'):q.regularMarketPrice.toLocaleString('en-US',{minimumFractionDigits:2})):'—'}
              </span>
              {q&&<span className="text-xs font-semibold" style={{color:up?uc2:dc2}}>{fmtPct(q.regularMarketChangePercent)}</span>}
            </div>
          );
        })}
        <div className="flex-1"/>
        <button onClick={()=>setShowSearch(true)}
          className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-3 py-1.5 rounded-xl flex-shrink-0 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
          종목 추가
        </button>
      </div>

      {/* ── 메인 ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 왼쪽: 관심종목 ────────────────────────────────────────────── */}
        <div className="flex-shrink-0 w-48 bg-white border-r border-gray-100 flex flex-col overflow-y-auto">
          <div className="px-3 pt-3 pb-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">관심종목</span>
          </div>
          {watchlist.length===0?(
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <div className="text-3xl">📊</div>
              <p className="text-xs text-gray-400">종목을 추가해보세요</p>
              <button onClick={()=>setShowSearch(true)} className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg mt-1">+ 추가</button>
            </div>
          ):(
            <div className="pb-2">
              {watchlist.map(w=>{
                const q=quotes[w.symbol];
                const up=(q?.regularMarketChange??0)>=0;
                const isSel=selected===w.symbol;
                return (
                  <div key={w.symbol} onClick={()=>{setSelected(w.symbol);setTab('chart');}}
                    className={`group relative cursor-pointer px-3 py-2.5 transition-colors ${isSel?'bg-blue-50':'hover:bg-gray-50'}`}>
                    {isSel&&<div className="absolute left-0 top-2 bottom-2 w-[3px] bg-blue-500 rounded-full"/>}
                    <div className="flex items-start justify-between mb-1">
                      <div className="min-w-0 flex-1 pr-1">
                        <div className="text-[13px] font-bold text-gray-900 truncate">{w.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{w.symbol.endsWith('.KS')?'KOSPI':w.symbol.endsWith('.KQ')?'KOSDAQ':'US'}</div>
                      </div>
                      <button onClick={e=>{e.stopPropagation();removeStock(w);}}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-gray-400 hover:text-red-400">✕</button>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[14px] font-black text-gray-900 tabular-nums">
                          {q?.regularMarketPrice!=null?(isKR(w.symbol)?q.regularMarketPrice.toLocaleString('ko-KR'):'$'+q.regularMarketPrice.toFixed(2)):<span className="text-gray-300">—</span>}
                        </div>
                        <div className="text-[11px] font-semibold mt-0.5" style={{color:up?upC(w.symbol):dnC(w.symbol)}}>
                          {q?fmtPct(q.regularMarketChangePercent):''}
                        </div>
                      </div>
                      <Spark data={sparks[w.symbol]||[]} sym={w.symbol}/>
                    </div>
                  </div>
                );
              })}
              <button onClick={()=>setShowSearch(true)} className="w-full py-2 text-xs text-gray-400 hover:text-blue-500 transition-colors">+ 종목 추가</button>
            </div>
          )}
        </div>

        {/* ── 오른쪽: 상세 ─────────────────────────────────────────────── */}
        {!selected?(
          <div className="flex-1 flex items-center justify-center text-gray-300">
            <div className="text-center"><div className="text-6xl mb-3">📈</div><div className="text-sm">왼쪽에서 종목을 선택하세요</div></div>
          </div>
        ):(
          <div className="flex-1 flex flex-col overflow-hidden bg-white">

            {/* 종목 헤더 */}
            <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <h2 className="text-xl font-black text-gray-900">{sq?.shortName||sq?.longName||selName}</h2>
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{selected}</span>
                    {sq?.marketState&&(
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${sq.marketState==='REGULAR'?'bg-green-50 text-green-600':'bg-gray-100 text-gray-500'}`}>
                        {sq.marketState==='REGULAR'?'● 장중':sq.marketState==='PRE'?'프리마켓':sq.marketState==='POST'?'애프터':'장마감'}
                      </span>
                    )}
                  </div>
                  {/* 현재가 */}
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-4xl font-black tabular-nums" style={{color:pc}}>
                      {sq?.regularMarketPrice!=null?(isKR(selected)?sq.regularMarketPrice.toLocaleString('ko-KR')+'원':'$'+sq.regularMarketPrice.toFixed(2)):<span className="text-gray-300">—</span>}
                    </span>
                    {sq?.regularMarketChange!=null&&(
                      <span className="text-lg font-bold" style={{color:pc}}>
                        {chg>=0?'+':''}{isKR(selected)?Math.round(chg).toLocaleString('ko-KR'):chg.toFixed(2)} ({fmtPct(sq.regularMarketChangePercent)})
                      </span>
                    )}
                    {sq?.previousClose!=null&&<span className="text-sm text-gray-400">전일 {fmtP(sq.previousClose,selected)}</span>}
                    {secAgo!=null&&(
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
                        {secAgo<60?`${secAgo}초`:`${Math.floor(secAgo/60)}분 ${secAgo%60}초`} 전
                      </span>
                    )}
                  </div>
                  {/* 52주 */}
                  {sq?.fiftyTwoWeekLow!=null&&sq?.fiftyTwoWeekHigh!=null&&sq?.regularMarketPrice!=null&&(()=>{
                    const low=sq.fiftyTwoWeekLow!,hi=sq.fiftyTwoWeekHigh!,cur=sq.regularMarketPrice!;
                    const pct=Math.min(100,Math.max(0,(cur-low)/(hi-low)*100));
                    return (
                      <div className="flex items-center gap-2 mt-2.5 max-w-sm">
                        <span className="text-[11px] text-gray-400 tabular-nums w-20 text-right">{fmtP(low,selected)}</span>
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full relative">
                          <div className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-blue-400 to-red-400" style={{width:pct+'%'}}/>
                          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-gray-400 rounded-full shadow-sm" style={{left:`calc(${pct}% - 6px)`}}/>
                        </div>
                        <span className="text-[11px] text-gray-400 tabular-nums w-20">{fmtP(hi,selected)}</span>
                        <span className="text-[10px] text-gray-400">52주</span>
                      </div>
                    );
                  })()}
                </div>

                {/* 지표 그리드 */}
                <div className="grid grid-cols-3 gap-2 flex-shrink-0">
                  {[
                    {l:'시가',v:fmtP(sq?.regularMarketOpen,selected),c:'text-gray-900'},
                    {l:'고가',v:fmtP(sq?.regularMarketDayHigh,selected),c:'text-red-500'},
                    {l:'저가',v:fmtP(sq?.regularMarketDayLow,selected),c:'text-blue-500'},
                    {l:'거래량',v:fmtVol(sq?.regularMarketVolume),c:'text-gray-900'},
                    {l:'전일',v:fmtP(sq?.previousClose,selected),c:'text-gray-900'},
                    {l:'통화',v:sq?.currency||'—',c:'text-gray-900'},
                  ].map(item=>(
                    <div key={item.l} className="bg-gray-50 rounded-xl px-3 py-2 min-w-[80px]">
                      <div className="text-[10px] font-semibold text-gray-400 mb-0.5">{item.l}</div>
                      <div className={`text-xs font-bold tabular-nums ${item.c}`}>{item.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 포트폴리오 */}
              {pf&&(
                <div className="mt-3 flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5">
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>보유 <b className="text-gray-900">{pf.shares}주</b></span>
                    <span>평균단가 <b className="text-gray-900">{fmtP(pf.avgCost,selected)}</b></span>
                  </div>
                  {pf.pnl!=null&&(
                    <div className="text-sm font-black" style={{color:pf.pnl>=0?uc:dc}}>
                      {pf.pnl>=0?'+':''}{isKR(selected)?Math.round(pf.pnl).toLocaleString('ko-KR')+'원':'$'+pf.pnl.toFixed(2)}
                      <span className="text-xs ml-1">({pf.pnlPct!>=0?'+':''}{pf.pnlPct!.toFixed(2)}%)</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 탭 */}
            <div className="flex-shrink-0 flex px-6 gap-6 bg-white border-b border-gray-100">
              {[{id:'chart',l:'차트'},{id:'news',l:'뉴스'},{id:'journal',l:'매매일지'},{id:'prediction',l:'종가예측'}].map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id as typeof tab)}
                  className={`py-3 text-sm font-bold border-b-2 -mb-px transition-colors ${tab===t.id?'border-blue-500 text-blue-500':'border-transparent text-gray-400 hover:text-gray-600'}`}>
                  {t.l}
                </button>
              ))}
            </div>

            {/* 탭 콘텐츠 */}
            <div className="flex-1 overflow-y-auto bg-white">

              {/* 차트 */}
              {tab==='chart'&&(
                <div className="flex flex-col" style={{height:'100%'}}>
                  <div className="flex-shrink-0 flex items-center gap-1.5 px-4 pt-3 pb-2 flex-wrap border-b border-gray-50">
                    {CHART_OPTS.map(o=>(
                      <button key={o.i+o.r} onClick={()=>{setCI(o.i);setCR(o.r);}}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${cI===o.i&&cR===o.r?'bg-blue-500 text-white':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {o.l}
                      </button>
                    ))}
                    {loadingChart&&<div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin ml-1"/>}
                  </div>
                  <div className="flex-1 p-3" style={{minHeight:400}}>
                    {candles.length>0
                      ?<CandleChart candles={candles} symbol={selected}/>
                      :<div className="flex items-center justify-center h-full text-sm text-gray-300">
                        {loadingChart?'차트 로딩중...':'데이터 없음'}
                      </div>}
                  </div>
                </div>
              )}

              {/* 뉴스 */}
              {tab==='news'&&(
                <div className="p-4 space-y-2">
                  {news.length===0&&<div className="py-12 text-center text-sm text-gray-300">뉴스가 없습니다</div>}
                  {news.map(n=>(
                    <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer"
                      className="flex gap-3 p-3.5 rounded-2xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors">
                      {n.thumbnail&&<img src={n.thumbnail} alt="" className="w-16 h-12 object-cover rounded-xl flex-shrink-0"/>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{n.title}</div>
                        <div className="text-xs text-gray-400 mt-1.5">{n.publisher} · {relTime(n.publishedAt)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {/* 매매일지 */}
              {tab==='journal'&&(
                <div className="p-4">
                  <button onClick={()=>setShowJF(v=>!v)} className="w-full py-3 rounded-2xl text-sm font-bold mb-4 transition-colors bg-blue-500 hover:bg-blue-600 text-white">
                    {showJF?'취소':'+ 거래 기록'}
                  </button>
                  {showJF&&(
                    <div className="rounded-2xl p-4 mb-4 bg-gray-50 border border-gray-100">
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs font-semibold text-gray-500 block mb-1">날짜</label><input type="date" value={jF.trade_date} onChange={e=>setJF(p=>({...p,trade_date:e.target.value}))} className={iStyle}/></div>
                        <div><label className="text-xs font-semibold text-gray-500 block mb-1">구분</label>
                          <div className="flex gap-1">{['buy','sell'].map(t=><button key={t} onClick={()=>setJF(p=>({...p,trade_type:t as 'buy'|'sell'}))} className={`flex-1 py-2 text-sm font-bold rounded-xl border ${jF.trade_type===t?(t==='buy'?'bg-blue-500 border-blue-500 text-white':'bg-red-500 border-red-500 text-white'):'bg-white border-gray-200 text-gray-600'}`}>{t==='buy'?'매수':'매도'}</button>)}</div>
                        </div>
                        <div><label className="text-xs font-semibold text-gray-500 block mb-1">수량</label><input type="number" value={jF.quantity} onChange={e=>setJF(p=>({...p,quantity:e.target.value}))} placeholder="100" className={iStyle}/></div>
                        <div><label className="text-xs font-semibold text-gray-500 block mb-1">단가</label><input type="number" value={jF.price} onChange={e=>setJF(p=>({...p,price:e.target.value}))} placeholder="55400" className={iStyle}/></div>
                        <div><label className="text-xs font-semibold text-gray-500 block mb-1">수수료</label><input type="number" value={jF.fee} onChange={e=>setJF(p=>({...p,fee:e.target.value}))} placeholder="0" className={iStyle}/></div>
                        <div><label className="text-xs font-semibold text-gray-500 block mb-1">메모</label><input value={jF.memo} onChange={e=>setJF(p=>({...p,memo:e.target.value}))} placeholder="메모" className={iStyle}/></div>
                      </div>
                      {jF.quantity&&jF.price&&<div className="mt-3 text-sm text-gray-500">거래금액 <b className="text-gray-900">{(parseInt(jF.quantity)*parseFloat(jF.price)).toLocaleString('ko-KR')}</b></div>}
                      <button onClick={saveJ} className="w-full mt-3 py-3 rounded-xl text-sm font-black bg-blue-500 text-white">저장</button>
                    </div>
                  )}
                  {journal.length===0&&!showJF&&<div className="py-10 text-center text-sm text-gray-300">매매 기록이 없습니다</div>}
                  <div className="space-y-2">
                    {journal.map(j=>(
                      <div key={j.id} className="flex items-center justify-between rounded-2xl px-4 py-3 border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${j.trade_type==='buy'?'bg-blue-50 text-blue-600':'bg-red-50 text-red-500'}`}>{j.trade_type==='buy'?'매':'도'}</div>
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{j.trade_date} · {j.quantity.toLocaleString()}주 × {j.price.toLocaleString('ko-KR')}</div>
                            <div className="text-xs text-gray-400 mt-0.5">합계 {(j.quantity*j.price).toLocaleString('ko-KR')}{j.memo?` · ${j.memo}`:''}</div>
                          </div>
                        </div>
                        <button onClick={()=>delJ(j.id)} className="text-xs text-gray-300 hover:text-red-400 transition-colors">삭제</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 종가예측 */}
              {tab==='prediction'&&(
                <div className="p-4">
                  <button onClick={()=>setShowPF(v=>!v)} className="w-full py-3 rounded-2xl text-sm font-bold mb-4 bg-purple-500 hover:bg-purple-600 text-white transition-colors">
                    {showPF?'취소':'+ 오늘 종가 예측'}
                  </button>
                  {showPF&&(
                    <div className="rounded-2xl p-4 mb-4 bg-gray-50 border border-gray-100">
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs font-semibold text-gray-500 block mb-1">날짜</label><input type="date" value={pF.prediction_date} onChange={e=>setPF(p=>({...p,prediction_date:e.target.value}))} className={iStyle}/></div>
                        <div><label className="text-xs font-semibold text-gray-500 block mb-1">예상 종가</label><input type="number" value={pF.predicted_close} onChange={e=>setPF(p=>({...p,predicted_close:e.target.value}))} placeholder="55400" className={iStyle}/></div>
                        <div className="col-span-2"><label className="text-xs font-semibold text-gray-500 block mb-1">방향</label>
                          <div className="flex gap-2">{[{v:'up',l:'📈 상승'},{v:'down',l:'📉 하락'},{v:'neutral',l:'➡️ 횡보'}].map(d=><button key={d.v} onClick={()=>setPF(p=>({...p,direction:d.v}))} className={`flex-1 py-2 text-xs font-bold rounded-xl border ${pF.direction===d.v?'bg-purple-500 border-purple-500 text-white':'bg-white border-gray-200 text-gray-600'}`}>{d.l}</button>)}</div>
                        </div>
                        <div className="col-span-2"><label className="text-xs font-semibold text-gray-500 block mb-1">예측 근거</label><input value={pF.note} onChange={e=>setPF(p=>({...p,note:e.target.value}))} placeholder="예측 근거를 입력하세요" className={iStyle}/></div>
                      </div>
                      <button onClick={saveP} className="w-full mt-3 py-3 rounded-xl text-sm font-black bg-purple-500 text-white">저장</button>
                    </div>
                  )}
                  {preds.filter(p=>p.accuracy_pct!==null).length>0&&(()=>{
                    const w=preds.filter(p=>p.accuracy_pct!==null);
                    const avg=w.reduce((s,p)=>s+(p.accuracy_pct??0),0)/w.length;
                    const hit=w.filter(p=>(p.accuracy_pct??0)>=95).length/w.length*100;
                    return <div className="bg-purple-50 rounded-2xl p-4 mb-4 grid grid-cols-3 gap-3 text-center border border-purple-100">
                      <div><div className="text-xl font-black text-purple-600">{avg.toFixed(1)}%</div><div className="text-[10px] text-gray-400 mt-0.5">평균 정확도</div></div>
                      <div><div className="text-xl font-black text-purple-600">{hit.toFixed(0)}%</div><div className="text-[10px] text-gray-400 mt-0.5">±5% 적중률</div></div>
                      <div><div className="text-xl font-black text-purple-600">{w.length}</div><div className="text-[10px] text-gray-400 mt-0.5">기록 수</div></div>
                    </div>;
                  })()}
                  {preds.length===0&&!showPF&&<div className="py-10 text-center text-sm text-gray-300">예측 기록이 없습니다</div>}
                  <div className="space-y-2">
                    {preds.map(p=>(
                      <div key={p.id} className="rounded-2xl px-4 py-3 border border-gray-100">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="text-sm font-semibold text-gray-900">{p.prediction_date}</span>
                          <span>{p.direction==='up'?'📈':p.direction==='down'?'📉':'➡️'}</span>
                          <span className="text-sm text-gray-600">예상 <b className="text-yellow-500">{p.predicted_close.toLocaleString('ko-KR')}</b></span>
                          {p.actual_close!=null&&<span className="text-sm text-gray-600">실제 <b style={{color:p.actual_close>=p.predicted_close?uc:dc}}>{p.actual_close.toLocaleString('ko-KR')}</b></span>}
                          {p.accuracy_pct!=null&&<span className={`text-xs px-2 py-0.5 rounded-full font-black ${p.accuracy_pct>=95?'bg-green-50 text-green-600':p.accuracy_pct>=85?'bg-yellow-50 text-yellow-600':'bg-red-50 text-red-500'}`}>{p.accuracy_pct.toFixed(1)}%</span>}
                          {p.actual_close===null&&<div className="flex items-center gap-1.5 ml-auto">
                            <input type="number" value={actualInput[p.id]||''} onChange={e=>setActualInput(prev=>({...prev,[p.id]:e.target.value}))} placeholder="실제종가" className="w-24 rounded-lg px-2 py-1 text-xs border border-gray-200 focus:outline-none"/>
                            <button onClick={()=>updActual(p)} className="text-xs font-bold px-2 py-1 rounded-lg bg-green-50 text-green-600">확인</button>
                          </div>}
                        </div>
                        {p.note&&<div className="text-xs text-gray-400 mt-1.5">{p.note}</div>}
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
