'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { dbSavePhoto, dbGetPhotos, dbDeletePhoto, dbUpdatePhoto, type StoredPhoto } from '@/lib/camera-db';

/* ─── 24 Filter Presets ──────────────────────────────────────────────────── */
const FILTERS = [
  { id: 'normal',    name: '기본',       css: '',                                                         color: '#888' },
  { id: 'vivid',     name: '선명',       css: 'saturate(1.8) contrast(1.1)',                              color: '#f43f5e' },
  { id: 'dramatic',  name: '드라마틱',   css: 'saturate(1.4) contrast(1.6) brightness(0.85)',             color: '#7c3aed' },
  { id: 'mono',      name: '흑백',       css: 'grayscale(1)',                                             color: '#6b7280' },
  { id: 'noir',      name: '누아르',     css: 'grayscale(1) contrast(1.6) brightness(0.72)',              color: '#111' },
  { id: 'fade',      name: '페이드',     css: 'contrast(0.82) saturate(0.7) brightness(1.12)',            color: '#d4b89a' },
  { id: 'chrome',    name: '크롬',       css: 'saturate(1.7) contrast(1.15) hue-rotate(-10deg)',          color: '#38bdf8' },
  { id: 'vintage',   name: '빈티지',     css: 'sepia(0.55) contrast(1.1) saturate(1.2) brightness(0.95)',color: '#b45309' },
  { id: 'kodak',     name: '코닥',       css: 'sepia(0.2) contrast(1.05) saturate(1.35) hue-rotate(5deg)',color:'#f59e0b' },
  { id: 'warm',      name: '웜톤',       css: 'sepia(0.3) saturate(1.3) hue-rotate(-15deg)',              color: '#fb923c' },
  { id: 'cool',      name: '쿨톤',       css: 'hue-rotate(20deg) saturate(1.15)',                         color: '#818cf8' },
  { id: 'muted',     name: '뮤트',       css: 'saturate(0.6) contrast(0.88) brightness(1.08)',            color: '#94a3b8' },
  { id: 'lomo',      name: '로모',       css: 'saturate(1.6) contrast(1.35) brightness(0.82)',            color: '#16a34a' },
  { id: 'polaroid',  name: '폴라로이드', css: 'sepia(0.4) contrast(1.1) saturate(0.85) brightness(1.08)',color:'#fbbf24' },
  { id: 'cinematic', name: '시네마틱',   css: 'contrast(1.35) saturate(0.82) brightness(0.88)',           color: '#1d4ed8' },
  { id: 'golden',    name: '골든',       css: 'sepia(0.65) saturate(1.5) brightness(1.08)',               color: '#d97706' },
  { id: 'twilight',  name: '트와일라잇', css: 'hue-rotate(200deg) saturate(1.25) brightness(0.88)',       color: '#6d28d9' },
  { id: 'neon',      name: '네온',       css: 'saturate(2.2) contrast(1.25) brightness(1.12)',            color: '#10b981' },
  { id: 'desert',    name: '데저트',     css: 'sepia(0.65) saturate(1.15) hue-rotate(-30deg)',            color: '#a16207' },
  { id: 'ocean',     name: '오션',       css: 'hue-rotate(180deg) saturate(1.35) brightness(0.95)',       color: '#0284c7' },
  { id: 'forest',    name: '포레스트',   css: 'hue-rotate(90deg) saturate(1.4) brightness(0.92)',         color: '#166534' },
  { id: 'rose',      name: '로즈',       css: 'hue-rotate(-30deg) saturate(1.5) brightness(1.05)',        color: '#db2777' },
  { id: 'fuji',      name: '후지',       css: 'saturate(1.1) contrast(1.05) hue-rotate(5deg)',            color: '#9333ea' },
  { id: 'sharp',     name: '샤프',       css: 'contrast(1.4) saturate(1.2) brightness(0.95)',             color: '#ef4444' },
];

const THREE_D_GUIDES = ['정면', '우측45°', '우측90°', '후면', '좌측90°', '좌측45°', '상단'];

export default function CameraPage() {
  /* ── State ── */
  const [tab, setTab] = useState<'camera' | 'gallery' | 'edit' | 'bg' | '3d'>('camera');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [filter, setFilter] = useState('normal');
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [selected, setSelected] = useState<StoredPhoto | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [notionDbId, setNotionDbId] = useState('');
  const [flash, setFlash] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [removingBg, setRemovingBg] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [warmth, setWarmth] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [threeDPhotos, setThreeDPhotos] = useState<string[]>([]);
  const [threeDIdx, setThreeDIdx] = useState(0);
  const [dragStart, setDragStart] = useState(0);
  const [zoom, setZoom] = useState(1);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* ── Init: load DB, GPS ── */
  useEffect(() => {
    dbGetPhotos().then(setPhotos);
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        p => setLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { enableHighAccuracy: true }
      );
    }
    const savedDb = localStorage.getItem('loov_camera_notion_db');
    if (savedDb) setNotionDbId(savedDb);
  }, []);

  /* ── Camera start ── */
  const startCamera = useCallback(async () => {
    try {
      if (stream) stream.getTracks().forEach(t => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
    } catch {}
  }, [facingMode]);

  useEffect(() => {
    if (tab === 'camera' || tab === '3d') startCamera();
    else { if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); } }
  }, [tab, facingMode]);

  /* ── Capture & auto-save ── */
  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || capturing) return;
    setCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d')!;
    const filterObj = FILTERS.find(f => f.id === filter)!;

    ctx.save();
    if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.filter = filterObj.css || 'none';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const photo: StoredPhoto = {
      id: Date.now().toString(),
      dataUrl,
      filter,
      filterCss: filterObj.css,
      timestamp: new Date().toLocaleString('ko-KR'),
      lat: location?.lat,
      lng: location?.lng,
    };

    // 즉시 IndexedDB 저장 (묻지 않음)
    await dbSavePhoto(photo);
    setPhotos(prev => [photo, ...prev]);

    // 백그라운드 클라우드 업로드
    uploadToCloud(photo);

    setTimeout(() => setCapturing(false), 250);
  }, [capturing, filter, facingMode, location]);

  /* ── Cloud upload (silent background) ── */
  const uploadToCloud = async (photo: StoredPhoto) => {
    try {
      const res = await fetch('/api/camera/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: photo.dataUrl,
          filter: photo.filter,
          location: photo.lat ? { lat: photo.lat, lng: photo.lng } : null,
          notionDbId,
          metadata: { filename: `photo_${photo.id}` },
        }),
      });
      const data = await res.json();
      if (data.ok && data.cloudinaryUrl) {
        await dbUpdatePhoto(photo.id, { uploaded: true, cloudinaryUrl: data.cloudinaryUrl });
        setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, uploaded: true, cloudinaryUrl: data.cloudinaryUrl } : p));
      }
    } catch {}
  };

  /* ── Upload selected manually ── */
  const uploadSelected = async () => {
    if (!selected) return;
    setUploading(true);
    setUploadMsg('업로드 중...');
    try {
      await uploadToCloud(selected);
      setUploadMsg('✅ 완료');
    } catch { setUploadMsg('❌ 실패'); }
    setUploading(false);
    setTimeout(() => setUploadMsg(''), 2500);
  };

  /* ── 3D Capture ── */
  const capture3D = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const url = canvas.toDataURL('image/jpeg', 0.9);
    const next = [...threeDPhotos, url];
    setThreeDPhotos(next);
    if (next.length < THREE_D_GUIDES.length) setThreeDIdx(next.length);
  }, [threeDPhotos]);

  /* ── Background removal ── */
  const removeBg = async () => {
    if (!selected) return;
    setRemovingBg(true);
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const blob = await removeBackground(selected.dataUrl, { output: { format: 'image/png', quality: 0.9 } });
      const url = URL.createObjectURL(blob);
      const updated = { ...selected, processedUrl: url };
      await dbUpdatePhoto(selected.id, { processedUrl: url });
      setSelected(updated);
      setPhotos(prev => prev.map(p => p.id === selected.id ? updated : p));
    } catch (e: any) { alert('배경 제거 실패: ' + e.message); }
    setRemovingBg(false);
  };

  /* ── Edit CSS ── */
  const editCss = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${warmth}%)`;

  /* ── Apply edits to canvas & save ── */
  const applyEdits = async () => {
    if (!selected || !canvasRef.current) return;
    const img = new Image();
    img.onload = async () => {
      const canvas = canvasRef.current!;
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.filter = editCss;
      ctx.drawImage(img, 0, 0);
      const url = canvas.toDataURL('image/jpeg', 0.92);
      const updated = { ...selected, processedUrl: url };
      await dbUpdatePhoto(selected.id, { processedUrl: url });
      setSelected(updated);
      setPhotos(prev => prev.map(p => p.id === selected.id ? updated : p));
    };
    img.src = selected.processedUrl || selected.dataUrl;
  };

  /* ── Download ── */
  const download = (photo: StoredPhoto) => {
    const a = document.createElement('a');
    a.href = photo.processedUrl || photo.dataUrl;
    a.download = `loov_${photo.id}.${photo.processedUrl ? 'png' : 'jpg'}`;
    a.click();
  };

  /* ── Delete ── */
  const deletePhoto = async (photo: StoredPhoto) => {
    await dbDeletePhoto(photo.id);
    setPhotos(prev => prev.filter(p => p.id !== photo.id));
    if (selected?.id === photo.id) { setSelected(null); setTab('gallery'); }
  };

  const filterCss = FILTERS.find(f => f.id === filter)?.css || '';
  const currentFilter = FILTERS.find(f => f.id === filter)!;

  /* ═══════════════════════ RENDER ═══════════════════════════════════════ */
  return (
    <div className="flex flex-col bg-black overflow-hidden" style={{ height: '100dvh' }}>
      <canvas ref={canvasRef} className="hidden" />

      {/* ══════════════ CAMERA ══════════════ */}
      {tab === 'camera' && (
        <div className="flex-1 flex flex-col min-h-0">

          {/* Viewfinder — takes up most space */}
          <div className="relative flex-1 bg-black overflow-hidden">
            <video
              ref={videoRef} autoPlay playsInline muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                filter: filterCss || 'none',
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                scale: zoom,
              }}
            />

            {/* Capture flash */}
            {capturing && <div className="absolute inset-0 bg-white/60 z-30 pointer-events-none" />}

            {/* Top HUD */}
            <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between z-20 bg-gradient-to-b from-black/50 to-transparent">
              <button onClick={() => setFlash(f => !f)}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold transition-all ${flash ? 'bg-yellow-400 text-black' : 'bg-white/20 text-white'}`}>
                ⚡
              </button>

              <div className="flex items-center gap-2">
                {location && (
                  <span className="text-white/70 text-xs bg-black/30 px-2 py-1 rounded-full">
                    📍 {location.lat.toFixed(3)},{location.lng.toFixed(3)}
                  </span>
                )}
                <button onClick={() => setShowSettings(s => !s)}
                  className="w-9 h-9 rounded-full bg-white/20 text-white flex items-center justify-center text-lg">
                  ⚙️
                </button>
              </div>
            </div>

            {/* Settings dropdown */}
            {showSettings && (
              <div className="absolute top-14 right-3 z-40 bg-black/90 backdrop-blur rounded-2xl p-4 w-64 space-y-3 border border-white/10">
                <p className="text-white font-semibold text-sm">설정</p>
                <div>
                  <p className="text-white/50 text-xs mb-1">줌 {zoom.toFixed(1)}×</p>
                  <input type="range" min={1} max={4} step={0.1} value={zoom}
                    onChange={e => setZoom(Number(e.target.value))} className="w-full accent-white" />
                </div>
                <div>
                  <p className="text-white/50 text-xs mb-1">Notion 카메라롤 DB ID</p>
                  <input value={notionDbId} onChange={e => { setNotionDbId(e.target.value); localStorage.setItem('loov_camera_notion_db', e.target.value); }}
                    placeholder="32자리 DB ID"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-white text-xs font-mono" />
                </div>
                <button onClick={() => setShowSettings(false)} className="w-full py-2 text-white/50 text-xs">닫기</button>
              </div>
            )}

            {/* 3x3 grid guide */}
            <div className="absolute inset-0 pointer-events-none z-10"
              style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.08) 1px,transparent 1px)', backgroundSize: '33.3% 33.3%' }} />
          </div>

          {/* Filter name badge */}
          <div className="bg-black flex justify-center py-1">
            <span className="text-white/60 text-xs tracking-widest uppercase">{currentFilter.name}</span>
          </div>

          {/* Filter strip */}
          <div className="bg-black pb-2">
            <div className="flex gap-2 overflow-x-auto px-3 scrollbar-hide">
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 transition-all ${filter === f.id ? 'scale-105' : 'opacity-60'}`}>
                  {/* Swatch circle */}
                  <div className={`w-14 h-14 rounded-2xl border-[2.5px] overflow-hidden transition-all ${filter === f.id ? 'border-white' : 'border-transparent'}`}
                    style={{
                      background: `linear-gradient(135deg, #e879f9 0%, #f97316 50%, #3b82f6 100%)`,
                      filter: f.css || 'none',
                    }} />
                  <span className="text-white text-[9px]">{f.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Capture controls */}
          <div className="bg-black py-5 flex items-center justify-around px-6">
            {/* Last photo thumbnail */}
            <button onClick={() => setTab('gallery')} className="relative w-14 h-14">
              {photos[0] ? (
                <img src={photos[0].dataUrl} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-white/30"
                  style={{ filter: photos[0].filterCss || 'none' }} />
              ) : (
                <div className="w-14 h-14 rounded-xl border border-white/20 flex items-center justify-center text-white/30">🖼</div>
              )}
              {photos.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {photos.length > 99 ? '99+' : photos.length}
                </span>
              )}
            </button>

            {/* Shutter button */}
            <button onClick={capture} disabled={capturing}
              className="relative w-[82px] h-[82px] rounded-full border-[3px] border-white flex items-center justify-center active:scale-90 transition-transform">
              <div className={`rounded-full transition-all ${capturing ? 'w-16 h-16 bg-white/70' : 'w-[72px] h-[72px] bg-white'}`} />
            </button>

            {/* Flip camera */}
            <button onClick={() => setFacingMode(m => m === 'environment' ? 'user' : 'environment')}
              className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-2xl text-white active:scale-90 transition-transform">
              🔄
            </button>
          </div>
        </div>
      )}

      {/* ══════════════ GALLERY ══════════════ */}
      {tab === 'gallery' && (
        <div className="flex-1 flex flex-col bg-black overflow-hidden min-h-0">
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
            <button onClick={() => setTab('camera')} className="text-white/60 text-sm">← 카메라</button>
            <h2 className="text-white font-bold">{photos.length}장</h2>
            <div className="w-12" />
          </div>

          {photos.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/30">
              <span className="text-6xl">📷</span>
              <p>아직 사진이 없습니다</p>
              <button onClick={() => setTab('camera')} className="text-blue-400 text-sm">카메라로 이동 →</button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-3 gap-px">
                {photos.map(photo => (
                  <button key={photo.id}
                    onClick={() => { setSelected(photo); setBrightness(100); setContrast(100); setSaturation(100); setWarmth(0); setTab('edit'); }}
                    className="relative aspect-square overflow-hidden group">
                    <img src={photo.processedUrl || photo.dataUrl} alt=""
                      className="w-full h-full object-cover"
                      style={{ filter: photo.processedUrl ? 'none' : photo.filterCss || 'none' }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-active:opacity-100 transition-opacity" />
                    {/* Badges */}
                    <div className="absolute top-1 right-1 flex flex-col gap-1">
                      {photo.uploaded && <span className="w-4 h-4 bg-green-500 rounded-full text-white text-[8px] flex items-center justify-center">✓</span>}
                      {(photo.lat || photo.lng) && <span className="text-[10px]">📍</span>}
                    </div>
                    <div className="absolute bottom-1 left-1">
                      <span className="text-[8px] text-white/60 bg-black/40 px-1 rounded">{photo.filter}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ EDIT ══════════════ */}
      {tab === 'edit' && selected && (
        <div className="flex-1 flex flex-col bg-black overflow-hidden min-h-0">
          {/* Preview */}
          <div className="relative flex-1 bg-[#111] flex items-center justify-center overflow-hidden min-h-0">
            <img
              src={selected.processedUrl || selected.dataUrl} alt=""
              className="max-w-full max-h-full object-contain"
              style={{ filter: `${selected.filterCss || ''} ${editCss}`.trim() }}
            />
            {/* Info overlay */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <p className="text-white/60 text-xs">{selected.timestamp} · {selected.filter}</p>
              {selected.lat && <p className="text-white/40 text-xs">📍 {selected.lat.toFixed(4)}, {selected.lng?.toFixed(4)}</p>}
              {selected.cloudinaryUrl && <p className="text-green-400/70 text-xs">☁️ 클라우드 저장됨</p>}
            </div>
          </div>

          {/* Adjustments */}
          <div className="bg-gray-950 px-4 py-3 space-y-2 border-t border-white/10">
            {([
              ['밝기', brightness, setBrightness, 50, 150],
              ['대비', contrast, setContrast, 50, 150],
              ['채도', saturation, setSaturation, 0, 200],
              ['따뜻함', warmth, setWarmth, 0, 80],
            ] as [string, number, (v: number) => void, number, number][]).map(([label, val, setter, min, max]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-white/50 text-xs w-12 flex-shrink-0">{label}</span>
                <input type="range" min={min} max={max} value={val}
                  onChange={e => setter(Number(e.target.value))}
                  className="flex-1 accent-white h-1" />
                <span className="text-white/30 text-xs w-8 text-right">{val}</span>
              </div>
            ))}
          </div>

          {/* Action bar */}
          <div className="bg-black border-t border-white/10 px-3 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
            <ActionBtn icon="←" label="뒤로" onClick={() => setTab('gallery')} />
            <ActionBtn icon="✅" label="적용" onClick={applyEdits} />
            <ActionBtn icon="✂️" label="누끼" onClick={() => setTab('bg')} />
            <ActionBtn icon={uploading ? '⏳' : '☁️'} label="업로드" onClick={uploadSelected} disabled={uploading} />
            <ActionBtn icon="💾" label="저장" onClick={() => download(selected)} />
            <ActionBtn icon="🗑️" label="삭제" onClick={() => deletePhoto(selected)} danger />
          </div>
          {uploadMsg && <p className="bg-black text-center text-blue-300 text-xs pb-2">{uploadMsg}</p>}
        </div>
      )}

      {/* ══════════════ BACKGROUND REMOVAL ══════════════ */}
      {tab === 'bg' && selected && (
        <div className="flex-1 flex flex-col bg-black overflow-hidden min-h-0">
          <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
            <button onClick={() => setTab('edit')} className="text-white/60 text-sm">← 편집</button>
            <h2 className="text-white font-bold">✂️ 누끼따기</h2>
            <div className="w-12" />
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Before / After */}
            <div className="flex gap-2 p-3">
              <div className="flex-1 flex flex-col gap-1">
                <p className="text-white/40 text-xs text-center">원본</p>
                <img src={selected.dataUrl} alt="" className="w-full aspect-square object-cover rounded-xl" />
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <p className="text-white/40 text-xs text-center">결과</p>
                <div className="w-full aspect-square rounded-xl overflow-hidden"
                  style={{ backgroundImage: 'repeating-conic-gradient(#555 0% 25%, #333 0% 50%)', backgroundSize: '16px 16px' }}>
                  {selected.processedUrl
                    ? <img src={selected.processedUrl} alt="" className="w-full h-full object-contain" />
                    : <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">미처리</div>}
                </div>
              </div>
            </div>

            <div className="px-4 pb-6 space-y-3">
              <button onClick={removeBg} disabled={removingBg}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold text-base flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98] transition-transform">
                {removingBg
                  ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />AI 처리 중 (최대 30초)...</>
                  : <>✂️ 배경 제거 시작</>}
              </button>
              <p className="text-white/30 text-xs text-center">AI가 브라우저 내에서 직접 처리합니다<br />첫 실행 시 모델 로딩에 시간이 걸릴 수 있습니다</p>

              {selected.processedUrl && (
                <div className="flex gap-2">
                  <button onClick={() => download({ ...selected, dataUrl: selected.processedUrl! })}
                    className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-semibold">💾 PNG 저장</button>
                  <button onClick={uploadSelected}
                    className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold">☁️ 클라우드 저장</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ 3D PRODUCT ══════════════ */}
      {tab === '3d' && (
        <div className="flex-1 flex flex-col bg-black min-h-0 overflow-hidden">
          {threeDPhotos.length < THREE_D_GUIDES.length ? (
            /* Capture mode */
            <>
              <div className="relative flex-1 bg-black overflow-hidden min-h-0">
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                {/* Guide */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
                  <div className="border-2 border-white/60 rounded-full w-40 h-40 flex flex-col items-center justify-center gap-1">
                    <p className="text-white font-black text-3xl">{threeDPhotos.length + 1}</p>
                    <p className="text-white/70 text-xs">/ {THREE_D_GUIDES.length}</p>
                  </div>
                  <div className="bg-black/50 px-4 py-2 rounded-full">
                    <p className="text-white font-semibold text-sm">{THREE_D_GUIDES[threeDPhotos.length]}</p>
                  </div>
                </div>
                {/* Progress */}
                <div className="absolute top-4 inset-x-0 flex justify-center gap-2">
                  {THREE_D_GUIDES.map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all ${i < threeDPhotos.length ? 'bg-green-400 w-6' : i === threeDPhotos.length ? 'bg-white w-6' : 'bg-white/30 w-3'}`} />
                  ))}
                </div>
              </div>
              <div className="bg-black py-5 flex items-center justify-around px-6">
                <button onClick={() => { setThreeDPhotos([]); setThreeDIdx(0); }}
                  className="w-14 h-14 rounded-full bg-white/10 text-white text-2xl flex items-center justify-center">↺</button>
                <button onClick={capture3D}
                  className="w-[82px] h-[82px] rounded-full border-[3px] border-white flex items-center justify-center active:scale-90 transition-transform">
                  <div className="w-[72px] h-[72px] rounded-full bg-white" />
                </button>
                <div className="w-14 h-14" />
              </div>
            </>
          ) : (
            /* 360° viewer */
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 overflow-y-auto">
              <h2 className="text-white font-bold text-lg">🎡 360° 뷰어</h2>
              <div
                className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden border border-white/10 cursor-grab active:cursor-grabbing select-none"
                onMouseDown={e => setDragStart(e.clientX)}
                onMouseMove={e => { if (e.buttons && threeDPhotos.length) { const d = e.clientX - dragStart; if (Math.abs(d) > 40) { setThreeDIdx(i => (i + (d > 0 ? -1 : 1) + threeDPhotos.length) % threeDPhotos.length); setDragStart(e.clientX); } } }}
                onTouchStart={e => setDragStart(e.touches[0].clientX)}
                onTouchMove={e => { const d = e.touches[0].clientX - dragStart; if (Math.abs(d) > 40) { setThreeDIdx(i => (i + (d > 0 ? -1 : 1) + threeDPhotos.length) % threeDPhotos.length); setDragStart(e.touches[0].clientX); } }}>
                <img src={threeDPhotos[threeDIdx]} alt="" className="w-full h-full object-contain" draggable={false} />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent py-3 flex justify-center gap-1.5">
                  {threeDPhotos.map((_, i) => (
                    <button key={i} onClick={() => setThreeDIdx(i)} className={`h-1.5 rounded-full transition-all ${i === threeDIdx ? 'w-6 bg-white' : 'w-2 bg-white/40'}`} />
                  ))}
                </div>
              </div>
              <p className="text-white/40 text-sm">{THREE_D_GUIDES[threeDIdx]} · 좌우로 드래그</p>
              <div className="flex gap-3 w-full max-w-sm">
                <button onClick={() => { setThreeDPhotos([]); setThreeDIdx(0); }}
                  className="flex-1 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm">🔄 재촬영</button>
                <button onClick={() => threeDPhotos.forEach((url, i) => { const a = document.createElement('a'); a.href = url; a.download = `3d_${i + 1}.jpg`; a.click(); })}
                  className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm">💾 전체 저장</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ BOTTOM NAV ══════════════ */}
      <div className="bg-black border-t border-white/10 flex flex-shrink-0">
        {([
          ['camera', '📷', '카메라'],
          ['gallery', '🖼️', `갤러리${photos.length ? ` (${photos.length})` : ''}`],
          ['edit', '✏️', '편집'],
          ['bg', '✂️', '누끼'],
          ['3d', '🎡', '3D'],
        ] as [typeof tab, string, string][]).map(([t, icon, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[10px] transition-colors ${tab === t ? 'text-white' : 'text-white/30'}`}>
            <span className="text-base">{icon}</span>
            <span className={tab === t ? 'text-blue-400 font-semibold' : ''}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Small action button ── */
function ActionBtn({ icon, label, onClick, disabled, danger }: {
  icon: string; label: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl text-xs transition-colors active:scale-95 ${
        danger ? 'bg-red-900/40 text-red-400' : 'bg-white/8 text-white/80'
      } disabled:opacity-40`}>
      <span className="text-xl">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
