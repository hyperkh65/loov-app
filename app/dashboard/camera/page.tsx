'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/* ─── Filter Presets ─────────────────────────────────────────────────────── */
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
  { id: 'warm',      name: '웜톤',       css: 'sepia(0.3) saturate(1.3) hue-rotate(-15deg) brightness(1.05)' },
  { id: 'cool',      name: '쿨톤',       css: 'hue-rotate(20deg) saturate(1.15) brightness(1.02)' },
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
  { id: 'fuji',      name: '후지',       css: 'saturate(1.1) contrast(1.05) hue-rotate(5deg) brightness(1.03)' },
  { id: 'sharp',     name: '샤프',       css: 'contrast(1.4) saturate(1.2) brightness(0.95)' },
];

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface CapturedPhoto {
  id: string;
  dataUrl: string;
  processedUrl?: string;
  filter: string;
  filterCss: string;
  timestamp: string;
  location?: { lat: number; lng: number; address?: string };
  uploaded?: boolean;
  cloudinaryUrl?: string;
}

interface EditState {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  sharpness: number;
}

const DEFAULT_EDIT: EditState = { brightness: 100, contrast: 100, saturation: 100, warmth: 0, sharpness: 0 };

const THREE_D_GUIDES = ['정면 (0°)', '우측 (60°)', '우측 (120°)', '후면 (180°)', '좌측 (240°)', '좌측 (300°)', '상단'];

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function CameraPage() {
  const [tab, setTab] = useState<'camera' | 'gallery' | 'edit' | 'bg' | '3d'>('camera');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [filter, setFilter] = useState('normal');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<CapturedPhoto | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [autoUpload, setAutoUpload] = useState(false);
  const [notionDbId, setNotionDbId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [removingBg, setRemovingBg] = useState(false);
  const [editState, setEditState] = useState<EditState>(DEFAULT_EDIT);
  const [flashMode, setFlashMode] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [threeDPhotos, setThreeDPhotos] = useState<string[]>([]);
  const [threeDAngleIdx, setThreeDAngleIdx] = useState(0);
  const [threeDDragX, setThreeDDragX] = useState(0);
  const [threeDStartX, setThreeDStartX] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [zoom, setZoom] = useState(1);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeDRef = useRef<HTMLDivElement>(null);

  /* ── Location ── */
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
    const saved = localStorage.getItem('loov_camera_notion_db');
    if (saved) setNotionDbId(saved);
  }, []);

  /* ── Camera start/stop ── */
  const startCamera = useCallback(async () => {
    if (stream) { stream.getTracks().forEach(t => t.stop()); }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play();
      }
    } catch (err) {
      console.error('Camera error:', err);
    }
  }, [facingMode]);

  useEffect(() => {
    if (tab === 'camera' || tab === '3d') {
      startCamera();
    } else {
      if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); }
    }
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, [tab, facingMode]);

  /* ── Get filter CSS ── */
  const filterCss = FILTERS.find(f => f.id === filter)?.css || '';

  /* ── Capture photo ── */
  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;

    if (flashMode) {
      // Flash: white overlay briefly
    }

    // Apply CSS filter via canvas (approximation)
    ctx.filter = filterCss || 'none';
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    const newPhoto: CapturedPhoto = {
      id: Date.now().toString(),
      dataUrl,
      filter,
      filterCss,
      timestamp: new Date().toLocaleString('ko-KR'),
      location: location || undefined,
    };

    setPhotos(prev => [newPhoto, ...prev]);

    if (autoUpload) {
      await uploadPhoto(newPhoto);
    }

    setTimeout(() => setCapturing(false), 300);
  }, [videoRef, canvasRef, filterCss, facingMode, filter, location, autoUpload]);

  /* ── 3D Capture ── */
  const capture3D = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setThreeDPhotos(prev => [...prev, dataUrl]);
    if (threeDPhotos.length + 1 < THREE_D_GUIDES.length) {
      setThreeDAngleIdx(prev => prev + 1);
    }
  }, [videoRef, canvasRef, threeDPhotos]);

  /* ── Upload photo ── */
  const uploadPhoto = async (photo: CapturedPhoto) => {
    setUploading(true);
    setUploadMsg('업로드 중...');
    try {
      const res = await fetch('/api/camera/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: photo.dataUrl,
          filter: photo.filter,
          location: photo.location,
          notionDbId,
          metadata: { filename: `photo_${photo.id}` },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, uploaded: true, cloudinaryUrl: data.cloudinaryUrl } : p));
        setUploadMsg('✅ 저장 완료!');
      } else {
        setUploadMsg(`❌ ${data.error}`);
      }
    } catch (err: any) {
      setUploadMsg(`❌ ${err.message}`);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadMsg(''), 3000);
    }
  };

  /* ── Background Removal ── */
  const removeBackground = async () => {
    if (!selectedPhoto) return;
    setRemovingBg(true);
    try {
      const { removeBackground: removeBg } = await import('@imgly/background-removal');
      const result = await removeBg(selectedPhoto.dataUrl, {
        output: { format: 'image/png', quality: 0.9 },
      });
      const url = URL.createObjectURL(result);
      setSelectedPhoto(prev => prev ? { ...prev, processedUrl: url } : prev);
      setPhotos(prev => prev.map(p => p.id === selectedPhoto.id ? { ...p, processedUrl: url } : p));
    } catch (err: any) {
      alert('누끼따기 실패: ' + err.message);
    } finally {
      setRemovingBg(false);
    }
  };

  /* ── Edit CSS ── */
  const editCss = `brightness(${editState.brightness}%) contrast(${editState.contrast}%) saturate(${editState.saturation}%) sepia(${editState.warmth}%)`;

  /* ── Apply edits to canvas ── */
  const applyEdits = () => {
    if (!selectedPhoto || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.filter = editCss;
      ctx.drawImage(img, 0, 0);
      const result = canvas.toDataURL('image/jpeg', 0.92);
      setSelectedPhoto(prev => prev ? { ...prev, processedUrl: result } : prev);
      setPhotos(prev => prev.map(p => p.id === selectedPhoto.id ? { ...p, processedUrl: result } : p));
    };
    img.src = selectedPhoto.processedUrl || selectedPhoto.dataUrl;
  };

  /* ── Download photo ── */
  const downloadPhoto = (photo: CapturedPhoto) => {
    const a = document.createElement('a');
    a.href = photo.processedUrl || photo.dataUrl;
    a.download = `loov_photo_${photo.id}.jpg`;
    a.click();
  };

  /* ── 3D drag viewer ── */
  const onThreeDDragStart = (x: number) => setThreeDStartX(x);
  const onThreeDDragMove = (x: number) => {
    if (threeDPhotos.length === 0) return;
    const delta = x - threeDStartX;
    const idx = Math.abs(Math.round(-delta / 60)) % threeDPhotos.length;
    setThreeDAngleIdx(idx);
    setThreeDDragX(x);
  };

  /* ─── RENDER ───────────────────────────────────────────────────────────── */
  return (
    <div className="h-screen flex flex-col bg-black overflow-hidden" style={{ maxHeight: '100dvh' }}>
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Camera Tab ── */}
      {(tab === 'camera') && (
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {/* Viewfinder */}
          <div className="flex-1 relative bg-black overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{
                filter: filterCss || 'none',
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                scale: zoom.toString(),
              }}
            />

            {/* Capture flash overlay */}
            {capturing && (
              <div className="absolute inset-0 bg-white z-50 animate-ping opacity-70 duration-100" />
            )}

            {/* Top controls */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20">
              <button onClick={() => setFlashMode(f => !f)}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${flashMode ? 'bg-yellow-400 text-black' : 'bg-black/40 text-white'}`}>
                ⚡
              </button>

              <div className="flex gap-2">
                {location && (
                  <div className="bg-black/40 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1">
                    <span>📍</span>
                    <span>{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
                  </div>
                )}
                <button onClick={() => setShowSettings(s => !s)}
                  className="w-10 h-10 rounded-full bg-black/40 text-white text-xl flex items-center justify-center">
                  ⚙️
                </button>
              </div>
            </div>

            {/* Settings panel */}
            {showSettings && (
              <div className="absolute top-16 right-4 bg-black/80 backdrop-blur-md rounded-2xl p-4 z-30 w-64 text-white text-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span>자동 저장</span>
                  <button onClick={() => setAutoUpload(a => !a)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${autoUpload ? 'bg-blue-500' : 'bg-gray-600'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${autoUpload ? 'left-6' : 'left-0.5'}`} />
                  </button>
                </div>
                <div>
                  <p className="text-gray-400 mb-1 text-xs">Notion DB ID (카메라롤)</p>
                  <input
                    value={notionDbId}
                    onChange={e => { setNotionDbId(e.target.value); localStorage.setItem('loov_camera_notion_db', e.target.value); }}
                    placeholder="32자리 Notion DB ID"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <p className="text-gray-400 mb-1 text-xs">줌 {zoom}x</p>
                  <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="w-full" />
                </div>
              </div>
            )}

            {/* Grid overlay */}
            <div className="absolute inset-0 pointer-events-none z-10"
              style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px)', backgroundSize: 'calc(100%/3) calc(100%/3)' }} />
          </div>

          {/* Filter carousel */}
          <div className="bg-black/90 py-2">
            <div className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className="flex-shrink-0 flex flex-col items-center gap-1.5">
                  <div className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${filter === f.id ? 'border-white scale-110' : 'border-transparent opacity-70'}`}
                    style={{ filter: f.css || 'none', background: 'linear-gradient(135deg, #f97316, #8b5cf6)' }}>
                    <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #f97316 30%, #3b82f6 70%)' }} />
                  </div>
                  <span className="text-white text-[10px]">{f.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Bottom controls */}
          <div className="bg-black py-4 flex items-center justify-center gap-10">
            {/* Gallery shortcut */}
            <button onClick={() => setTab('gallery')} className="relative">
              {photos[0] ? (
                <img src={photos[0].dataUrl} alt="" className="w-12 h-12 rounded-xl object-cover border-2 border-white/40" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white/40">🖼</div>
              )}
              {photos.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{photos.length}</span>
              )}
            </button>

            {/* Capture button */}
            <button onClick={capture}
              className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-transform active:scale-90 ${capturing ? 'scale-90' : ''}`}>
              <div className="w-16 h-16 rounded-full bg-white" />
            </button>

            {/* Flip camera */}
            <button onClick={() => setFacingMode(m => m === 'environment' ? 'user' : 'environment')}
              className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl text-white">
              🔄
            </button>
          </div>
        </div>
      )}

      {/* ── Gallery Tab ── */}
      {tab === 'gallery' && (
        <div className="flex-1 overflow-y-auto bg-gray-950 p-1">
          <div className="p-3 pb-0 flex items-center justify-between">
            <h2 className="text-white font-bold text-lg">갤러리 ({photos.length})</h2>
            <button onClick={() => setTab('camera')} className="text-blue-400 text-sm">📷 카메라</button>
          </div>
          {photos.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 py-20 flex-col gap-3">
              <span className="text-5xl">📷</span>
              <p>아직 사진이 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 mt-2">
              {photos.map(photo => (
                <button key={photo.id} onClick={() => { setSelectedPhoto(photo); setTab('edit'); setEditState(DEFAULT_EDIT); }}
                  className="relative aspect-square overflow-hidden group">
                  <img src={photo.processedUrl || photo.dataUrl} alt="" className="w-full h-full object-cover" style={{ filter: photo.filterCss || 'none' }} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  {photo.uploaded && <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full text-white text-[8px] flex items-center justify-center">✓</div>}
                  {photo.location && <div className="absolute bottom-1 left-1 text-[8px]">📍</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Edit Tab ── */}
      {tab === 'edit' && selectedPhoto && (
        <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden">
          {/* Photo preview */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-black">
            <img
              src={selectedPhoto.processedUrl || selectedPhoto.dataUrl}
              alt=""
              className="max-w-full max-h-full object-contain"
              style={{ filter: editCss }}
            />
          </div>

          {/* Edit controls */}
          <div className="bg-gray-900 px-4 pt-3 pb-2 space-y-3">
            {/* Action buttons */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button onClick={() => setTab('bg')}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-white/5 text-white text-xs">
                <span className="text-xl">✂️</span>누끼따기
              </button>
              <button onClick={applyEdits}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-white/5 text-white text-xs">
                <span className="text-xl">✅</span>적용
              </button>
              <button onClick={() => uploadPhoto(selectedPhoto)}
                disabled={uploading}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-blue-600/30 text-white text-xs">
                <span className="text-xl">{uploading ? '⏳' : '☁️'}</span>업로드
              </button>
              <button onClick={() => downloadPhoto(selectedPhoto)}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-white/5 text-white text-xs">
                <span className="text-xl">💾</span>저장
              </button>
              <button onClick={() => { setPhotos(prev => prev.filter(p => p.id !== selectedPhoto.id)); setTab('gallery'); }}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-red-600/20 text-red-400 text-xs">
                <span className="text-xl">🗑️</span>삭제
              </button>
            </div>

            {uploadMsg && <p className="text-xs text-center text-blue-300">{uploadMsg}</p>}

            {/* Sliders */}
            <div className="space-y-2">
              {([
                ['밝기', 'brightness', 50, 150],
                ['대비', 'contrast', 50, 150],
                ['채도', 'saturation', 0, 200],
                ['따뜻함', 'warmth', 0, 100],
              ] as [string, keyof EditState, number, number][]).map(([label, key, min, max]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-white/60 text-xs w-14 flex-shrink-0">{label}</span>
                  <input
                    type="range" min={min} max={max} value={editState[key]}
                    onChange={e => setEditState(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                    className="flex-1 accent-blue-500"
                  />
                  <span className="text-white/40 text-xs w-8 text-right">{editState[key]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Back */}
          <div className="bg-gray-950 px-4 py-3 flex justify-between">
            <button onClick={() => setTab('gallery')} className="text-gray-400 text-sm">← 갤러리</button>
            <div className="text-gray-500 text-xs">
              {selectedPhoto.timestamp}
              {selectedPhoto.location && ` · 📍${selectedPhoto.location.lat.toFixed(3)},${selectedPhoto.location.lng.toFixed(3)}`}
            </div>
          </div>
        </div>
      )}

      {/* ── Background Removal Tab ── */}
      {tab === 'bg' && selectedPhoto && (
        <div className="flex-1 flex flex-col bg-gray-950">
          <div className="p-4 flex items-center justify-between">
            <button onClick={() => setTab('edit')} className="text-gray-400">← 편집으로</button>
            <h2 className="text-white font-bold">✂️ 누끼따기</h2>
            <div className="w-16" />
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            {/* Before/After */}
            <div className="flex gap-3 w-full">
              <div className="flex-1 rounded-2xl overflow-hidden bg-gray-800">
                <p className="text-xs text-gray-400 text-center py-1">원본</p>
                <img src={selectedPhoto.dataUrl} alt="" className="w-full aspect-square object-cover" />
              </div>
              <div className="flex-1 rounded-2xl overflow-hidden bg-checkerboard" style={{ background: 'repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 0 0 / 20px 20px' }}>
                <p className="text-xs text-gray-300 text-center py-1">결과</p>
                {selectedPhoto.processedUrl ? (
                  <img src={selectedPhoto.processedUrl} alt="" className="w-full aspect-square object-contain" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center text-gray-400 text-sm">미처리</div>
                )}
              </div>
            </div>

            <button onClick={removeBackground} disabled={removingBg}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-lg flex items-center justify-center gap-3 disabled:opacity-50">
              {removingBg ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  AI 처리 중...
                </>
              ) : (
                <>✂️ 배경 제거 (AI)</>
              )}
            </button>

            {selectedPhoto.processedUrl && (
              <div className="flex gap-3 w-full">
                <button onClick={() => downloadPhoto({ ...selectedPhoto, dataUrl: selectedPhoto.processedUrl! })}
                  className="flex-1 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm">
                  💾 PNG 저장
                </button>
                <button onClick={() => uploadPhoto(selectedPhoto)}
                  className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm">
                  ☁️ 클라우드 저장
                </button>
              </div>
            )}

            <p className="text-gray-500 text-xs text-center">AI가 브라우저에서 직접 배경을 제거합니다.<br />첫 실행 시 모델 다운로드(약 50MB)가 필요합니다.</p>
          </div>
        </div>
      )}

      {/* ── 3D Product Tab ── */}
      {tab === '3d' && (
        <div className="flex-1 flex flex-col bg-gray-950">
          {threeDPhotos.length < THREE_D_GUIDES.length ? (
            // Capture mode
            <div className="flex-1 flex flex-col">
              <div className="relative flex-1 bg-black overflow-hidden">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

                {/* Guide overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-white/50 rounded-full w-48 h-48 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-white font-bold text-lg">{threeDPhotos.length + 1}/{THREE_D_GUIDES.length}</div>
                      <div className="text-white/80 text-sm mt-1">{THREE_D_GUIDES[threeDPhotos.length]}</div>
                    </div>
                  </div>
                </div>

                {/* Progress dots */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {THREE_D_GUIDES.map((_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full ${i < threeDPhotos.length ? 'bg-green-400' : i === threeDPhotos.length ? 'bg-white' : 'bg-white/30'}`} />
                  ))}
                </div>
              </div>

              <div className="bg-black py-6 flex items-center justify-center gap-10">
                <button onClick={() => { setThreeDPhotos([]); setThreeDAngleIdx(0); }}
                  className="w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center text-xl">
                  ↺
                </button>
                <button onClick={capture3D}
                  className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white" />
                </button>
                <div className="w-12 h-12" />
              </div>
            </div>
          ) : (
            // 3D Viewer mode
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
              <h2 className="text-white font-bold text-xl">🎡 360° 뷰어</h2>
              <p className="text-gray-400 text-sm">좌우로 드래그하여 회전</p>

              <div
                ref={threeDRef}
                className="relative w-72 h-72 cursor-grab active:cursor-grabbing select-none"
                onMouseDown={e => onThreeDDragStart(e.clientX)}
                onMouseMove={e => e.buttons && onThreeDDragMove(e.clientX)}
                onTouchStart={e => onThreeDDragStart(e.touches[0].clientX)}
                onTouchMove={e => onThreeDDragMove(e.touches[0].clientX)}
              >
                <img
                  src={threeDPhotos[threeDAngleIdx % threeDPhotos.length]}
                  alt=""
                  className="w-full h-full object-contain rounded-2xl border border-white/10"
                  draggable={false}
                />
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {threeDPhotos.map((_, i) => (
                    <button key={i} onClick={() => setThreeDAngleIdx(i)}
                      className={`w-2 h-2 rounded-full transition-all ${i === threeDAngleIdx % threeDPhotos.length ? 'bg-white w-5' : 'bg-white/40'}`} />
                  ))}
                </div>
              </div>

              <div className="text-gray-400 text-xs text-center">
                {THREE_D_GUIDES[threeDAngleIdx % THREE_D_GUIDES.length]} · {threeDAngleIdx % threeDPhotos.length + 1}/{threeDPhotos.length}장
              </div>

              <div className="flex gap-3 w-full">
                <button onClick={() => { setThreeDPhotos([]); setThreeDAngleIdx(0); }}
                  className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-semibold">
                  🔄 다시 촬영
                </button>
                <button onClick={() => {
                  threeDPhotos.forEach((url, i) => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `3d_product_${i + 1}.jpg`;
                    a.click();
                  });
                }} className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold">
                  💾 전체 저장
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom Navigation ── */}
      <div className="bg-gray-950 border-t border-white/10 flex">
        {([
          ['camera', '📷', '카메라'],
          ['gallery', '🖼️', '갤러리'],
          ['edit', '✏️', '편집'],
          ['bg', '✂️', '누끼'],
          ['3d', '🎡', '3D'],
        ] as [typeof tab, string, string][]).map(([t, icon, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-xs transition-colors ${tab === t ? 'text-blue-400' : 'text-gray-500'}`}>
            <span className="text-lg">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
