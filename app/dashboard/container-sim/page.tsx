'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';

const Viewer3D = dynamic(() => import('./Viewer3D'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#070d1f] rounded-xl">
      <div className="text-gray-500 text-sm animate-pulse">3D 뷰어 초기화 중...</div>
    </div>
  ),
});

// ── 컨테이너 규격 (내부 치수, cm / 최대 중량 kg) ─────────────────────────────
export const CONTAINERS = {
  '20ft': { name: '20ft', W: 590, H: 238, D: 235, maxW: 21800, cbm: 33.1, label: '20ft FCL', icon: '📦' },
  '40ft': { name: '40ft', W: 1202, H: 238, D: 235, maxW: 26680, cbm: 67.5, label: '40ft FCL', icon: '📦' },
  '40hc': { name: '40hc', W: 1202, H: 269, D: 235, maxW: 26450, cbm: 76.3, label: "40ft HC FCL", icon: '📦' },
} as const;

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#84cc16', '#06b6d4', '#a78bfa', '#fb923c',
];

const BOX_PRESETS = [
  { name: '소형 박스', w: 30, h: 20, d: 25, weight: 2 },
  { name: '중형 박스', w: 50, h: 35, d: 40, weight: 8 },
  { name: '대형 박스', w: 60, h: 50, d: 45, weight: 18 },
  { name: '의류 박스', w: 70, h: 35, d: 45, weight: 5 },
  { name: '가전제품', w: 80, h: 60, d: 60, weight: 22 },
  { name: '팔레트', w: 120, h: 90, d: 100, weight: 60 },
];

// ── 타입 ──────────────────────────────────────────────────────────────────────
export interface BoxItem {
  id: string;
  name: string;
  w: number; h: number; d: number;
  weight: number;
  count: number;
  color: string;
}

export interface PlacedBox {
  boxId: string;
  name: string;
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  color: string;
  weight: number;
  idx: number;
}

export interface ContainerConfig {
  name: string; W: number; H: number; D: number;
  maxW: number; cbm: number; label: string; icon: string;
}

// ── 3D 빈 패킹 알고리즘 (Extreme Point + Gravity) ─────────────────────────────
function getRotations(w: number, h: number, d: number): [number, number, number][] {
  const seen = new Set<string>();
  const out: [number, number, number][] = [];
  for (const [a, b, c] of [[w,h,d],[w,d,h],[h,w,d],[h,d,w],[d,w,h],[d,h,w]]) {
    const k = `${a}-${b}-${c}`;
    if (!seen.has(k)) { seen.add(k); out.push([a, b, c]); }
  }
  return out;
}

function getFloor(x: number, z: number, w: number, d: number, placed: PlacedBox[]): number {
  let fl = 0;
  for (const p of placed) {
    if (x < p.x + p.w && x + w > p.x && z < p.z + p.d && z + d > p.z) {
      fl = Math.max(fl, p.y + p.h);
    }
  }
  return fl;
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

export function packBoxes(
  container: ContainerConfig,
  items: BoxItem[],
  respectWeight: boolean,
): {
  placed: PlacedBox[];
  placedCount: Map<string, number>;
  totalWeight: number;
} {
  const queue: BoxItem[] = [];
  for (const item of items) {
    for (let i = 0; i < item.count; i++) queue.push(item);
  }
  queue.sort((a, b) => b.w * b.h * b.d - a.w * a.h * a.d);

  const placed: PlacedBox[] = [];
  let totalWeight = 0;
  let epts = [{ x: 0, y: 0, z: 0 }];
  const pCount = new Map<string, number>();

  for (const item of queue) {
    if (respectWeight && totalWeight + item.weight > container.maxW) continue;

    const rots = getRotations(item.w, item.h, item.d);
    const sorted = [...epts].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

    let placed_flag = false;
    for (const ep of sorted) {
      if (placed_flag) break;
      for (const [rw, rh, rd] of rots) {
        const fy = getFloor(ep.x, ep.z, rw, rd, placed);
        const y = Math.max(ep.y, fy);
        if (canPlace(ep.x, y, ep.z, rw, rh, rd, container, placed)) {
          placed.push({ boxId: item.id, name: item.name, x: ep.x, y, z: ep.z, w: rw, h: rh, d: rd, color: item.color, weight: item.weight, idx: placed.length });
          totalWeight += item.weight;
          pCount.set(item.id, (pCount.get(item.id) || 0) + 1);
          epts.push({ x: ep.x + rw, y, z: ep.z }, { x: ep.x, y: y + rh, z: ep.z }, { x: ep.x, y, z: ep.z + rd });
          // Prune extreme points
          const seen2 = new Set<string>();
          epts = epts.filter(e => {
            if (e.x >= container.W || e.y >= container.H || e.z >= container.D) return false;
            const k = `${e.x}|${e.y}|${e.z}`;
            return seen2.has(k) ? false : !!seen2.add(k);
          });
          placed_flag = true;
          break;
        }
      }
    }
  }

  return { placed, placedCount: pCount, totalWeight };
}

function fmt(n: number, d = 1) { return n.toLocaleString('ko-KR', { maximumFractionDigits: d }); }

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function ContainerSimPage() {
  type CType = keyof typeof CONTAINERS;
  const [ctype, setCtype] = useState<CType>('20ft');
  const [boxes, setBoxes] = useState<BoxItem[]>([]);
  const [result, setResult] = useState<ReturnType<typeof packBoxes> | null>(null);
  const [showCount, setShowCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [respectWeight, setRespectWeight] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [colorIdx, setColorIdx] = useState(0);
  const [isCalc, setIsCalc] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form
  const [form, setForm] = useState({ name: '', w: '', h: '', d: '', weight: '', count: '1' });
  const [formErr, setFormErr] = useState('');

  const container = CONTAINERS[ctype];

  // Animation play/stop
  useEffect(() => {
    if (isPlaying && result) {
      playRef.current = setInterval(() => {
        setShowCount(prev => {
          if (prev >= result.placed.length) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 80);
    } else {
      if (playRef.current) clearInterval(playRef.current);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [isPlaying, result]);

  const handlePreset = (p: typeof BOX_PRESETS[0]) => {
    setForm({ name: p.name, w: String(p.w), h: String(p.h), d: String(p.d), weight: String(p.weight), count: '1' });
    setFormErr('');
  };

  const handleAddBox = () => {
    const w = parseInt(form.w), h = parseInt(form.h), d = parseInt(form.d);
    const weight = parseFloat(form.weight) || 0;
    const count = Math.max(1, parseInt(form.count) || 1);
    if (!form.name.trim()) return setFormErr('박스 이름을 입력하세요');
    if (!w || !h || !d || w <= 0 || h <= 0 || d <= 0) return setFormErr('박스 치수를 입력하세요');
    if (w > container.W || h > container.H || d > container.D) return setFormErr(`박스가 컨테이너보다 큽니다`);
    const newBox: BoxItem = {
      id: `box-${Date.now()}`,
      name: form.name.trim(),
      w, h, d, weight, count,
      color: COLORS[colorIdx % COLORS.length],
    };
    setBoxes(prev => [...prev, newBox]);
    setColorIdx(prev => prev + 1);
    setForm({ name: '', w: '', h: '', d: '', weight: '', count: '1' });
    setFormErr('');
    setResult(null);
  };

  const handleRemoveBox = (id: string) => {
    setBoxes(prev => prev.filter(b => b.id !== id));
    setResult(null);
  };

  const handleCalculate = useCallback(() => {
    if (boxes.length === 0) return;
    setIsCalc(true);
    setTimeout(() => {
      const r = packBoxes(container, boxes, respectWeight);
      setResult(r);
      setShowCount(r.placed.length);
      setIsPlaying(false);
      setIsCalc(false);
    }, 10);
  }, [boxes, container, respectWeight]);

  const handlePlay = () => {
    if (!result) return;
    setShowCount(0);
    setIsPlaying(true);
  };

  const visiblePlaced = useMemo(() =>
    result ? result.placed.slice(0, showCount) : [],
    [result, showCount]
  );

  // Stats
  const totalItems = boxes.reduce((s, b) => s + b.count, 0);
  const placedTotal = result ? result.placed.length : 0;
  const unplacedTotal = totalItems - placedTotal;
  const usedCBM = result
    ? result.placed.reduce((s, p) => s + p.w * p.h * p.d / 1_000_000, 0)
    : 0;
  const containerCBM = container.W * container.H * container.D / 1_000_000;
  const utilPct = containerCBM > 0 ? (usedCBM / containerCBM) * 100 : 0;

  const boxStats = useMemo(() => {
    if (!result) return [];
    return boxes.map(b => {
      const placed_n = result.placedCount.get(b.id) || 0;
      return { ...b, placed: placed_n, unplaced: b.count - placed_n };
    });
  }, [result, boxes]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">
      {/* ── 헤더 ── */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg flex items-center gap-2">
            🏗️ 컨테이너 적재 시뮬레이터
          </h1>
          <p className="text-gray-500 text-xs mt-0.5">3D 빈 패킹 알고리즘으로 최적 적재 계산</p>
        </div>
        {result && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-green-400 font-bold">{fmt(utilPct)}% 활용</span>
            <span className="text-gray-400">적재 {placedTotal}개</span>
            {unplacedTotal > 0 && <span className="text-red-400">미적재 {unplacedTotal}개</span>}
          </div>
        )}
      </div>

      {/* ── 메인 레이아웃 ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── 왼쪽 설정 패널 ── */}
        <div className="w-80 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* 컨테이너 선택 */}
            <section>
              <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">컨테이너 규격</h2>
              <div className="space-y-2">
                {(Object.entries(CONTAINERS) as [CType, ContainerConfig][]).map(([k, c]) => (
                  <button
                    key={k}
                    onClick={() => { setCtype(k); setResult(null); }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                      ctype === k
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{c.label}</span>
                      <span className="text-xs text-gray-400">{c.cbm} CBM</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {c.W}×{c.D}×{c.H} cm · 최대 {c.maxW.toLocaleString()} kg
                    </div>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox" checked={respectWeight}
                  onChange={e => setRespectWeight(e.target.checked)}
                  className="w-4 h-4 accent-blue-500"
                />
                <span className="text-gray-400 text-xs">중량 제한 적용</span>
              </label>
            </section>

            {/* 박스 추가 폼 */}
            <section>
              <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">박스 추가</h2>

              {/* 프리셋 */}
              <div className="flex flex-wrap gap-1 mb-3">
                {BOX_PRESETS.map((p, i) => (
                  <button key={i} onClick={() => handlePreset(p)}
                    className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-colors">
                    {p.name}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <input
                  value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormErr(''); }}
                  placeholder="박스 이름"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none"
                />
                <div className="grid grid-cols-3 gap-2">
                  {['w', 'h', 'd'].map((key, i) => (
                    <div key={key}>
                      <label className="text-gray-500 text-xs block mb-1">{['가로(L)', '높이(H)', '깊이(D)'][i]} cm</label>
                      <input
                        type="number" min="1"
                        value={form[key as 'w'|'h'|'d']}
                        onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setFormErr(''); }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">중량 (kg)</label>
                    <input
                      type="number" min="0" step="0.1"
                      value={form.weight}
                      onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">수량</label>
                    <input
                      type="number" min="1" max="500"
                      value={form.count}
                      onChange={e => setForm(f => ({ ...f, count: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* 색상 선택 */}
                <div>
                  <label className="text-gray-500 text-xs block mb-1.5">색상</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLORS.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => setColorIdx(i)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${i === colorIdx % COLORS.length ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>

                {formErr && <p className="text-red-400 text-xs">{formErr}</p>}

                <button
                  onClick={handleAddBox}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded-xl transition-colors font-medium"
                >
                  + 박스 추가
                </button>
              </div>
            </section>

            {/* 박스 목록 */}
            {boxes.length > 0 && (
              <section>
                <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  박스 목록 ({totalItems}개)
                </h2>
                <div className="space-y-1.5">
                  {boxes.map(b => (
                    <div
                      key={b.id}
                      className={`flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2 cursor-pointer transition-all ${
                        highlightId === b.id ? 'ring-1 ring-white' : 'hover:bg-gray-750'
                      }`}
                      onClick={() => setHighlightId(prev => prev === b.id ? null : b.id)}
                    >
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: b.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-xs font-medium truncate">{b.name}</div>
                        <div className="text-gray-500 text-xs">{b.w}×{b.h}×{b.d} cm · {b.weight}kg × {b.count}개</div>
                      </div>
                      {result && (
                        <div className="text-right flex-shrink-0">
                          <div className="text-green-400 text-xs font-medium">{result.placedCount.get(b.id) || 0}개</div>
                          {(b.count - (result.placedCount.get(b.id) || 0)) > 0 && (
                            <div className="text-red-400 text-xs">-{b.count - (result.placedCount.get(b.id) || 0)}</div>
                          )}
                        </div>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handleRemoveBox(b.id); }}
                        className="text-gray-600 hover:text-red-400 text-xs flex-shrink-0 ml-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* 계산 버튼 */}
          <div className="p-4 border-t border-gray-800">
            <button
              onClick={handleCalculate}
              disabled={boxes.length === 0 || isCalc}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
            >
              {isCalc ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  계산 중...
                </>
              ) : '🚀 최적 적재 계산'}
            </button>
          </div>
        </div>

        {/* ── 오른쪽: 3D 뷰어 + 통계 ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 3D 뷰어 */}
          <div className="flex-1 relative">
            {boxes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full bg-[#070d1f] text-gray-600">
                <div className="text-6xl mb-4">📦</div>
                <p className="text-lg font-medium text-gray-500">박스를 추가하고 계산을 시작하세요</p>
                <p className="text-sm mt-1 text-gray-600">왼쪽 패널에서 박스 종류와 수량을 입력하세요</p>
              </div>
            ) : (
              <Viewer3D
                container={container}
                placed={visiblePlaced}
                highlightId={highlightId}
              />
            )}

            {/* 컨테이너 info 오버레이 */}
            <div className="absolute top-3 left-3 bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-xl px-3 py-2 pointer-events-none">
              <div className="text-white text-sm font-bold">{container.label}</div>
              <div className="text-gray-400 text-xs">{container.W}×{container.D}×{container.H} cm · {container.cbm} CBM</div>
            </div>

            {/* 결과 오버레이 */}
            {result && (
              <div className="absolute top-3 right-3 bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-xl p-3 min-w-36">
                {/* 활용률 도넛 */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="relative w-12 h-12">
                    <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#1e3a5f" strokeWidth="4" />
                      <circle cx="18" cy="18" r="14" fill="none"
                        stroke={utilPct > 80 ? '#22c55e' : utilPct > 60 ? '#3b82f6' : '#eab308'}
                        strokeWidth="4"
                        strokeDasharray={`${utilPct * 0.879} 87.9`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">{Math.round(utilPct)}%</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-300 text-xs">공간 활용률</div>
                    <div className="text-white text-xs">{fmt(usedCBM)} / {fmt(containerCBM)} CBM</div>
                  </div>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">적재 박스</span>
                    <span className="text-green-400 font-medium">{placedTotal}개</span>
                  </div>
                  {unplacedTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">미적재</span>
                      <span className="text-red-400 font-medium">{unplacedTotal}개</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-400">총 중량</span>
                    <span className="text-white">{fmt(result.totalWeight)} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">잔여 하중</span>
                    <span className="text-gray-300">{fmt(container.maxW - result.totalWeight)} kg</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 애니메이션 컨트롤 */}
          {result && result.placed.length > 0 && (
            <div className="flex-shrink-0 bg-gray-900 border-t border-gray-800 px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePlay}
                  disabled={isPlaying}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white flex items-center justify-center text-sm transition-all"
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button
                  onClick={() => { setIsPlaying(false); setShowCount(result.placed.length); }}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-sm transition-all"
                >
                  ⏭
                </button>
                <div className="flex-1">
                  <input
                    type="range" min="0" max={result.placed.length} value={showCount}
                    onChange={e => { setIsPlaying(false); setShowCount(parseInt(e.target.value)); }}
                    className="w-full accent-blue-500"
                  />
                </div>
                <div className="text-gray-400 text-xs flex-shrink-0 w-16 text-right">
                  {showCount} / {result.placed.length}
                </div>
              </div>

              {/* 박스별 통계 테이블 */}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs text-gray-400">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left pb-1.5 font-medium">박스</th>
                      <th className="text-right pb-1.5 font-medium">치수 (cm)</th>
                      <th className="text-right pb-1.5 font-medium">수량</th>
                      <th className="text-right pb-1.5 font-medium">적재</th>
                      <th className="text-right pb-1.5 font-medium">미적재</th>
                      <th className="text-right pb-1.5 font-medium">CBM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxStats.map(b => (
                      <tr
                        key={b.id}
                        onClick={() => setHighlightId(prev => prev === b.id ? null : b.id)}
                        className={`border-b border-gray-800/50 cursor-pointer transition-colors ${
                          highlightId === b.id ? 'bg-white/5' : 'hover:bg-white/3'
                        }`}
                      >
                        <td className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: b.color }} />
                            <span className="text-gray-300">{b.name}</span>
                          </div>
                        </td>
                        <td className="text-right text-gray-500">{b.w}×{b.h}×{b.d}</td>
                        <td className="text-right">{b.count}</td>
                        <td className="text-right text-green-400 font-medium">{b.placed}</td>
                        <td className={`text-right font-medium ${b.unplaced > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                          {b.unplaced > 0 ? b.unplaced : '—'}
                        </td>
                        <td className="text-right text-gray-500">
                          {fmt(b.placed * b.w * b.h * b.d / 1_000_000, 3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-gray-300 font-medium">
                      <td className="pt-1.5" colSpan={2}>합계</td>
                      <td className="text-right pt-1.5">{totalItems}</td>
                      <td className="text-right pt-1.5 text-green-400">{placedTotal}</td>
                      <td className={`text-right pt-1.5 ${unplacedTotal > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                        {unplacedTotal > 0 ? unplacedTotal : '—'}
                      </td>
                      <td className="text-right pt-1.5 text-blue-400">{fmt(usedCBM, 3)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
