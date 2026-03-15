'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ── 타입 ──────────────────────────────────────────────────────────────────────
interface TextLayer {
  id: string; type: 'text';
  text: string;
  x: number; y: number;          // 0~100 (% of canvas)
  fontSize: number;              // px at 1080px reference width
  maxWidth: number;              // % of canvas width
  color: string;
  fontWeight: 'normal' | 'bold' | 'black';
  fontFamily: string;
  textAlign: CanvasTextAlign;
  lineHeight: number;
  rotation: number; opacity: number;
  stroke: boolean; strokeColor: string; strokeWidth: number;
  shadow: boolean;
  bgColor: string; bgOpacity: number;
  letterSpacing: number;
}
interface ImageLayer {
  id: string; type: 'image';
  url: string;
  x: number; y: number;
  width: number; height: number; // % of canvas
  rotation: number; opacity: number;
  flip: boolean;
}
type Layer = TextLayer | ImageLayer;

interface BgConfig {
  type: 'color' | 'gradient' | 'image';
  color: string;
  gradColor1: string; gradColor2: string; gradAngle: number;
  imageUrl: string; imageDim: number;
}

const FORMATS: Record<string, { label: string; icon: string; w: number; h: number }> = {
  youtube:   { label: 'YouTube (16:9)',        icon: '▶️', w: 1280, h: 720  },
  shorts:    { label: 'Shorts / TikTok (9:16)',icon: '📱', w: 1080, h: 1920 },
  instagram: { label: 'Instagram (1:1)',        icon: '📷', w: 1080, h: 1080 },
  naver:     { label: '네이버 (16:9)',           icon: '🟢', w: 1200, h: 675  },
};

const FONTS = [
  'Noto Sans KR', 'Noto Serif KR',
  'Impact', 'Arial Black', 'Georgia',
  'Courier New', 'Comic Sans MS',
];

const PRESETS: { label: string; fn: (w: number, h: number) => Partial<BgConfig> & { layers?: Partial<TextLayer>[] } }[] = [
  { label: '🔥 임팩트', fn: (w,h) => ({ type: 'gradient', gradColor1: '#ff6b35', gradColor2: '#f7c59f', gradAngle: 135 }) },
  { label: '🌙 다크', fn: (w,h) => ({ type: 'gradient', gradColor1: '#0a0a0a', gradColor2: '#1a1a2e', gradAngle: 180 }) },
  { label: '💜 그라디언트', fn: (w,h) => ({ type: 'gradient', gradColor1: '#667eea', gradColor2: '#764ba2', gradAngle: 135 }) },
  { label: '🔵 블루', fn: (w,h) => ({ type: 'gradient', gradColor1: '#1e3a8a', gradColor2: '#06b6d4', gradAngle: 45 }) },
  { label: '🟢 성공', fn: (w,h) => ({ type: 'gradient', gradColor1: '#064e3b', gradColor2: '#10b981', gradAngle: 135 }) },
  { label: '⚡ 엘로우', fn: (w,h) => ({ type: 'gradient', gradColor1: '#78350f', gradColor2: '#fbbf24', gradAngle: 90 }) },
];

function uid() { return `l_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function mkText(y = 50): TextLayer {
  return {
    id: uid(), type: 'text',
    text: '제목을 입력하세요',
    x: 50, y,
    fontSize: 90, maxWidth: 85,
    color: '#ffffff',
    fontWeight: 'black', fontFamily: 'Noto Sans KR',
    textAlign: 'center', lineHeight: 1.2,
    rotation: 0, opacity: 1,
    stroke: true, strokeColor: '#000000', strokeWidth: 4,
    shadow: true,
    bgColor: '#000000', bgOpacity: 0,
    letterSpacing: 0,
  };
}
function mkImg(url: string): ImageLayer {
  return { id: uid(), type: 'image', url, x: 50, y: 50, width: 40, height: 40, rotation: 0, opacity: 1, flip: false };
}

// ── 캔버스 렌더 함수 ──────────────────────────────────────────────────────────
function renderToCanvas(
  canvas: HTMLCanvasElement,
  cw: number, ch: number,
  layers: Layer[],
  bg: BgConfig,
  images: Map<string, HTMLImageElement>,
  selectedId: string | null = null,
) {
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  const sc = cw / 1080;

  // Background
  ctx.save();
  if (bg.type === 'color') {
    ctx.fillStyle = bg.color; ctx.fillRect(0, 0, cw, ch);
  } else if (bg.type === 'gradient') {
    const rad = (bg.gradAngle * Math.PI) / 180;
    const gx1 = cw / 2 - Math.cos(rad) * cw / 2, gy1 = ch / 2 - Math.sin(rad) * ch / 2;
    const gx2 = cw / 2 + Math.cos(rad) * cw / 2, gy2 = ch / 2 + Math.sin(rad) * ch / 2;
    const grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
    grad.addColorStop(0, bg.gradColor1); grad.addColorStop(1, bg.gradColor2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, cw, ch);
  } else if (bg.type === 'image' && bg.imageUrl) {
    const img = images.get(bg.imageUrl);
    if (img) {
      const r = Math.max(cw / img.width, ch / img.height) * (bg.imageDim / 100);
      const dw = img.width * r, dh = img.height * r;
      ctx.globalAlpha = 1;
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, cw, ch);
    }
  }
  ctx.restore();

  // Layers
  for (const layer of layers) {
    const lx = (layer.x / 100) * cw;
    const ly = (layer.y / 100) * ch;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.translate(lx, ly);
    ctx.rotate((layer.rotation * Math.PI) / 180);

    if (layer.type === 'image') {
      const img = images.get(layer.url);
      if (img) {
        const lw = (layer.width / 100) * cw;
        const lh = (layer.height / 100) * ch;
        if (layer.flip) { ctx.scale(-1, 1); }
        ctx.drawImage(img, -lw / 2, -lh / 2, lw, lh);
      }
    } else {
      const tl = layer as TextLayer;
      if (!tl.text) { ctx.restore(); continue; }
      const fs = Math.round(tl.fontSize * sc);
      const weight = tl.fontWeight === 'black' ? '900' : tl.fontWeight === 'bold' ? '700' : '400';
      ctx.font = `${weight} ${fs}px "${tl.fontFamily}", "Noto Sans KR", sans-serif`;
      ctx.textAlign = tl.textAlign;
      ctx.textBaseline = 'middle';
      if (tl.letterSpacing !== 0) ctx.letterSpacing = `${tl.letterSpacing}px`;

      // Word wrap
      const maxW = (tl.maxWidth / 100) * cw;
      const rawLines = tl.text.split('\n');
      const lines: string[] = [];
      for (const raw of rawLines) {
        const chars = raw.split('');
        let cur = '';
        for (const c of chars) {
          const test = cur + c;
          if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = c; }
          else cur = test;
        }
        lines.push(cur);
      }

      const lh = fs * tl.lineHeight;
      const totalH = lines.length * lh;
      const startY = -totalH / 2 + lh / 2;

      // Background
      if (tl.bgOpacity > 0) {
        let bw = 0;
        lines.forEach(l => { const m = ctx.measureText(l).width; if (m > bw) bw = m; });
        const padX = fs * 0.4, padY = fs * 0.2;
        const bx = tl.textAlign === 'center' ? -bw / 2 - padX : tl.textAlign === 'left' ? -padX : -(bw + padX);
        ctx.globalAlpha = tl.bgOpacity * layer.opacity;
        ctx.fillStyle = tl.bgColor;
        ctx.fillRect(bx, startY - lh / 2 - padY, bw + padX * 2, totalH + padY * 2);
        ctx.globalAlpha = layer.opacity;
      }

      lines.forEach((line, i) => {
        const ty = startY + i * lh;
        ctx.save();
        if (tl.shadow) {
          ctx.shadowColor = 'rgba(0,0,0,0.9)';
          ctx.shadowBlur = fs * 0.3;
          ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
        }
        if (tl.stroke) {
          ctx.strokeStyle = tl.strokeColor;
          ctx.lineWidth = tl.strokeWidth * sc;
          ctx.lineJoin = 'round';
          ctx.strokeText(line, 0, ty);
        }
        ctx.fillStyle = tl.color;
        ctx.fillText(line, 0, ty);
        ctx.restore();
      });
    }
    ctx.restore();

    // Selection indicator
    if (layer.id === selectedId) {
      const lx2 = (layer.x / 100) * cw;
      const ly2 = (layer.y / 100) * ch;
      ctx.save();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = Math.max(1, 2 * sc);
      ctx.setLineDash([6 * sc, 3 * sc]);
      ctx.beginPath();
      ctx.arc(lx2, ly2, 12 * sc, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function ThumbnailPage() {
  const [format, setFormat] = useState<string>('youtube');
  const [bg, setBg] = useState<BgConfig>({
    type: 'gradient', color: '#1a1a2e',
    gradColor1: '#1e3a8a', gradColor2: '#06b6d4', gradAngle: 135,
    imageUrl: '', imageDim: 100,
  });
  const [layers, setLayers] = useState<Layer[]>([mkText(45), (() => { const t = mkText(72); t.text = '부제목'; t.fontSize = 48; t.fontWeight = 'normal'; return t; })()]);
  const [selectedId, setSelectedId] = useState<string | null>(layers[0]?.id ?? null);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const images = useRef<Map<string, HTMLImageElement>>(new Map());

  const fmt = FORMATS[format];
  // Display canvas — fit in panel
  const displayW = format === 'youtube' || format === 'naver' ? 576 : format === 'instagram' ? 400 : 270;
  const displayH = Math.round(displayW * fmt.h / fmt.w);
  const sc = displayW / fmt.w;

  const loadImg = useCallback((url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      if (images.current.has(url)) { resolve(images.current.get(url)!); return; }
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { images.current.set(url, img); resolve(img); };
      img.onerror = reject; img.src = url;
    }), []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderToCanvas(canvas, displayW, displayH, layers, bg, images.current, selectedId);
  }, [layers, bg, displayW, displayH, selectedId]);

  useEffect(() => { redraw(); }, [redraw]);

  // Preload bg image
  useEffect(() => {
    if (bg.type === 'image' && bg.imageUrl) {
      loadImg(bg.imageUrl).then(() => redraw()).catch(() => {});
    }
  }, [bg.imageUrl, bg.type, loadImg, redraw]);

  // Preload layer images
  useEffect(() => {
    layers.filter(l => l.type === 'image').forEach(l => {
      const il = l as ImageLayer;
      if (il.url) loadImg(il.url).then(() => redraw()).catch(() => {});
    });
  }, [layers, loadImg, redraw]);

  // Mouse drag
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    let hit: Layer | null = null;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      const dist = Math.hypot(l.x - mx, l.y - my);
      if (dist < 20) { hit = l; break; }
    }
    if (hit) {
      setSelectedId(hit.id);
      setDragging({ id: hit.id, startX: e.clientX, startY: e.clientY, origX: hit.x, origY: hit.y });
    } else {
      setSelectedId(null);
    }
    e.preventDefault();
  }, [layers]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const dx = ((e.clientX - dragging.startX) / rect.width) * 100;
    const dy = ((e.clientY - dragging.startY) / rect.height) * 100;
    setLayers(prev => prev.map(l => l.id === dragging.id
      ? { ...l, x: Math.min(100, Math.max(0, dragging.origX + dx)), y: Math.min(100, Math.max(0, dragging.origY + dy)) }
      : l));
  }, [dragging]);

  const onMouseUp = useCallback(() => setDragging(null), []);

  // Helpers
  const sel = layers.find(l => l.id === selectedId);
  const selText = sel?.type === 'text' ? sel as TextLayer : null;
  const selImg  = sel?.type === 'image' ? sel as ImageLayer : null;

  const upd = (id: string, patch: object) =>
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));

  const addText = () => {
    const nl = mkText(30 + (layers.length % 5) * 12);
    setLayers(p => [...p, nl]); setSelectedId(nl.id);
  };
  const delLayer = (id: string) => {
    setLayers(p => p.filter(l => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const moveUp   = (id: string) => setLayers(p => { const i = p.findIndex(l => l.id === id); if (i >= p.length - 1) return p; const n = [...p]; [n[i], n[i+1]] = [n[i+1], n[i]]; return n; });
  const moveDown = (id: string) => setLayers(p => { const i = p.findIndex(l => l.id === id); if (i <= 0) return p; const n = [...p]; [n[i], n[i-1]] = [n[i-1], n[i]]; return n; });
  const dupLayer = (id: string) => {
    const l = layers.find(x => x.id === id);
    if (!l) return;
    const nl = { ...l, id: uid(), x: l.x + 3, y: l.y + 3 };
    setLayers(p => [...p, nl]); setSelectedId(nl.id);
  };

  const uploadBg = async (file: File) => {
    const url = URL.createObjectURL(file);
    await loadImg(url).catch(() => {});
    setBg(b => ({ ...b, type: 'image', imageUrl: url }));
  };
  const uploadImgLayer = async (file: File) => {
    const url = URL.createObjectURL(file);
    await loadImg(url).catch(() => {});
    const nl = mkImg(url); setLayers(p => [...p, nl]); setSelectedId(nl.id);
  };

  const exportPng = async () => {
    const canvas = exportCanvasRef.current!;
    const urls: string[] = [];
    if (bg.type === 'image' && bg.imageUrl) urls.push(bg.imageUrl);
    layers.filter(l => l.type === 'image').forEach(l => urls.push((l as ImageLayer).url));
    await Promise.all(urls.map(u => loadImg(u).catch(() => {})));
    renderToCanvas(canvas, fmt.w, fmt.h, layers, bg, images.current);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `thumbnail_${format}_${Date.now()}.png`;
    a.click();
  };

  const applyPreset = (idx: number) => {
    const p = PRESETS[idx].fn(fmt.w, fmt.h);
    setBg(b => ({ ...b, type: p.type ?? b.type, gradColor1: p.gradColor1 ?? b.gradColor1, gradColor2: p.gradColor2 ?? b.gradColor2, gradAngle: p.gradAngle ?? b.gradAngle }));
  };

  const Slider = ({ label, min, max, step = 1, value, onChange }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void }) => (
    <div>
      <div className="text-[10px] text-gray-500 mb-0.5">{label}</div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500 h-1.5" />
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      <canvas ref={exportCanvasRef} className="hidden" />

      {/* ── 상단 툴바 ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <a href="/dashboard/shorts" className="text-gray-400 hover:text-white text-sm">←</a>
        <div className="w-px h-4 bg-gray-700" />
        <span className="text-sm font-bold">🖼️ 썸네일 제작</span>

        {/* 포맷 */}
        <div className="flex items-center gap-1 ml-2">
          {Object.entries(FORMATS).map(([k, f]) => (
            <button key={k} onClick={() => setFormat(k)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${format === k ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              {f.icon} {f.label.split(' ')[0]}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-1 rounded ml-1">
          {fmt.w}×{fmt.h}
        </span>

        {/* 프리셋 */}
        <div className="flex items-center gap-1 ml-2 border-l border-gray-700 pl-2">
          {PRESETS.map((p, i) => (
            <button key={i} onClick={() => applyPreset(i)}
              className="px-2 py-1 rounded text-[9px] bg-gray-800 hover:bg-gray-700 transition-colors">
              {p.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={exportPng}
            className="px-4 py-1.5 rounded-lg text-xs font-bold"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            ⬇️ PNG 저장
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">

        {/* ── 왼쪽: 레이어 패널 ── */}
        <div className="w-52 bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-gray-800 space-y-2">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">레이어</div>
            <div className="flex gap-1.5">
              <button onClick={addText}
                className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[10px] font-bold transition-colors">
                ＋ 텍스트
              </button>
              <label className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-[10px] font-bold text-center cursor-pointer transition-colors">
                ＋ 이미지
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadImgLayer(f); e.target.value = ''; }} />
              </label>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {[...layers].reverse().map((l) => (
              <div key={l.id}
                onClick={() => setSelectedId(l.id)}
                className={`flex items-center gap-1.5 px-2.5 py-2 border-b border-gray-800/60 cursor-pointer transition-colors ${selectedId === l.id ? 'bg-indigo-900/50 border-l-2 border-l-indigo-500' : 'hover:bg-gray-800'}`}>
                <span className="text-sm flex-shrink-0">{l.type === 'text' ? '✍️' : '🖼️'}</span>
                <span className="flex-1 text-[10px] text-gray-300 truncate">
                  {l.type === 'text' ? (l as TextLayer).text.slice(0, 16) : '이미지 레이어'}
                </span>
                <div className="flex gap-0.5 flex-shrink-0">
                  <button onClick={e => { e.stopPropagation(); moveUp(l.id); }} className="p-0.5 text-gray-500 hover:text-white text-[9px]" title="위로">▲</button>
                  <button onClick={e => { e.stopPropagation(); moveDown(l.id); }} className="p-0.5 text-gray-500 hover:text-white text-[9px]" title="아래로">▼</button>
                  <button onClick={e => { e.stopPropagation(); dupLayer(l.id); }} className="p-0.5 text-gray-500 hover:text-indigo-400 text-[9px]" title="복제">⧉</button>
                  <button onClick={e => { e.stopPropagation(); delLayer(l.id); }} className="p-0.5 text-gray-500 hover:text-red-400 text-[9px]" title="삭제">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 가운데: 캔버스 ── */}
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-950 overflow-auto p-4 gap-2">
          <div className="relative shadow-2xl" style={{ border: '2px solid rgba(99,102,241,0.5)', borderRadius: 4 }}>
            <canvas
              ref={canvasRef}
              width={displayW} height={displayH}
              style={{ width: displayW, height: displayH, display: 'block', cursor: dragging ? 'grabbing' : 'crosshair' }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove}
              onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            />
          </div>
          <p className="text-[10px] text-gray-500">캔버스를 클릭해 레이어 선택 · 드래그로 이동</p>
        </div>

        {/* ── 오른쪽: 속성 패널 ── */}
        <div className="w-72 bg-gray-900 border-l border-gray-800 overflow-y-auto flex-shrink-0">
          <div className="p-4 space-y-4">

            {/* 배경 */}
            <section>
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">🎨 배경</div>
              <div className="flex gap-1 mb-2">
                {(['color','gradient','image'] as const).map(t => (
                  <button key={t} onClick={() => setBg(b => ({ ...b, type: t }))}
                    className={`flex-1 py-1 rounded text-[9px] font-bold transition-all ${bg.type === t ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {t === 'color' ? '단색' : t === 'gradient' ? '그라디언트' : '이미지'}
                  </button>
                ))}
              </div>
              {bg.type === 'color' && (
                <input type="color" value={bg.color} onChange={e => setBg(b => ({ ...b, color: e.target.value }))}
                  className="w-full h-9 rounded cursor-pointer border border-gray-700" />
              )}
              {bg.type === 'gradient' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <div className="text-[10px] text-gray-500 mb-1">색상 1</div>
                      <input type="color" value={bg.gradColor1} onChange={e => setBg(b => ({ ...b, gradColor1: e.target.value }))} className="w-full h-8 rounded cursor-pointer" />
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] text-gray-500 mb-1">색상 2</div>
                      <input type="color" value={bg.gradColor2} onChange={e => setBg(b => ({ ...b, gradColor2: e.target.value }))} className="w-full h-8 rounded cursor-pointer" />
                    </div>
                  </div>
                  <Slider label={`방향 ${bg.gradAngle}°`} min={0} max={360} value={bg.gradAngle} onChange={v => setBg(b => ({ ...b, gradAngle: v }))} />
                </div>
              )}
              {bg.type === 'image' && (
                <div className="space-y-2">
                  <label className="flex items-center justify-center w-full h-10 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-indigo-400 text-[10px] text-gray-400 transition-colors">
                    {bg.imageUrl ? '🔄 배경 이미지 변경' : '📁 배경 이미지 업로드'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadBg(f); e.target.value = ''; }} />
                  </label>
                  {bg.imageUrl && <Slider label={`이미지 크기 ${bg.imageDim}%`} min={50} max={200} value={bg.imageDim} onChange={v => setBg(b => ({ ...b, imageDim: v }))} />}
                </div>
              )}
            </section>

            <div className="border-t border-gray-800" />

            {/* 선택된 레이어 없음 */}
            {!sel && (
              <div className="py-6 text-center text-xs text-gray-500">
                캔버스에서 레이어를 클릭하거나<br />왼쪽 목록에서 선택하세요
              </div>
            )}

            {/* ── 텍스트 레이어 속성 ── */}
            {selText && (
              <section className="space-y-3">
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">✍️ 텍스트</div>

                <textarea value={selText.text} rows={3}
                  onChange={e => upd(selText.id, { text: e.target.value })}
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded-xl text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500" />

                <div className="grid grid-cols-2 gap-2">
                  <Slider label={`X ${Math.round(selText.x)}%`} min={0} max={100} value={selText.x} onChange={v => upd(selText.id, { x: v })} />
                  <Slider label={`Y ${Math.round(selText.y)}%`} min={0} max={100} value={selText.y} onChange={v => upd(selText.id, { y: v })} />
                </div>

                <Slider label={`폰트 크기 ${selText.fontSize}px`} min={12} max={400} value={selText.fontSize} onChange={v => upd(selText.id, { fontSize: v })} />
                <Slider label={`최대 너비 ${selText.maxWidth}%`} min={10} max={100} value={selText.maxWidth} onChange={v => upd(selText.id, { maxWidth: v })} />
                <Slider label={`줄 간격 ${selText.lineHeight.toFixed(1)}`} min={0.8} max={2.5} step={0.05} value={selText.lineHeight} onChange={v => upd(selText.id, { lineHeight: v })} />
                <Slider label={`자간 ${selText.letterSpacing}px`} min={-5} max={30} value={selText.letterSpacing} onChange={v => upd(selText.id, { letterSpacing: v })} />

                <div>
                  <div className="text-[10px] text-gray-500 mb-1">폰트</div>
                  <select value={selText.fontFamily} onChange={e => upd(selText.id, { fontFamily: e.target.value })}
                    className="w-full bg-gray-800 text-white px-2 py-1.5 rounded-lg text-xs focus:outline-none">
                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>

                <div>
                  <div className="text-[10px] text-gray-500 mb-1.5">굵기</div>
                  <div className="flex gap-1">
                    {(['normal','bold','black'] as const).map(w => (
                      <button key={w} onClick={() => upd(selText.id, { fontWeight: w })}
                        className={`flex-1 py-1 rounded text-[9px] font-bold transition-all ${selText.fontWeight === w ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                        {w === 'normal' ? '보통' : w === 'bold' ? '굵게' : '최굵'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-gray-500 mb-1.5">정렬</div>
                  <div className="flex gap-1">
                    {(['left','center','right'] as CanvasTextAlign[]).map(a => (
                      <button key={String(a)} onClick={() => upd(selText.id, { textAlign: a })}
                        className={`flex-1 py-1 rounded text-xs transition-all ${selText.textAlign === a ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                        {a === 'left' ? '⬅' : a === 'center' ? '↔' : '➡'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 items-center flex-wrap">
                  <span className="text-[10px] text-gray-500">글자색</span>
                  <input type="color" value={selText.color} onChange={e => upd(selText.id, { color: e.target.value })} className="w-8 h-7 rounded cursor-pointer border border-gray-700" />
                  <span className="text-[10px] text-gray-500">외곽선색</span>
                  <input type="color" value={selText.strokeColor} onChange={e => upd(selText.id, { strokeColor: e.target.value })} className="w-8 h-7 rounded cursor-pointer border border-gray-700" />
                  <button onClick={() => upd(selText.id, { stroke: !selText.stroke })}
                    className={`px-2 py-1 rounded text-[9px] font-bold transition-all ${selText.stroke ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}>외곽선</button>
                  <button onClick={() => upd(selText.id, { shadow: !selText.shadow })}
                    className={`px-2 py-1 rounded text-[9px] font-bold transition-all ${selText.shadow ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}>그림자</button>
                </div>

                {selText.stroke && <Slider label={`외곽선 굵기 ${selText.strokeWidth}`} min={1} max={20} value={selText.strokeWidth} onChange={v => upd(selText.id, { strokeWidth: v })} />}

                <Slider label={`회전 ${selText.rotation}°`} min={-180} max={180} value={selText.rotation} onChange={v => upd(selText.id, { rotation: v })} />
                <Slider label={`투명도 ${Math.round(selText.opacity * 100)}%`} min={0} max={1} step={0.05} value={selText.opacity} onChange={v => upd(selText.id, { opacity: v })} />

                <div>
                  <div className="text-[10px] text-gray-500 mb-1.5">텍스트 배경</div>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={selText.bgColor} onChange={e => upd(selText.id, { bgColor: e.target.value })} className="w-8 h-7 rounded cursor-pointer border border-gray-700" />
                    <div className="flex-1">
                      <Slider label={`불투명도 ${Math.round(selText.bgOpacity * 100)}%`} min={0} max={1} step={0.05} value={selText.bgOpacity} onChange={v => upd(selText.id, { bgOpacity: v })} />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ── 이미지 레이어 속성 ── */}
            {selImg && (
              <section className="space-y-3">
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">🖼️ 이미지</div>
                <div className="grid grid-cols-2 gap-2">
                  <Slider label={`X ${Math.round(selImg.x)}%`} min={0} max={100} value={selImg.x} onChange={v => upd(selImg.id, { x: v })} />
                  <Slider label={`Y ${Math.round(selImg.y)}%`} min={0} max={100} value={selImg.y} onChange={v => upd(selImg.id, { y: v })} />
                </div>
                <Slider label={`너비 ${Math.round(selImg.width)}%`} min={5} max={120} value={selImg.width} onChange={v => upd(selImg.id, { width: v })} />
                <Slider label={`높이 ${Math.round(selImg.height)}%`} min={5} max={120} value={selImg.height} onChange={v => upd(selImg.id, { height: v })} />
                <Slider label={`회전 ${selImg.rotation}°`} min={-180} max={180} value={selImg.rotation} onChange={v => upd(selImg.id, { rotation: v })} />
                <Slider label={`투명도 ${Math.round(selImg.opacity * 100)}%`} min={0} max={1} step={0.05} value={selImg.opacity} onChange={v => upd(selImg.id, { opacity: v })} />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">좌우 반전</span>
                  <button onClick={() => upd(selImg.id, { flip: !selImg.flip })}
                    className={`w-9 h-5 rounded-full relative transition-all ${selImg.flip ? 'bg-indigo-600' : 'bg-gray-700'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${selImg.flip ? 'left-4' : 'left-0.5'}`} />
                  </button>
                </div>
                <label className="flex items-center justify-center w-full h-9 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-indigo-400 text-[10px] text-gray-400 transition-colors">
                  🔄 이미지 변경
                  <input type="file" accept="image/*" className="hidden" onChange={e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const url = URL.createObjectURL(f);
                    loadImg(url).then(() => upd(selImg.id, { url })).catch(() => {});
                    e.target.value = '';
                  }} />
                </label>
              </section>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
