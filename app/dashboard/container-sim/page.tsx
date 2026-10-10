'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

const Viewer3D = dynamic(() => import('./Viewer3D'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full" style={{ background: '#080c18' }}>
      <div className="text-gray-600 text-sm animate-pulse">3D 엔진 로딩 중...</div>
    </div>
  ),
});

// ── 컨테이너 규격 ─────────────────────────────────────────────────────────────
export const CONTAINERS = {
  '20ft': { name: '20ft', W: 590, H: 238, D: 235, maxW: 21800, cbm: 33.1, label: '20ft FCL', teu: 1 },
  '40ft': { name: '40ft', W: 1202, H: 238, D: 235, maxW: 26680, cbm: 67.5, label: '40ft FCL', teu: 2 },
  '40hc': { name: '40hc', W: 1202, H: 269, D: 235, maxW: 26450, cbm: 76.3, label: "40ft HC FCL", teu: 2 },
} as const;

const COLORS = [
  '#3b82f6','#22c55e','#f97316','#ef4444','#8b5cf6','#ec4899',
  '#14b8a6','#eab308','#06b6d4','#a78bfa','#84cc16','#fb923c',
];

// ── 타입 ──────────────────────────────────────────────────────────────────────
export interface BoxItem {
  id: string;
  name: string;
  w: number; h: number; d: number;
  weight: number;
  count: number;
  color: string;
  stackable: boolean;
  fragile: boolean;
  noRotate: boolean;
}

export interface PlacedBox {
  boxId: string; name: string;
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  color: string; weight: number;
  stackable: boolean; fragile: boolean;
  idx: number;
}

export interface ContainerConfig {
  name: string; W: number; H: number; D: number;
  maxW: number; cbm: number; label: string; teu: number;
}

// ── 알고리즘 ──────────────────────────────────────────────────────────────────
function getRotations(w: number, h: number, d: number, noRotate: boolean): [number, number, number][] {
  if (noRotate) return [[w, h, d]];
  const seen = new Set<string>();
  const out: [number, number, number][] = [];
  for (const [a, b, c] of [[w,h,d],[w,d,h],[h,w,d],[h,d,w],[d,w,h],[d,h,w]]) {
    const k = `${a}-${b}-${c}`;
    if (!seen.has(k)) { seen.add(k); out.push([a, b, c]); }
  }
  return out;
}

function getFloor(x: number, z: number, w: number, d: number, placed: PlacedBox[]): { y: number; stackable: boolean } {
  let y = 0, stackable = true;
  for (const p of placed) {
    if (x < p.x + p.w && x + w > p.x && z < p.z + p.d && z + d > p.z) {
      const top = p.y + p.h;
      if (top > y) { y = top; stackable = p.stackable; }
      else if (top === y && !p.stackable) stackable = false;
    }
  }
  return { y, stackable };
}

function overlaps(ax:number,ay:number,az:number,aw:number,ah:number,ad:number,
                   bx:number,by:number,bz:number,bw:number,bh:number,bd:number) {
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by && az < bz+bd && az+ad > bz;
}

function canPlace(x:number,y:number,z:number,w:number,h:number,d:number,
                   C:ContainerConfig, placed:PlacedBox[]) {
  if (x<0||y<0||z<0||x+w>C.W||y+h>C.H||z+d>C.D) return false;
  for (const p of placed) {
    if (overlaps(x,y,z,w,h,d,p.x,p.y,p.z,p.w,p.h,p.d)) return false;
  }
  return true;
}

export function packBoxes(container: ContainerConfig, items: BoxItem[], respectWeight: boolean) {
  const queue: BoxItem[] = [];
  for (const item of items) {
    for (let i = 0; i < item.count; i++) queue.push(item);
  }
  // Heavy, non-fragile first; fragile last
  queue.sort((a, b) => {
    if (a.fragile !== b.fragile) return a.fragile ? 1 : -1;
    return b.w * b.h * b.d - a.w * a.h * a.d;
  });

  const placed: PlacedBox[] = [];
  let totalWeight = 0;
  let epts = [{ x: 0, y: 0, z: 0 }];
  const pCount = new Map<string, number>();

  for (const item of queue) {
    if (respectWeight && totalWeight + item.weight > container.maxW) continue;
    const rots = getRotations(item.w, item.h, item.d, item.noRotate);
    const sorted = [...epts].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

    let done = false;
    for (const ep of sorted) {
      if (done) break;
      for (const [rw, rh, rd] of rots) {
        const { y: fy, stackable } = getFloor(ep.x, ep.z, rw, rd, placed);
        const y = Math.max(ep.y, fy);
        if (y > 0 && !stackable) continue;
        if (canPlace(ep.x, y, ep.z, rw, rh, rd, container, placed)) {
          placed.push({
            boxId: item.id, name: item.name,
            x: ep.x, y, z: ep.z,
            w: rw, h: rh, d: rd,
            color: item.color, weight: item.weight,
            stackable: item.stackable, fragile: item.fragile,
            idx: placed.length,
          });
          totalWeight += item.weight;
          pCount.set(item.id, (pCount.get(item.id) || 0) + 1);
          epts.push({ x: ep.x + rw, y, z: ep.z }, { x: ep.x, y: y + rh, z: ep.z }, { x: ep.x, y, z: ep.z + rd });
          const seen = new Set<string>();
          epts = epts.filter(e => {
            if (e.x >= container.W || e.y >= container.H || e.z >= container.D) return false;
            const k = `${e.x}|${e.y}|${e.z}`;
            return seen.has(k) ? false : !!seen.add(k);
          });
          done = true; break;
        }
      }
    }
  }

  const totalMass = placed.reduce((s, p) => s + p.weight, 0);
  const cog = totalMass > 0 ? {
    x: placed.reduce((s, p) => s + (p.x + p.w/2) * p.weight, 0) / totalMass,
    y: placed.reduce((s, p) => s + (p.y + p.h/2) * p.weight, 0) / totalMass,
    z: placed.reduce((s, p) => s + (p.z + p.d/2) * p.weight, 0) / totalMass,
  } : null;

  return { placed, placedCount: pCount, totalWeight, cog };
}

// ── 2D 투영 뷰 ────────────────────────────────────────────────────────────────
function ProjectionView({
  placed, container, view, visCount,
}: {
  placed: PlacedBox[]; container: ContainerConfig;
  view: 'top' | 'front' | 'side'; visCount: number;
}) {
  const visible = placed.slice(0, visCount);
  const { W, H, D } = container;
  const [vw, vh] = view === 'top' ? [D, W] : view === 'front' ? [W, H] : [D, H];
  const cw = 280, ch = Math.round((vh / vw) * 280);
  const sx = cw / vw, sy = ch / vh;

  const getRect = (p: PlacedBox) => {
    if (view === 'top') return { x: p.z * sx, y: p.x * sy, w: p.d * sx, h: p.w * sy };
    if (view === 'front') return { x: p.x * sx, y: (H - p.y - p.h) * sy, w: p.w * sx, h: p.h * sy };
    return { x: p.z * sx, y: (H - p.y - p.h) * sy, w: p.d * sx, h: p.h * sy };
  };

  const label = view === 'top' ? '위 (Top)' : view === 'front' ? '정면 (Front / Door)' : '측면 (Side)';
  const dim = view === 'top' ? `${D}×${W}cm` : view === 'front' ? `${W}×${H}cm` : `${D}×${H}cm`;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <span className="text-xs text-gray-600 font-mono">{dim}</span>
      </div>
      <div className="rounded-lg overflow-hidden border border-gray-800" style={{ width: cw, height: ch }}>
        <svg width={cw} height={ch} style={{ display: 'block', background: '#080c18' }}>
          {/* Grid */}
          {Array.from({ length: 5 }).map((_, i) => (
            <g key={i}>
              <line x1={cw * i/4} y1={0} x2={cw * i/4} y2={ch} stroke="#1a2535" strokeWidth={0.5} />
              <line x1={0} y1={ch * i/4} x2={cw} y2={ch * i/4} stroke="#1a2535" strokeWidth={0.5} />
            </g>
          ))}
          {/* Boxes */}
          {visible.map((p, i) => {
            const r = getRect(p);
            return (
              <g key={i}>
                <rect x={r.x + 0.3} y={r.y + 0.3} width={Math.max(r.w - 0.6, 0.5)} height={Math.max(r.h - 0.6, 0.5)}
                  fill={p.color + 'aa'} stroke={p.color} strokeWidth={0.7} />
              </g>
            );
          })}
          {/* Border */}
          <rect x={0.5} y={0.5} width={cw - 1} height={ch - 1} fill="none" stroke="#334155" strokeWidth={1.5} />
          {/* Center mark */}
          <line x1={cw/2} y1={0} x2={cw/2} y2={ch} stroke="#1e3a5f" strokeWidth={0.5} strokeDasharray="3,3" />
          <line x1={0} y1={ch/2} x2={cw} y2={ch/2} stroke="#1e3a5f" strokeWidth={0.5} strokeDasharray="3,3" />
        </svg>
      </div>
    </div>
  );
}

// ── 기본 항목 ─────────────────────────────────────────────────────────────────
const DEFAULT_ITEMS: BoxItem[] = [
  { id: 'p1', name: '소형 박스', w: 30, h: 20, d: 25, weight: 2, count: 30, color: COLORS[0], stackable: true, fragile: false, noRotate: false },
  { id: 'p2', name: '중형 박스', w: 50, h: 35, d: 40, weight: 8, count: 15, color: COLORS[1], stackable: true, fragile: false, noRotate: false },
  { id: 'p3', name: '가전제품', w: 80, h: 60, d: 60, weight: 22, count: 5, color: COLORS[2], stackable: false, fragile: true, noRotate: true },
];

function newId() { return `box-${Date.now()}-${Math.random().toString(36).slice(2,6)}`; }

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function ContainerSimPage() {
  type CType = keyof typeof CONTAINERS;
  const [ctype, setCtype] = useState<CType>('20ft');
  const [items, setItems] = useState<BoxItem[]>(DEFAULT_ITEMS);
  const [result, setResult] = useState<ReturnType<typeof packBoxes> | null>(null);
  const [showCount, setShowCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [respectWeight, setRespectWeight] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [isCalc, setIsCalc] = useState(false);
  const [viewMode, setViewMode] = useState<'3d' | 'top' | 'front' | 'side'>('3d');
  const [showLabels, setShowLabels] = useState(false);
  const [showSeq, setShowSeq] = useState(false);
  const [showCOG, setShowCOG] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareData, setCompareData] = useState<Record<string, ReturnType<typeof packBoxes>> | null>(null);
  const [colorIdx, setColorIdx] = useState(DEFAULT_ITEMS.length);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const container = CONTAINERS[ctype];

  useEffect(() => {
    if (isPlaying && result) {
      playRef.current = setInterval(() => {
        setShowCount(prev => {
          if (prev >= result.placed.length) { setIsPlaying(false); return prev; }
          return prev + 1;
        });
      }, 60);
    } else {
      if (playRef.current) clearInterval(playRef.current);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, result]);

  const updateItem = (id: string, patch: Partial<BoxItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    setResult(null);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setResult(null);
  };

  const addItem = () => {
    const newItem: BoxItem = {
      id: newId(), name: '새 항목', w: 40, h: 30, d: 35,
      weight: 5, count: 1, color: COLORS[colorIdx % COLORS.length],
      stackable: true, fragile: false, noRotate: false,
    };
    setItems(prev => [...prev, newItem]);
    setColorIdx(c => c + 1);
    setResult(null);
  };

  const handleCalculate = useCallback(() => {
    if (items.length === 0) return;
    setIsCalc(true);
    setTimeout(() => {
      const r = packBoxes(container, items, respectWeight);
      setResult(r);
      setShowCount(r.placed.length);
      setIsPlaying(false);
      setIsCalc(false);
    }, 10);
  }, [items, container, respectWeight]);

  const handleCompare = useCallback(() => {
    setIsCalc(true);
    setTimeout(() => {
      const d: Record<string, ReturnType<typeof packBoxes>> = {};
      for (const k of Object.keys(CONTAINERS) as CType[]) {
        d[k] = packBoxes(CONTAINERS[k], items, respectWeight);
      }
      setCompareData(d);
      setShowCompare(true);
      setIsCalc(false);
    }, 10);
  }, [items, respectWeight]);

  const handlePlay = () => {
    if (!result) return;
    setShowCount(0);
    setIsPlaying(true);
  };

  const visiblePlaced = useMemo(() =>
    result ? result.placed.slice(0, showCount) : [],
    [result, showCount]
  );

  const totalItems = items.reduce((s, b) => s + b.count, 0);
  const placedTotal = result ? result.placed.length : 0;
  const unplacedTotal = totalItems - placedTotal;
  const usedCBM = result ? result.placed.reduce((s, p) => s + p.w * p.h * p.d / 1_000_000, 0) : 0;
  const containerCBM = container.W * container.H * container.D / 1_000_000;
  const utilPct = containerCBM > 0 ? (usedCBM / containerCBM) * 100 : 0;
  const weightPct = container.maxW > 0 ? (result ? result.totalWeight / container.maxW * 100 : 0) : 0;

  const itemStats = useMemo(() => {
    if (!result) return [];
    return items.map(b => ({
      ...b,
      placed: result.placedCount.get(b.id) || 0,
      unplaced: b.count - (result.placedCount.get(b.id) || 0),
      cbm: ((result.placedCount.get(b.id) || 0) * b.w * b.h * b.d / 1_000_000),
    }));
  }, [result, items]);

  // Gauge ring
  const Ring = ({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) => {
    const r = (size - 8) / 2, c = size / 2;
    const circ = 2 * Math.PI * r;
    return (
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#1e293b" strokeWidth={6} />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${Math.min(pct, 100) / 100 * circ} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`}
        />
        <text x={c} y={c + 4} textAnchor="middle" fontSize={size * 0.2} fontWeight="700" fill="white" fontFamily="monospace">
          {Math.round(pct)}%
        </text>
      </svg>
    );
  };

  const nm = (n: number, d = 1) => n.toLocaleString('ko-KR', { maximumFractionDigits: d });

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0d1117', color: '#e2e8f0' }}>

      {/* ── 툴바 ── */}
      <div style={{ background: '#161b27', borderBottom: '1px solid #1e293b', height: 50 }}
        className="flex items-center px-4 gap-3 flex-shrink-0">
        <span className="font-bold text-white text-sm tracking-wide flex items-center gap-2">
          🏗️ <span style={{ color: '#60a5fa' }}>CUBE</span> OPTIMIZER
        </span>
        <div className="w-px h-5 bg-gray-700" />
        {/* Container selector */}
        <div className="flex gap-1">
          {(Object.entries(CONTAINERS) as [keyof typeof CONTAINERS, ContainerConfig][]).map(([k, c]) => (
            <button key={k} onClick={() => { setCtype(k); setResult(null); }}
              className="px-3 py-1 rounded text-xs font-medium transition-all"
              style={{
                background: ctype === k ? '#1d4ed8' : '#1e293b',
                color: ctype === k ? '#fff' : '#94a3b8',
                border: `1px solid ${ctype === k ? '#3b82f6' : '#334155'}`,
              }}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-gray-700" />
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={respectWeight} onChange={e => setRespectWeight(e.target.checked)} className="accent-blue-500" />
          <span className="text-xs text-gray-400">중량제한</span>
        </label>
        <div className="flex-1" />
        {/* View controls */}
        <div className="flex gap-1">
          {(['3d','top','front','side'] as const).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className="px-2.5 py-1 rounded text-xs transition-all"
              style={{
                background: viewMode === v ? '#0f2040' : 'transparent',
                color: viewMode === v ? '#60a5fa' : '#64748b',
                border: `1px solid ${viewMode === v ? '#1e40af' : 'transparent'}`,
              }}>
              {v === '3d' ? '3D' : v === 'top' ? 'TOP' : v === 'front' ? 'FRONT' : 'SIDE'}
            </button>
          ))}
        </div>
        {viewMode === '3d' && (
          <div className="flex gap-1">
            {[
              { key: 'showLabels', val: showLabels, set: setShowLabels, label: '라벨' },
              { key: 'showSeq', val: showSeq, set: setShowSeq, label: '순서' },
              { key: 'showCOG', val: showCOG, set: setShowCOG, label: 'COG' },
            ].map(opt => (
              <button key={opt.key} onClick={() => opt.set(!opt.val)}
                className="px-2.5 py-1 rounded text-xs transition-all"
                style={{
                  background: opt.val ? '#064e3b' : 'transparent',
                  color: opt.val ? '#34d399' : '#64748b',
                  border: `1px solid ${opt.val ? '#065f46' : 'transparent'}`,
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        )}
        <div className="w-px h-5 bg-gray-700" />
        <button onClick={handleCompare} disabled={items.length === 0 || isCalc}
          className="px-3 py-1 rounded text-xs font-medium transition-all disabled:opacity-40"
          style={{ background: '#2d3748', color: '#a0aec0', border: '1px solid #4a5568' }}>
          비교 분석
        </button>
        <button onClick={handleCalculate} disabled={items.length === 0 || isCalc}
          className="px-4 py-1.5 rounded text-xs font-semibold transition-all disabled:opacity-40 flex items-center gap-1.5"
          style={{ background: isCalc ? '#1d4ed8' : '#2563eb', color: '#fff' }}>
          {isCalc ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> 계산 중</> : '🚀 최적 적재 계산'}
        </button>
      </div>

      {/* ── 메인 영역 ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 왼쪽: 화물 목록 ── */}
        <div style={{ width: 380, background: '#161b27', borderRight: '1px solid #1e293b' }}
          className="flex flex-col flex-shrink-0 overflow-hidden">
          <div style={{ borderBottom: '1px solid #1e293b' }}
            className="px-4 py-2.5 flex items-center justify-between flex-shrink-0">
            <div>
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">화물 목록</span>
              <span className="text-xs text-gray-600 ml-2">{totalItems}개 / {nm(items.reduce((s,b)=>s+b.w*b.h*b.d*b.count/1e6,0),3)} CBM</span>
            </div>
            <button onClick={addItem}
              className="text-xs px-3 py-1 rounded font-medium transition-all"
              style={{ background: '#1e3a5f', color: '#60a5fa', border: '1px solid #1d4ed8' }}>
              + 추가
            </button>
          </div>

          {/* 헤더 */}
          <div style={{ borderBottom: '1px solid #1e293b', background: '#0d1117' }}
            className="gap-0 px-2 py-1.5 text-gray-600 text-xs flex-shrink-0">
            <div className="flex items-center gap-1 px-2 text-gray-600 text-xs" style={{ display: 'grid', gridTemplateColumns: '16px 1fr 42px 42px 42px 40px 46px 26px 26px 26px 20px', alignItems: 'center', padding: '0 8px' }}>
              <span />
              <span>품목명</span>
              <span className="text-center">L</span>
              <span className="text-center">W</span>
              <span className="text-center">H</span>
              <span className="text-center">kg</span>
              <span className="text-center">수량</span>
              <span className="text-center text-gray-500" title="적재가능">積</span>
              <span className="text-center text-gray-500" title="취급주의">⚠</span>
              <span className="text-center text-gray-500" title="회전금지">🔒</span>
              <span />
            </div>
          </div>

          {/* 아이템 목록 */}
          <div className="flex-1 overflow-y-auto">
            {items.map(item => (
              <div
                key={item.id}
                onClick={() => setHighlightId(prev => prev === item.id ? null : item.id)}
                style={{
                  borderBottom: '1px solid #1a2535',
                  background: highlightId === item.id ? '#0f2040' : 'transparent',
                  cursor: 'pointer',
                }}
                className="transition-colors hover:bg-slate-900/50"
              >
                <div className="flex items-center px-2 py-1.5 gap-1"
                  style={{ display: 'grid', gridTemplateColumns: '16px 1fr 42px 42px 42px 40px 46px 26px 26px 26px 20px', alignItems: 'center', padding: '6px 8px', gap: 3 }}>
                  {/* Color */}
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: item.color }} />
                  {/* Name */}
                  <input
                    value={item.name}
                    onChange={e => updateItem(item.id, { name: e.target.value })}
                    onClick={e => e.stopPropagation()}
                    className="bg-transparent text-xs text-gray-300 outline-none border-b border-transparent hover:border-gray-600 focus:border-blue-500 min-w-0 w-full"
                  />
                  {/* L W H */}
                  {(['w','h','d'] as const).map(k => (
                    <input key={k} type="number" min="1"
                      value={item[k]}
                      onChange={e => updateItem(item.id, { [k]: Math.max(1, parseInt(e.target.value) || 1) })}
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-center font-mono outline-none w-full"
                      style={{ background: '#0d1117', color: '#94a3b8', border: '1px solid #1e293b', borderRadius: 4, padding: '2px 0' }}
                    />
                  ))}
                  {/* Weight */}
                  <input type="number" min="0" step="0.1"
                    value={item.weight}
                    onChange={e => updateItem(item.id, { weight: parseFloat(e.target.value) || 0 })}
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-center font-mono outline-none w-full"
                    style={{ background: '#0d1117', color: '#94a3b8', border: '1px solid #1e293b', borderRadius: 4, padding: '2px 0' }}
                  />
                  {/* Count */}
                  <div className="flex items-center" onClick={e => e.stopPropagation()}>
                    <button onClick={() => updateItem(item.id, { count: Math.max(1, item.count - 1) })}
                      className="w-5 h-5 text-gray-500 hover:text-white text-xs flex items-center justify-center">−</button>
                    <input type="number" min="1"
                      value={item.count}
                      onChange={e => updateItem(item.id, { count: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-8 text-xs text-center font-mono outline-none"
                      style={{ background: 'transparent', color: '#e2e8f0' }}
                    />
                    <button onClick={() => updateItem(item.id, { count: item.count + 1 })}
                      className="w-5 h-5 text-gray-500 hover:text-white text-xs flex items-center justify-center">+</button>
                  </div>
                  {/* Stackable */}
                  <button onClick={e => { e.stopPropagation(); updateItem(item.id, { stackable: !item.stackable }); }}
                    className="text-xs transition-all mx-auto flex items-center justify-center w-5 h-5 rounded"
                    title="적재 가능"
                    style={{ color: item.stackable ? '#22c55e' : '#dc2626', background: item.stackable ? '#052e16' : '#2d0a0a' }}>
                    {item.stackable ? '✓' : '✗'}
                  </button>
                  {/* Fragile */}
                  <button onClick={e => { e.stopPropagation(); updateItem(item.id, { fragile: !item.fragile }); }}
                    className="text-xs transition-all mx-auto flex items-center justify-center w-5 h-5 rounded"
                    title="취급주의"
                    style={{ color: item.fragile ? '#fbbf24' : '#475569', background: item.fragile ? '#2d1a00' : 'transparent' }}>
                    ⚠
                  </button>
                  {/* No rotate */}
                  <button onClick={e => { e.stopPropagation(); updateItem(item.id, { noRotate: !item.noRotate }); }}
                    className="text-xs transition-all mx-auto flex items-center justify-center w-5 h-5 rounded"
                    title="회전 금지"
                    style={{ color: item.noRotate ? '#a78bfa' : '#475569', background: item.noRotate ? '#1a0a2d' : 'transparent' }}>
                    🔒
                  </button>
                  {/* Delete */}
                  <button onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                    className="text-gray-700 hover:text-red-400 text-xs transition-colors mx-auto">
                    ✕
                  </button>
                </div>

                {/* Result sub-row */}
                {result && (
                  <div className="px-2 pb-1 flex items-center gap-2 text-xs">
                    <div className="flex-1 h-1 rounded-full" style={{ background: '#1e293b' }}>
                      <div className="h-1 rounded-full transition-all"
                        style={{
                          width: `${item.count > 0 ? ((result.placedCount.get(item.id)||0) / item.count * 100) : 0}%`,
                          background: item.color,
                        }} />
                    </div>
                    <span style={{ color: item.color }} className="font-mono">
                      {result.placedCount.get(item.id) || 0}/{item.count}
                    </span>
                    {(item.count - (result.placedCount.get(item.id)||0)) > 0 && (
                      <span className="text-red-400">-{item.count - (result.placedCount.get(item.id)||0)}</span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Add preset buttons */}
            <div className="p-3">
              <p className="text-gray-600 text-xs mb-2">프리셋 추가</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: '소형', w: 30, h: 20, d: 25, weight: 2 },
                  { name: '중형', w: 50, h: 35, d: 40, weight: 8 },
                  { name: '대형', w: 60, h: 50, d: 45, weight: 18 },
                  { name: '의류', w: 70, h: 35, d: 45, weight: 5 },
                  { name: '가전', w: 80, h: 60, d: 60, weight: 22 },
                  { name: '팔레트', w: 120, h: 90, d: 100, weight: 60 },
                ].map((p, i) => (
                  <button key={i} onClick={() => {
                    setItems(prev => [...prev, {
                      id: newId(), name: p.name + ' 박스',
                      w: p.w, h: p.h, d: p.d, weight: p.weight,
                      count: 5, color: COLORS[colorIdx % COLORS.length],
                      stackable: true, fragile: false, noRotate: false,
                    }]);
                    setColorIdx(c => c + 1);
                    setResult(null);
                  }}
                    className="text-xs px-2.5 py-1 rounded transition-all"
                    style={{ background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
                    + {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── 중앙: 뷰어 ── */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#080c18' }}>
          {/* View area */}
          <div className="flex-1 relative">
            {viewMode === '3d' ? (
              <>
                <Viewer3D
                  container={container}
                  placed={visiblePlaced}
                  highlightId={highlightId}
                  showLabels={showLabels}
                  showSeq={showSeq}
                  showCOG={showCOG}
                  cog={result?.cog ?? null}
                />
                {/* Container info overlay */}
                <div className="absolute top-3 left-3 pointer-events-none"
                  style={{ background: 'rgba(10,15,30,0.85)', border: '1px solid #1e293b', borderRadius: 10, padding: '8px 12px' }}>
                  <div className="font-bold text-white text-sm">{container.label}</div>
                  <div className="text-gray-400 text-xs mt-0.5 font-mono">{container.W}×{container.D}×{container.H} cm</div>
                  <div className="text-gray-500 text-xs">{container.cbm} CBM · {container.maxW.toLocaleString()} kg</div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <ProjectionView
                  placed={visiblePlaced}
                  container={container}
                  view={viewMode as 'top' | 'front' | 'side'}
                  visCount={showCount}
                />
              </div>
            )}
          </div>

          {/* Animation controls */}
          {result && result.placed.length > 0 && (
            <div style={{ background: '#0d1117', borderTop: '1px solid #1e293b', padding: '10px 16px' }}>
              <div className="flex items-center gap-3">
                <button onClick={handlePlay} disabled={isPlaying}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all flex-shrink-0"
                  style={{ background: '#1d4ed8', color: '#fff', opacity: isPlaying ? 0.5 : 1 }}>
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button onClick={() => { setIsPlaying(false); setShowCount(result.placed.length); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: '#1e293b', color: '#94a3b8' }}>
                  ⏭
                </button>
                <input type="range" min="0" max={result.placed.length} value={showCount}
                  onChange={e => { setIsPlaying(false); setShowCount(parseInt(e.target.value)); }}
                  className="flex-1 accent-blue-500" style={{ accentColor: '#3b82f6' }}
                />
                <span className="text-gray-500 text-xs font-mono flex-shrink-0 w-14 text-right">
                  {showCount} / {result.placed.length}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── 오른쪽: 통계 ── */}
        <div style={{ width: 264, background: '#161b27', borderLeft: '1px solid #1e293b' }}
          className="flex-shrink-0 overflow-y-auto">
          <div style={{ borderBottom: '1px solid #1e293b' }} className="px-4 py-2.5">
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">적재 통계</span>
          </div>

          <div className="p-4 space-y-4">
            {/* Utilization gauges */}
            <div className="flex gap-4 justify-center">
              <div className="text-center">
                <Ring pct={utilPct} color={utilPct > 80 ? '#22c55e' : utilPct > 60 ? '#3b82f6' : '#eab308'} />
                <div className="text-xs text-gray-500 mt-1">공간 활용</div>
                <div className="text-xs text-gray-400 font-mono">{nm(usedCBM,2)} CBM</div>
              </div>
              <div className="text-center">
                <Ring pct={weightPct} color={weightPct > 90 ? '#ef4444' : weightPct > 70 ? '#f97316' : '#22c55e'} />
                <div className="text-xs text-gray-500 mt-1">중량 활용</div>
                <div className="text-xs text-gray-400 font-mono">{nm(result?.totalWeight || 0)} kg</div>
              </div>
            </div>

            {/* Summary stats */}
            {result && (
              <div className="space-y-2">
                {[
                  { label: '적재 박스', val: `${placedTotal}개`, color: '#22c55e' },
                  { label: '미적재', val: unplacedTotal > 0 ? `${unplacedTotal}개` : '없음', color: unplacedTotal > 0 ? '#ef4444' : '#4b5563' },
                  { label: '총 중량', val: `${nm(result.totalWeight)} kg`, color: '#94a3b8' },
                  { label: '잔여 하중', val: `${nm(container.maxW - result.totalWeight)} kg`, color: '#4b5563' },
                  { label: '적재 CBM', val: `${nm(usedCBM, 3)} m³`, color: '#60a5fa' },
                  { label: '잔여 공간', val: `${nm(containerCBM - usedCBM, 3)} m³`, color: '#4b5563' },
                ].map((s, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">{s.label}</span>
                    <span className="text-xs font-mono font-medium" style={{ color: s.color }}>{s.val}</span>
                  </div>
                ))}
              </div>
            )}

            {/* COG info */}
            {result?.cog && showCOG && (
              <div style={{ border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px' }}>
                <div className="text-xs text-gray-400 font-semibold mb-2 flex items-center gap-1.5">
                  <span style={{ color: '#f43f5e' }}>●</span> 무게중심 (COG)
                </div>
                {[
                  { axis: 'X (좌우)', val: result.cog.x, max: container.W, ideal: container.W / 2 },
                  { axis: 'Y (높이)', val: result.cog.y, max: container.H, ideal: container.H / 3 },
                  { axis: 'Z (전후)', val: result.cog.z, max: container.D, ideal: container.D / 2 },
                ].map((c, i) => (
                  <div key={i} className="mb-1.5">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-500">{c.axis}</span>
                      <span className="font-mono text-gray-300">{nm(c.val)} cm</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: '#1e293b', position: 'relative' }}>
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${(c.val / c.max) * 100}%`, background: '#f43f5e' }} />
                      <div className="absolute top-0 h-1.5 w-0.5" style={{ left: `${(c.ideal / c.max) * 100}%`, background: '#4b5563' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Item breakdown */}
            {result && itemStats.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">품목별 현황</div>
                <div className="space-y-2">
                  {itemStats.map(b => (
                    <div key={b.id}
                      onClick={() => setHighlightId(prev => prev === b.id ? null : b.id)}
                      className="cursor-pointer rounded-lg p-2 transition-all"
                      style={{ background: highlightId === b.id ? '#0f2040' : '#0d1117', border: `1px solid ${highlightId === b.id ? '#1d4ed8' : '#1e293b'}` }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: b.color }} />
                        <span className="text-xs text-gray-300 font-medium truncate">{b.name}</span>
                      </div>
                      <div className="h-1 rounded-full" style={{ background: '#1e293b' }}>
                        <div className="h-1 rounded-full" style={{ width: `${b.count > 0 ? (b.placed/b.count)*100 : 0}%`, background: b.color }} />
                      </div>
                      <div className="flex justify-between mt-1 text-xs font-mono">
                        <span style={{ color: b.color }}>{b.placed}/{b.count}</span>
                        <span className="text-gray-600">{nm(b.cbm, 3)} m³</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2D mini views */}
            {result && result.placed.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">투영도</div>
                {(['top','front','side'] as const).map(v => (
                  <div key={v}>
                    <ProjectionView
                      placed={visiblePlaced}
                      container={container}
                      view={v}
                      visCount={showCount}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 비교 모달 ── */}
      {showCompare && compareData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#161b27', border: '1px solid #1e293b', borderRadius: 16, width: 640, maxWidth: '95vw', maxHeight: '80vh', overflow: 'auto' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #1e293b' }}>
              <h2 className="font-bold text-white">컨테이너 비교 분석</h2>
              <button onClick={() => setShowCompare(false)} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-3 gap-4">
                {(Object.entries(CONTAINERS) as [string, ContainerConfig][]).map(([k, c]) => {
                  const r = compareData[k];
                  const cbm2 = r.placed.reduce((s, p) => s + p.w * p.h * p.d / 1e6, 0);
                  const util = (cbm2 / (c.W * c.H * c.D / 1e6)) * 100;
                  const total = items.reduce((s, b) => s + b.count, 0);
                  const unpl = total - r.placed.length;
                  const best = Object.values(compareData).every(rd => r.placed.length >= rd.placed.length);

                  return (
                    <div key={k} style={{
                      background: '#0d1117',
                      border: `2px solid ${best ? '#16a34a' : '#1e293b'}`,
                      borderRadius: 12, padding: 20,
                    }}>
                      {best && <div className="text-xs text-green-400 font-bold mb-2">✓ 최적</div>}
                      <div className="font-bold text-white text-base mb-1">{c.label}</div>
                      <div className="text-gray-500 text-xs mb-4">{c.cbm} CBM · {c.maxW.toLocaleString()} kg</div>

                      <div className="space-y-3">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">공간 활용률</div>
                          <div className="h-2 rounded-full" style={{ background: '#1e293b' }}>
                            <div className="h-2 rounded-full" style={{ width: `${util}%`, background: util > 80 ? '#22c55e' : '#3b82f6' }} />
                          </div>
                          <div className="text-right text-xs font-mono mt-0.5" style={{ color: util > 80 ? '#22c55e' : '#3b82f6' }}>{nm(util)}%</div>
                        </div>

                        {[
                          { label: '적재', val: `${r.placed.length}개`, color: '#22c55e' },
                          { label: '미적재', val: unpl > 0 ? `${unpl}개` : '없음', color: unpl > 0 ? '#ef4444' : '#4b5563' },
                          { label: '중량', val: `${nm(r.totalWeight)} kg`, color: '#94a3b8' },
                          { label: '활용', val: `${nm(cbm2, 2)} m³`, color: '#60a5fa' },
                        ].map((s, i) => (
                          <div key={i} className="flex justify-between">
                            <span className="text-xs text-gray-500">{s.label}</span>
                            <span className="text-xs font-mono" style={{ color: s.color }}>{s.val}</span>
                          </div>
                        ))}
                      </div>

                      <button onClick={() => { setCtype(k as CType); setResult(r); setShowCount(r.placed.length); setShowCompare(false); }}
                        className="w-full mt-4 py-1.5 rounded text-xs font-medium transition-all"
                        style={{ background: best ? '#16a34a' : '#1d4ed8', color: '#fff' }}>
                        이 컨테이너 선택
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
