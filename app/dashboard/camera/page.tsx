'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { dbSavePhoto, dbGetPhotos, dbDeletePhoto, dbUpdatePhoto, type StoredPhoto } from '@/lib/camera-db';

/* ─── 24 Filter Presets ──────────────────────────────────────────────────── */
const FILTERS = [
  { id: 'normal',    name: '기본',       css: '' },
  { id: 'vivid',     name: '선명',       css: 'saturate(1.8) contrast(1.1)' },
  { id: 'dramatic',  name: '드라마틱',   css: 'saturate(1.4) contrast(1.6) brightness(0.85)' },
  { id: 'mono',      name: '흑백',       css: 'grayscale(1)' },
  { id: 'noir',      name: '누아르',     css: 'grayscale(1) contrast(1.6) brightness(0.72)' },
  { id: 'fade',      name: '페이드',     css: 'contrast(0.82) saturate(0.7) brightness(1.12)' },
  { id: 'chrome',    name: '크롬',       css: 'saturate(1.7) contrast(1.15) hue-rotate(-10deg)' },
  { id: 'vintage',   name: '빈티지',     css: 'sepia(0.55) contrast(1.1) saturate(1.2) brightness(0.95)' },
  { id: 'kodak',     name: '코닥',       css: 'sepia(0.2) contrast(1.05) saturate(1.35) hue-rotate(5deg)' },
  { id: 'warm',      name: '웜톤',       css: 'sepia(0.3) saturate(1.3) hue-rotate(-15deg)' },
  { id: 'cool',      name: '쿨톤',       css: 'hue-rotate(20deg) saturate(1.15)' },
  { id: 'muted',     name: '뮤트',       css: 'saturate(0.6) contrast(0.88) brightness(1.08)' },
  { id: 'lomo',      name: '로모',       css: 'saturate(1.6) contrast(1.35) brightness(0.82)' },
  { id: 'polaroid',  name: '폴라로이드', css: 'sepia(0.4) contrast(1.1) saturate(0.85) brightness(1.08)' },
  { id: 'cinematic', name: '시네마틱',   css: 'contrast(1.35) saturate(0.82) brightness(0.88)' },
  { id: 'golden',    name: '골든',       css: 'sepia(0.65) saturate(1.5) brightness(1.08)' },
  { id: 'twilight',  name: '트와일라잇', css: 'hue-rotate(200deg) saturate(1.25) brightness(0.88)' },
  { id: 'neon',      name: '네온',       css: 'saturate(2.2) contrast(1.25) brightness(1.12)' },
  { id: 'desert',    name: '데저트',     css: 'sepia(0.65) saturate(1.15) hue-rotate(-30deg)' },
  { id: 'ocean',     name: '오션',       css: 'hue-rotate(180deg) saturate(1.35) brightness(0.95)' },
  { id: 'forest',    name: '포레스트',   css: 'hue-rotate(90deg) saturate(1.4) brightness(0.92)' },
  { id: 'rose',      name: '로즈',       css: 'hue-rotate(-30deg) saturate(1.5) brightness(1.05)' },
  { id: 'fuji',      name: '후지',       css: 'saturate(1.1) contrast(1.05) hue-rotate(5deg)' },
  { id: 'sharp',     name: '샤프',       css: 'contrast(1.4) saturate(1.2) brightness(0.95)' },
];

const THREE_D_GUIDES = ['정면', '우측45°', '우측90°', '후면', '좌측90°', '좌측45°', '상단'];

type Tab = 'camera' | 'gallery' | 'edit' | 'bg' | '3d';

export default function CameraPage() {
  const [tab, setTab] = useState<Tab>('camera');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [filter, setFilter] = useState('normal');
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [selected, setSelected] = useState<StoredPhoto | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [notionDbId, setNotionDbId] = useState('');
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
  const [zoom, setZoom] = useState(1);
  const [syncing, setSyncing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // pinch zoom tracking
  const pinchDistRef = useRef(0);
  const dragStartRef = useRef(0);

  /* ── Init ── */
  useEffect(() => {
    loadPhotos();
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

  /* ── Load photos: IndexedDB + Supabase 병합 ── */
  const loadPhotos = async () => {
    const local = await dbGetPhotos();
    setPhotos(local);
    try {
      setSyncing(true);
      const res = await fetch('/api/camera/save');
      if (!res.ok) return;
      const { photos: cloudPhotos } = await res.json();
      if (!cloudPhotos?.length) return;

      const isValid = (url: string) =>
        url && (url.startsWith('http://') || url.startsWith('https://') || (url.startsWith('data:image/') && url.length > 1000));

      const cloud: StoredPhoto[] = cloudPhotos
        .filter((r: any) => isValid(r.cloudinary_url))
        .map((r: any) => ({
          id: r.id,
          dataUrl: r.cloudinary_url,
          filter: r.filter || 'normal',
          filterCss: r.filter_css || '',
          timestamp: r.timestamp || r.created_at,
          lat: r.lat,
          lng: r.lng,
          uploaded: true,
          cloudinaryUrl: r.thumbnail_url || r.cloudinary_url,
        }));

      const cloudIds = new Set(cloud.map(p => p.id));
      const localPending = local.filter(p => !p.uploaded && !cloudIds.has(p.id));
      setPhotos([...localPending, ...cloud]);
    } catch {}
    finally { setSyncing(false); }
  };

  /* ── Camera ── */
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
    else { stream?.getTracks().forEach(t => t.stop()); setStream(null); }
  }, [tab, facingMode]);

  /* ── Pinch zoom on viewfinder (터치 직접 처리, 브라우저 줌 차단) ── */
  const onViewfinderTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchDistRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    }
  };
  const onViewfinderTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchDistRef.current > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const ratio = dist / pinchDistRef.current;
      setZoom(z => Math.min(5, Math.max(1, z * ratio)));
      pinchDistRef.current = dist;
    }
  };

  /* ── Capture ── */
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
    await dbSavePhoto(photo);
    setPhotos(prev => [photo, ...prev]);
    uploadToCloud(photo);
    setTimeout(() => setCapturing(false), 200);
  }, [capturing, filter, facingMode, location]);

  /* ── Cloud upload (NAS + Notion + Supabase) ── */
  const uploadToCloud = async (photo: StoredPhoto) => {
    try {
      const res = await fetch('/api/camera/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: photo.dataUrl,
          filter: photo.filter,
          filterCss: photo.filterCss,
          location: photo.lat ? { lat: photo.lat, lng: photo.lng } : null,
          notionDbId,
          metadata: { id: photo.id, timestamp: photo.timestamp },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const remoteUrl = data.nasUrl || '';
        await dbUpdatePhoto(photo.id, { uploaded: true, cloudinaryUrl: remoteUrl || undefined });
        setPhotos(prev => prev.map(p => p.id === photo.id
          ? { ...p, uploaded: true, cloudinaryUrl: remoteUrl || undefined, ...(remoteUrl && { dataUrl: remoteUrl }) }
          : p));
      }
    } catch {}
  };

  /* ── Manual upload ── */
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

  /* ── Edit ── */
  const editCss = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${warmth}%)`;
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

  const download = (photo: StoredPhoto) => {
    const a = document.createElement('a');
    a.href = photo.processedUrl || photo.dataUrl;
    a.download = `loov_${photo.id}.${photo.processedUrl ? 'png' : 'jpg'}`;
    a.click();
  };

  const deletePhoto = async (photo: StoredPhoto) => {
    await dbDeletePhoto(photo.id);
    setPhotos(prev => prev.filter(p => p.id !== photo.id));
    if (selected?.id === photo.id) { setSelected(null); setTab('gallery'); }
    fetch('/api/camera/save', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photo.id }),
    }).catch(() => {});
  };

  const currentFilterCss = FILTERS.find(f => f.id === filter)?.css || '';
  const currentFilterName = FILTERS.find(f => f.id === filter)?.name || '';

  /* ═══════════════════════ RENDER ═══════════════════════════════════════ */
  return (
    /* 전체 컨테이너: 스크롤/줌 완전 차단 — 탭별로 touch-action 개별 지정 */
    <div
      className="flex flex-col bg-black overflow-hidden select-none"
      style={{ height: '100dvh', touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className="hidden" />

      {/* ══════════ CAMERA ══════════════════════════════════════════════ */}
      {tab === 'camera' && (
        <div className="flex-1 flex flex-col min-h-0">

          {/* Viewfinder: touch-action none → 내부에서 pinch 직접 처리 */}
          <div
            className="relative flex-1 bg-black overflow-hidden"
            style={{ touchAction: 'none' }}
            onTouchStart={onViewfinderTouchStart}
            onTouchMove={onViewfinderTouchMove}
          >
            <video
              ref={videoRef} autoPlay playsInline muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                filter: currentFilterCss || 'none',
                transform: `${facingMode === 'user' ? 'scaleX(-1) ' : ''}scale(${zoom})`,
                transition: 'transform 0.05s',
              }}
            />

            {/* 캡처 플래시 */}
            {capturing && <div className="absolute inset-0 bg-white/50 z-30 pointer-events-none" />}

            {/* 3×3 그리드 가이드 */}
            <div className="absolute inset-0 pointer-events-none z-10"
              style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.07) 1px,transparent 1px)', backgroundSize: '33.3% 33.3%' }} />

            {/* 상단 HUD */}
            <div className="absolute top-0 inset-x-0 px-4 pt-safe-top p-3 flex items-center justify-between z-20 bg-gradient-to-b from-black/50 to-transparent"
              style={{ touchAction: 'manipulation' }}>
              <div className="flex items-center gap-2">
                {zoom > 1 && (
                  <button onTouchEnd={() => setZoom(1)}
                    className="bg-black/40 text-yellow-300 text-xs px-2.5 py-1 rounded-full font-mono">
                    {zoom.toFixed(1)}×
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {location && (
                  <span className="text-white/60 text-[10px] bg-black/30 px-2 py-1 rounded-full">
                    📍{location.lat.toFixed(3)},{location.lng.toFixed(3)}
                  </span>
                )}
                <button
                  onTouchEnd={() => setShowSettings(s => !s)}
                  className="w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center text-lg"
                  style={{ touchAction: 'manipulation' }}>
                  ⚙️
                </button>
              </div>
            </div>

            {/* 필터명 badge */}
            <div className="absolute bottom-0 inset-x-0 flex justify-center pb-1 pointer-events-none z-10">
              <span className="text-white/50 text-[10px] tracking-widest uppercase bg-black/30 px-3 py-0.5 rounded-full">{currentFilterName}</span>
            </div>
          </div>

          {/* 필터 스트립: touch-action pan-x → 가로 스크롤만 허용 */}
          <div className="bg-black py-2" style={{ touchAction: 'pan-x' }}>
            <div className="flex gap-3 overflow-x-auto px-3 scrollbar-hide"
              style={{ overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }}>
              {FILTERS.map(f => (
                <button key={f.id}
                  onTouchEnd={() => setFilter(f.id)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 transition-opacity ${filter === f.id ? 'opacity-100' : 'opacity-50'}`}
                  style={{ touchAction: 'manipulation' }}>
                  <div className={`w-12 h-12 rounded-xl border-2 overflow-hidden ${filter === f.id ? 'border-white' : 'border-transparent'}`}
                    style={{ background: 'linear-gradient(135deg,#e879f9,#f97316,#3b82f6)', filter: f.css || 'none' }} />
                  <span className="text-white text-[9px]">{f.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 셔터 바: touch-action manipulation */}
          <div className="bg-black pt-3 pb-safe-bottom pb-4 flex items-center justify-around px-8"
            style={{ touchAction: 'manipulation' }}>
            {/* 마지막 사진 썸네일 */}
            <button onTouchEnd={() => setTab('gallery')} className="relative w-14 h-14">
              {photos[0] ? (
                <img src={photos[0].dataUrl} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-white/30"
                  style={{ filter: photos[0].filterCss || 'none' }}
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
              ) : (
                <div className="w-14 h-14 rounded-xl border border-white/20 flex items-center justify-center text-white/30 text-xl">🖼</div>
              )}
              {photos.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {photos.length > 99 ? '99+' : photos.length}
                </span>
              )}
            </button>

            {/* 셔터 */}
            <button onTouchEnd={capture} disabled={capturing}
              className="relative w-[80px] h-[80px] rounded-full border-[3.5px] border-white flex items-center justify-center active:scale-90 transition-transform"
              style={{ touchAction: 'manipulation' }}>
              <div className={`rounded-full transition-all duration-150 ${capturing ? 'w-14 h-14 bg-white/60' : 'w-[68px] h-[68px] bg-white'}`} />
            </button>

            {/* 카메라 전환 */}
            <button onTouchEnd={() => setFacingMode(m => m === 'environment' ? 'user' : 'environment')}
              className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-2xl active:scale-90 transition-transform"
              style={{ touchAction: 'manipulation' }}>
              🔄
            </button>
          </div>
        </div>
      )}

      {/* ══════════ GALLERY ════════════════════════════════════════════ */}
      {tab === 'gallery' && (
        <div className="flex-1 flex flex-col bg-black overflow-hidden min-h-0">
          {/* 헤더 */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-white/10 flex-shrink-0"
            style={{ touchAction: 'manipulation' }}>
            <button onClick={() => setTab('camera')} className="text-white/60 text-sm px-2 py-1">← 카메라</button>
            <span className="text-white font-bold">{photos.length}장</span>
            <button onClick={loadPhotos} disabled={syncing}
              className={`text-sm px-2 py-1 rounded-lg ${syncing ? 'text-white/30' : 'text-blue-400'}`}>
              {syncing ? '동기화 중...' : '↻ 동기화'}
            </button>
          </div>

          {photos.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/30">
              <span className="text-6xl">📷</span>
              <p className="text-sm">아직 사진이 없습니다</p>
              <button onClick={() => setTab('camera')} className="text-blue-400 text-sm" style={{ touchAction: 'manipulation' }}>카메라로 이동 →</button>
            </div>
          ) : (
            /* 그리드: touch-action pan-y → 세로 스크롤만, 가로/핀치 없음 */
            <div className="flex-1 overflow-y-auto" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
              <div className="grid grid-cols-3 gap-px">
                {photos.map(photo => (
                  <button key={photo.id}
                    onClick={() => {
                      setSelected(photo);
                      setBrightness(100); setContrast(100); setSaturation(100); setWarmth(0);
                      setTab('edit');
                    }}
                    className="relative aspect-square overflow-hidden"
                    style={{ touchAction: 'manipulation' }}>
                    <img
                      src={photo.processedUrl || photo.dataUrl} alt=""
                      className="w-full h-full object-cover"
                      style={{ filter: photo.processedUrl ? 'none' : (photo.filterCss || 'none') }}
                      onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                    />
                    <div className="absolute inset-0 bg-black/0 active:bg-black/20 transition-colors" />
                    {photo.uploaded && (
                      <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-green-500 rounded-full text-white text-[8px] flex items-center justify-center">✓</span>
                    )}
                    {(photo.lat || photo.lng) && (
                      <span className="absolute bottom-1 right-1 text-[10px]">📍</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ EDIT ═══════════════════════════════════════════════ */}
      {tab === 'edit' && selected && (
        <div className="flex-1 flex flex-col bg-black overflow-hidden min-h-0">

          {/* 이미지 프리뷰: pinch-zoom 허용 (브라우저 zoom은 layout.tsx에서 차단) */}
          <div className="relative flex-1 bg-[#111] flex items-center justify-center overflow-hidden min-h-0"
            style={{ touchAction: 'pinch-zoom' }}>
            <img
              src={selected.processedUrl || selected.dataUrl} alt=""
              className="max-w-full max-h-full object-contain"
              style={{ filter: `${selected.filterCss || ''} ${editCss}`.trim() }}
              draggable={false}
            />
            {/* 정보 오버레이 */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3 pointer-events-none">
              <p className="text-white/60 text-xs">{selected.timestamp} · {selected.filter}</p>
              {selected.lat && <p className="text-white/40 text-xs">📍 {selected.lat.toFixed(4)}, {selected.lng?.toFixed(4)}</p>}
              {selected.cloudinaryUrl && <p className="text-green-400/70 text-[10px]">☁️ NAS 저장됨</p>}
            </div>
          </div>

          {/* 슬라이더 패널: touch-action pan-y (세로로만 패널 스크롤) */}
          <div className="bg-gray-950 px-4 py-3 flex-shrink-0 border-t border-white/10"
            style={{ touchAction: 'pan-y' }}>
            {([
              ['밝기', brightness, setBrightness, 50, 150],
              ['대비', contrast, setContrast, 50, 150],
              ['채도', saturation, setSaturation, 0, 200],
              ['따뜻함', warmth, setWarmth, 0, 80],
            ] as [string, number, (v: number) => void, number, number][]).map(([label, val, setter, min, max]) => (
              <div key={label} className="flex items-center gap-3 py-1.5">
                <span className="text-white/50 text-xs w-12 flex-shrink-0">{label}</span>
                {/* 슬라이더: touch-action none → 가로 드래그가 페이지 이벤트 없이 동작 */}
                <input
                  type="range" min={min} max={max} value={val}
                  onChange={e => setter(Number(e.target.value))}
                  className="flex-1 accent-white"
                  style={{ touchAction: 'none', height: '24px', cursor: 'ew-resize' }}
                />
                <span className="text-white/30 text-xs w-8 text-right tabular-nums">{val}</span>
              </div>
            ))}
          </div>

          {/* 액션 버튼 2행 그리드 (overflow 없음 → 스크롤 간섭 제거) */}
          <div className="bg-black border-t border-white/10 grid grid-cols-3 gap-px flex-shrink-0"
            style={{ touchAction: 'manipulation' }}>
            <EditBtn icon="←" label="뒤로" onClick={() => setTab('gallery')} />
            <EditBtn icon="✅" label="적용" onClick={applyEdits} />
            <EditBtn icon="✂️" label="누끼" onClick={() => setTab('bg')} />
            <EditBtn icon={uploading ? '⏳' : '☁️'} label="백업" onClick={uploadSelected} disabled={uploading} />
            <EditBtn icon="💾" label="저장" onClick={() => download(selected)} />
            <EditBtn icon="🗑️" label="삭제" onClick={() => deletePhoto(selected)} danger />
          </div>
          {uploadMsg && (
            <p className="bg-black text-center text-blue-300 text-xs py-2 flex-shrink-0">{uploadMsg}</p>
          )}
        </div>
      )}

      {/* ══════════ 누끼따기 ══════════════════════════════════════════ */}
      {tab === 'bg' && selected && (
        <div className="flex-1 flex flex-col bg-black overflow-hidden min-h-0">
          <div className="px-4 py-3 flex items-center justify-between border-b border-white/10 flex-shrink-0"
            style={{ touchAction: 'manipulation' }}>
            <button onClick={() => setTab('edit')} className="text-white/60 text-sm">← 편집</button>
            <h2 className="text-white font-bold">✂️ 누끼따기</h2>
            <div className="w-16" />
          </div>

          <div className="flex-1 overflow-y-auto" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
            <div className="flex gap-2 p-3">
              <div className="flex-1 flex flex-col gap-1">
                <p className="text-white/40 text-[10px] text-center">원본</p>
                <img src={selected.dataUrl} alt="" className="w-full aspect-square object-cover rounded-xl" draggable={false} />
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <p className="text-white/40 text-[10px] text-center">결과</p>
                <div className="w-full aspect-square rounded-xl overflow-hidden"
                  style={{ backgroundImage: 'repeating-conic-gradient(#555 0% 25%,#333 0% 50%)', backgroundSize: '16px 16px' }}>
                  {selected.processedUrl
                    ? <img src={selected.processedUrl} alt="" className="w-full h-full object-contain" draggable={false} />
                    : <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">미처리</div>}
                </div>
              </div>
            </div>

            <div className="px-4 pb-8 space-y-3">
              <button onClick={removeBg} disabled={removingBg}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold text-base flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98]"
                style={{ touchAction: 'manipulation' }}>
                {removingBg
                  ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />AI 처리 중 (최대 30초)...</>
                  : <>✂️ 배경 제거 시작</>}
              </button>
              <p className="text-white/30 text-xs text-center">AI가 브라우저 내에서 직접 처리합니다</p>
              {selected.processedUrl && (
                <div className="flex gap-2">
                  <button onClick={() => download({ ...selected, dataUrl: selected.processedUrl! })}
                    className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-semibold"
                    style={{ touchAction: 'manipulation' }}>💾 PNG 저장</button>
                  <button onClick={uploadSelected}
                    className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold"
                    style={{ touchAction: 'manipulation' }}>☁️ 백업</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ 3D PRODUCT ════════════════════════════════════════ */}
      {tab === '3d' && (
        <div className="flex-1 flex flex-col bg-black min-h-0 overflow-hidden">
          {threeDPhotos.length < THREE_D_GUIDES.length ? (
            <>
              <div className="relative flex-1 bg-black overflow-hidden min-h-0" style={{ touchAction: 'none' }}>
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3">
                  <div className="border-2 border-white/60 rounded-full w-36 h-36 flex flex-col items-center justify-center gap-1">
                    <p className="text-white font-black text-3xl">{threeDPhotos.length + 1}</p>
                    <p className="text-white/60 text-xs">/ {THREE_D_GUIDES.length}</p>
                  </div>
                  <div className="bg-black/50 px-4 py-2 rounded-full">
                    <p className="text-white font-semibold text-sm">{THREE_D_GUIDES[threeDPhotos.length]}</p>
                  </div>
                </div>
                <div className="absolute top-4 inset-x-0 flex justify-center gap-2 pointer-events-none">
                  {THREE_D_GUIDES.map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all ${i < threeDPhotos.length ? 'bg-green-400 w-6' : i === threeDPhotos.length ? 'bg-white w-6' : 'bg-white/30 w-3'}`} />
                  ))}
                </div>
              </div>
              <div className="bg-black py-5 flex items-center justify-around px-8" style={{ touchAction: 'manipulation' }}>
                <button onTouchEnd={() => { setThreeDPhotos([]); setThreeDIdx(0); }}
                  className="w-14 h-14 rounded-full bg-white/10 text-white text-2xl flex items-center justify-center">↺</button>
                <button onTouchEnd={capture3D}
                  className="w-[80px] h-[80px] rounded-full border-[3.5px] border-white flex items-center justify-center active:scale-90">
                  <div className="w-[68px] h-[68px] rounded-full bg-white" />
                </button>
                <div className="w-14 h-14" />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 overflow-y-auto" style={{ touchAction: 'pan-y' }}>
              <h2 className="text-white font-bold text-lg">🎡 360° 뷰어</h2>
              {/* 360 뷰어: touch-action pan-x (좌우 스와이프만) */}
              <div
                className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden border border-white/10 cursor-grab"
                style={{ touchAction: 'pan-x' }}
                onMouseDown={e => { dragStartRef.current = e.clientX; }}
                onMouseMove={e => {
                  if (e.buttons) {
                    const d = e.clientX - dragStartRef.current;
                    if (Math.abs(d) > 40) {
                      setThreeDIdx(i => (i + (d > 0 ? -1 : 1) + threeDPhotos.length) % threeDPhotos.length);
                      dragStartRef.current = e.clientX;
                    }
                  }
                }}
                onTouchStart={e => { dragStartRef.current = e.touches[0].clientX; }}
                onTouchMove={e => {
                  const d = e.touches[0].clientX - dragStartRef.current;
                  if (Math.abs(d) > 40) {
                    setThreeDIdx(i => (i + (d > 0 ? -1 : 1) + threeDPhotos.length) % threeDPhotos.length);
                    dragStartRef.current = e.touches[0].clientX;
                  }
                }}>
                <img src={threeDPhotos[threeDIdx]} alt="" className="w-full h-full object-contain" draggable={false} />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent py-3 flex justify-center gap-1.5">
                  {threeDPhotos.map((_, i) => (
                    <button key={i} onClick={() => setThreeDIdx(i)}
                      className={`h-1.5 rounded-full transition-all ${i === threeDIdx ? 'w-6 bg-white' : 'w-2 bg-white/40'}`}
                      style={{ touchAction: 'manipulation' }} />
                  ))}
                </div>
              </div>
              <p className="text-white/40 text-sm">{THREE_D_GUIDES[threeDIdx]} · 좌우 드래그</p>
              <div className="flex gap-3 w-full max-w-sm" style={{ touchAction: 'manipulation' }}>
                <button onClick={() => { setThreeDPhotos([]); setThreeDIdx(0); }}
                  className="flex-1 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm">🔄 재촬영</button>
                <button onClick={() => threeDPhotos.forEach((url, i) => { const a = document.createElement('a'); a.href = url; a.download = `3d_${i + 1}.jpg`; a.click(); })}
                  className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm">💾 전체 저장</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ 하단 탭바 ══════════════════════════════════════════ */}
      <div
        className="bg-black border-t border-white/10 flex flex-shrink-0"
        style={{ touchAction: 'manipulation', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {([
          ['camera', '📷', '카메라'],
          ['gallery', '🖼', `갤러리${photos.length ? ` ${photos.length}` : ''}`],
          ['edit', '✏️', '편집'],
          ['bg', '✂️', '누끼'],
          ['3d', '🎡', '3D'],
        ] as [Tab, string, string][]).map(([t, icon, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-opacity ${tab === t ? 'opacity-100' : 'opacity-35'}`}
            style={{ touchAction: 'manipulation' }}>
            <span className="text-lg leading-none">{icon}</span>
            <span className={`text-[10px] ${tab === t ? 'text-blue-400 font-semibold' : 'text-white'}`}>{label}</span>
          </button>
        ))}
      </div>

      {/* 설정 바텀시트 (카메라 탭에서만) */}
      {showSettings && tab === 'camera' && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setShowSettings(false)} style={{ touchAction: 'manipulation' }} />
          <div className="fixed bottom-0 inset-x-0 z-50 bg-gray-950 rounded-t-2xl px-5 py-5 space-y-4 border-t border-white/10"
            style={{ touchAction: 'pan-y' }}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-2" />
            <p className="text-white font-semibold text-sm">⚙️ 카메라 설정</p>
            <div>
              <p className="text-white/50 text-xs mb-2">줌 {zoom.toFixed(1)}×</p>
              <input type="range" min={1} max={5} step={0.1} value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                className="w-full accent-white"
                style={{ touchAction: 'none', height: '28px' }} />
            </div>
            <div>
              <p className="text-white/50 text-xs mb-2">Notion 카메라롤 DB ID</p>
              <input value={notionDbId}
                onChange={e => { setNotionDbId(e.target.value); localStorage.setItem('loov_camera_notion_db', e.target.value); }}
                placeholder="32자리 Notion DB ID"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-white text-xs font-mono"
                style={{ touchAction: 'manipulation' }} />
            </div>
            <button onClick={() => setShowSettings(false)}
              className="w-full py-3 rounded-xl bg-white/10 text-white/60 text-sm"
              style={{ touchAction: 'manipulation' }}>닫기</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── 편집 액션 버튼 ── */
function EditBtn({ icon, label, onClick, disabled, danger }: {
  icon: string; label: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 py-3 text-xs transition-opacity disabled:opacity-40 ${
        danger ? 'text-red-400 bg-red-950/30' : 'text-white/80 bg-white/5'
      }`}
      style={{ touchAction: 'manipulation' }}>
      <span className="text-xl leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
