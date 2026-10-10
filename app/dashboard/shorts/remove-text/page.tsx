'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ── 타입 ──────────────────────────────────────────────────────────────────────
type Effect = 'blur' | 'pixelate' | 'black' | 'white' | 'color';
type DrawState = 'idle' | 'drawing';
type ProcessState = 'idle' | 'processing' | 'done' | 'error';

interface Box {
  id: string;
  x: number; y: number;
  w: number; h: number;
  label: string;
}

// ── 상수 ──────────────────────────────────────────────────────────────────────
const EFFECTS: { v: Effect; label: string; icon: string; desc: string }[] = [
  { v: 'blur',     label: '블러',   icon: '🌫️', desc: '부드럽게 흐리기' },
  { v: 'pixelate', label: '모자이크', icon: '⬛', desc: '픽셀화 처리' },
  { v: 'black',    label: '검정 채우기', icon: '◼', desc: '검은색으로 덮기' },
  { v: 'white',    label: '흰색 채우기', icon: '◻', desc: '흰색으로 덮기' },
  { v: 'color',    label: '색상 채우기', icon: '🎨', desc: '지정 색상으로 덮기' },
];

const PRESETS = [
  { label: '상단 워터마크',   x: 0.02, y: 0.02, w: 0.5,  h: 0.08 },
  { label: '하단 자막',       x: 0.02, y: 0.82, w: 0.96, h: 0.12 },
  { label: '우하단 로고',     x: 0.7,  y: 0.85, w: 0.28, h: 0.12 },
  { label: '좌상단 로고',     x: 0.02, y: 0.02, w: 0.28, h: 0.08 },
  { label: '중앙 하단 텍스트', x: 0.1,  y: 0.75, w: 0.8,  h: 0.1  },
];

// ── 캔버스에 효과 적용 ────────────────────────────────────────────────────────
function applyEffect(
  ctx: CanvasRenderingContext2D,
  box: Box,
  effect: Effect,
  fillColor: string,
  video: HTMLVideoElement,
  scaleX: number,
  scaleY: number,
) {
  const px = Math.round(box.x * scaleX);
  const py = Math.round(box.y * scaleY);
  const pw = Math.round(box.w * scaleX);
  const ph = Math.round(box.h * scaleY);
  if (pw <= 0 || ph <= 0) return;

  if (effect === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(px, py, pw, ph);
  } else if (effect === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px, py, pw, ph);
  } else if (effect === 'color') {
    ctx.fillStyle = fillColor;
    ctx.fillRect(px, py, pw, ph);
  } else if (effect === 'blur') {
    // Canvas filter blur
    const saved = ctx.filter;
    ctx.filter = `blur(${Math.max(pw, ph) / 8}px)`;
    ctx.drawImage(video, px, py, pw, ph, px - 20, py - 20, pw + 40, ph + 40);
    ctx.filter = saved;
    // 클립으로 영역 제한
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#000';
    ctx.fillRect(px, py, pw, ph);
    ctx.restore();
    // 다시 원본 위에 블러 이미지 그리기
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    ctx.filter = `blur(${Math.max(pw, ph) / 8}px)`;
    ctx.drawImage(video, px, py, pw, ph, px, py, pw, ph);
    ctx.filter = 'none';
    ctx.restore();
  } else if (effect === 'pixelate') {
    // 픽셀화: 작게 그렸다가 크게 확대
    const pixelSize = Math.max(8, Math.min(pw, ph) / 6);
    const tempW = Math.max(1, Math.round(pw / pixelSize));
    const tempH = Math.max(1, Math.round(ph / pixelSize));
    const temp = document.createElement('canvas');
    temp.width = tempW; temp.height = tempH;
    const tCtx = temp.getContext('2d')!;
    tCtx.drawImage(video, px, py, pw, ph, 0, 0, tempW, tempH);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp, 0, 0, tempW, tempH, px, py, pw, ph);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
  }
}

// ── 선택 박스 UI 그리기 ───────────────────────────────────────────────────────
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  boxes: Box[],
  selected: string | null,
  w: number,
  h: number,
) {
  boxes.forEach(box => {
    const isSelected = box.id === selected;
    ctx.strokeStyle = isSelected ? '#6366f1' : '#ef4444';
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.setLineDash(isSelected ? [] : [6, 3]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.setLineDash([]);

    // 배경 레이블
    ctx.fillStyle = isSelected ? '#6366f1' : '#ef4444';
    const fontSize = Math.max(10, Math.min(w, h) * 0.025);
    ctx.font = `bold ${fontSize}px sans-serif`;
    const metrics = ctx.measureText(box.label);
    const labelW = metrics.width + 8;
    const labelH = fontSize + 6;
    ctx.fillRect(box.x, box.y - labelH, labelW, labelH);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(box.label, box.x + 4, box.y - 4);

    // 삭제 핸들
    ctx.fillStyle = isSelected ? '#6366f1' : '#ef4444';
    ctx.beginPath();
    ctx.arc(box.x + box.w, box.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(10, fontSize * 0.8)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', box.x + box.w, box.y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function RemoveTextPage() {
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [effect, setEffect] = useState<Effect>('pixelate');
  const [fillColor, setFillColor] = useState('#000000');
  const [drawState, setDrawState] = useState<DrawState>('idle');
  const [processState, setProcessState] = useState<ProcessState>('idle');
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [outputFormat, setOutputFormat] = useState<'webm' | 'mp4'>('webm');

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const currentBox = useRef<Box | null>(null);
  const animRef = useRef<number>(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const boxCounter = useRef(1);

  // ── 프리뷰 렌더 루프 ────────────────────────────────────────────────────────
  const renderPreview = useCallback(() => {
    const video = videoRef.current;
    const canvas = previewCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !canvas || !overlay || video.readyState < 2) {
      animRef.current = requestAnimationFrame(renderPreview);
      return;
    }

    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, w, h);

    // 효과 미리보기
    boxes.forEach(box => {
      applyEffect(ctx, box, effect, fillColor, video, w, h);
    });

    // 오버레이 (박스 UI)
    const oCtx = overlay.getContext('2d')!;
    oCtx.clearRect(0, 0, w, h);
    drawOverlay(oCtx, boxes, selected, w, h);
    if (currentBox.current) {
      oCtx.strokeStyle = '#22c55e';
      oCtx.lineWidth = 2;
      oCtx.setLineDash([4, 2]);
      const b = currentBox.current;
      oCtx.strokeRect(b.x, b.y, b.w, b.h);
      oCtx.setLineDash([]);
    }

    animRef.current = requestAnimationFrame(renderPreview);
  }, [boxes, effect, fillColor, selected]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(animRef.current);
  }, [renderPreview]);

  // ── 비디오 로드 ─────────────────────────────────────────────────────────────
  const loadVideo = (src: string) => {
    setVideoSrc(src);
    setDownloadUrl('');
    setProcessState('idle');
    setBoxes([]);
    setProgress(0);
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('video/')) { setErrorMsg('동영상 파일만 가능합니다.'); return; }
    const url = URL.createObjectURL(file);
    loadVideo(url);
  };

  const handleVideoLoaded = () => {
    const video = videoRef.current;
    if (!video) return;
    setVideoDuration(video.duration);
    setVideoSize({ w: video.videoWidth, h: video.videoHeight });

    // Canvas 크기 설정
    const maxW = 640;
    const ratio = video.videoHeight / video.videoWidth;
    const dispW = Math.min(maxW, video.videoWidth);
    const dispH = Math.round(dispW * ratio);

    [previewCanvasRef, overlayCanvasRef].forEach(ref => {
      if (ref.current) {
        ref.current.width = dispW;
        ref.current.height = dispH;
      }
    });
    if (outputCanvasRef.current) {
      outputCanvasRef.current.width = video.videoWidth;
      outputCanvasRef.current.height = video.videoHeight;
    }
  };

  // ── 박스 그리기 이벤트 ───────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = overlayCanvasRef.current!.getBoundingClientRect();
    const scaleX = (previewCanvasRef.current?.width ?? 1) / rect.width;
    const scaleY = (previewCanvasRef.current?.height ?? 1) / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (processState === 'processing') return;
    const pos = getPos(e);

    // 삭제 버튼 클릭 체크 (박스 우상단 ×)
    for (const box of [...boxes].reverse()) {
      const cx = box.x + box.w, cy = box.y;
      if (Math.abs(pos.x - cx) < 12 && Math.abs(pos.y - cy) < 12) {
        setBoxes(prev => prev.filter(b => b.id !== box.id));
        setSelected(null);
        return;
      }
    }

    // 기존 박스 선택 체크
    for (const box of [...boxes].reverse()) {
      if (pos.x >= box.x && pos.x <= box.x + box.w && pos.y >= box.y && pos.y <= box.y + box.h) {
        setSelected(box.id);
        return;
      }
    }

    // 새 박스 그리기 시작
    setSelected(null);
    setDrawState('drawing');
    drawStart.current = pos;
    currentBox.current = { id: '', x: pos.x, y: pos.y, w: 0, h: 0, label: '' };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawState !== 'drawing' || !drawStart.current) return;
    const pos = getPos(e);
    const x = Math.min(drawStart.current.x, pos.x);
    const y = Math.min(drawStart.current.y, pos.y);
    const w = Math.abs(pos.x - drawStart.current.x);
    const h = Math.abs(pos.y - drawStart.current.y);
    currentBox.current = { id: '', x, y, w, h, label: '' };
  };

  const onMouseUp = () => {
    if (drawState !== 'drawing' || !currentBox.current) return;
    const b = currentBox.current;
    if (b.w > 10 && b.h > 10) {
      const id = `box_${Date.now()}`;
      const label = `영역 ${boxCounter.current++}`;
      const canvas = previewCanvasRef.current;
      const w = canvas?.width ?? 1, h = canvas?.height ?? 1;
      // 0~1 정규화 좌표로 변환
      setBoxes(prev => [...prev, {
        id, label,
        x: b.x / w, y: b.y / h,
        w: b.w / w, h: b.h / h,
      }]);
      setSelected(id);
    }
    currentBox.current = null;
    setDrawState('idle');
  };

  // ── 프리셋 추가 ─────────────────────────────────────────────────────────────
  const addPreset = (p: typeof PRESETS[0]) => {
    const id = `box_${Date.now()}`;
    setBoxes(prev => [...prev, { id, label: p.label, x: p.x, y: p.y, w: p.w, h: p.h }]);
    setSelected(id);
  };

  // ── 처리 시작 ────────────────────────────────────────────────────────────────
  const startProcessing = useCallback(async () => {
    const video = videoRef.current;
    const outCanvas = outputCanvasRef.current;
    if (!video || !outCanvas || boxes.length === 0) return;

    setProcessState('processing');
    setProgress(0);
    setErrorMsg('');
    chunksRef.current = [];

    try {
      // 출력 캔버스 크기 = 원본 해상도
      const vw = video.videoWidth, vh = video.videoHeight;
      outCanvas.width = vw; outCanvas.height = vh;
      const ctx = outCanvas.getContext('2d')!;

      // 비디오 오디오 스트림 캡처
      const videoStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      const canvasStream = outCanvas.captureStream(30);

      // 오디오 트랙 추가
      if (videoStream) {
        videoStream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
      }

      // MediaRecorder 설정
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';

      const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 8_000_000 });
      recorderRef.current = recorder;

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setProcessState('done');
      };

      // 프레임 렌더 루프
      const renderFrame = () => {
        ctx.drawImage(video, 0, 0, vw, vh);
        boxes.forEach(box => applyEffect(ctx, box, effect, fillColor, video, vw, vh));

        const p = video.currentTime / video.duration;
        setProgress(Math.round(p * 100));

        if (!video.paused && !video.ended) {
          requestAnimationFrame(renderFrame);
        }
      };

      recorder.start(100);
      video.currentTime = 0;
      await new Promise<void>(res => {
        video.oncanplay = () => res();
        if (video.readyState >= 3) res();
      });
      video.play();
      renderFrame();

      // 종료 대기
      await new Promise<void>(res => { video.onended = () => res(); });
      recorder.stop();
      video.pause();

    } catch (e) {
      setErrorMsg(`처리 실패: ${e}`);
      setProcessState('error');
    }
  }, [boxes, effect, fillColor]);

  // ── 프리뷰 재생 토글 ────────────────────────────────────────────────────────
  const togglePreview = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setIsPreviewPlaying(true); }
    else { video.pause(); setIsPreviewPlaying(false); }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-full bg-gray-50">
      {/* 숨김 비디오 (실제 재생원) */}
      {videoSrc && (
        <video ref={videoRef} src={videoSrc} className="hidden" crossOrigin="anonymous"
          onLoadedMetadata={handleVideoLoaded}
          onEnded={() => setIsPreviewPlaying(false)} />
      )}
      <canvas ref={outputCanvasRef} className="hidden" />

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <a href="/dashboard/shorts"
            className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center text-gray-500 transition-colors text-sm">
            ←
          </a>
          <div>
            <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm"
                style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)' }}>✂️</span>
              동영상 텍스트 제거
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">워터마크 · 자막 · 로고 제거 · Canvas 렌더링 (완전 무료)</p>
          </div>
        </div>
      </header>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 max-w-5xl">

        {/* ── 왼쪽: 프리뷰 ── */}
        <div className="space-y-4">

          {/* 업로드 영역 */}
          {!videoSrc && (
            <div
              className="border-2 border-dashed border-gray-300 rounded-3xl p-12 text-center hover:border-indigo-400 transition-colors cursor-pointer bg-white"
              onClick={() => fileInputRef.current?.click()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onDragOver={e => e.preventDefault()}
            >
              <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              <div className="text-5xl mb-4">🎬</div>
              <p className="font-bold text-gray-700 text-lg">동영상 파일 드래그 or 클릭</p>
              <p className="text-sm text-gray-400 mt-2">MP4, MOV, WebM, AVI 등 지원</p>
            </div>
          )}

          {/* URL 입력 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <label className="text-xs font-bold text-gray-500 mb-2 block">🔗 또는 동영상 URL 직접 입력</label>
            <div className="flex gap-2">
              <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                placeholder="https://example.com/video.mp4"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
              <button onClick={() => { if (videoUrl.trim()) loadVideo(videoUrl.trim()); }}
                disabled={!videoUrl.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-indigo-500">
                불러오기
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">※ CORS 정책으로 일부 외부 URL은 불가. 직접 다운로드 후 업로드 권장</p>
          </div>

          {/* 프리뷰 캔버스 */}
          {videoSrc && (
            <div className="bg-black rounded-2xl overflow-hidden">
              <div className="relative cursor-crosshair">
                <canvas ref={previewCanvasRef} className="w-full block" />
                <canvas ref={overlayCanvasRef}
                  className="absolute inset-0 w-full h-full"
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={onMouseUp}
                  onMouseLeave={onMouseUp}
                />
              </div>

              {/* 비디오 컨트롤 */}
              <div className="flex items-center gap-3 px-4 py-3 bg-black/80">
                <button onClick={togglePreview}
                  className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white text-sm transition-colors">
                  {isPreviewPlaying ? '⏸' : '▶'}
                </button>
                <div className="text-xs text-white/70">{formatTime(videoDuration)}</div>
                <div className="flex-1 text-[10px] text-white/50 text-center">
                  박스를 드래그해서 텍스트 영역 선택
                </div>
                <button onClick={() => { setVideoSrc(''); setBoxes([]); setDownloadUrl(''); setProcessState('idle'); }}
                  className="text-xs text-white/50 hover:text-white transition-colors">
                  ✕ 닫기
                </button>
              </div>
            </div>
          )}

          {/* 비디오 정보 */}
          {videoSrc && videoSize.w > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-3 flex gap-4 text-xs text-gray-500">
              <span>📐 {videoSize.w}×{videoSize.h}</span>
              <span>⏱ {formatTime(videoDuration)}</span>
              <span>🎬 {boxes.length}개 영역 선택됨</span>
            </div>
          )}

          {/* 처리 결과 */}
          {processState === 'processing' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="font-bold text-indigo-700 text-sm">처리 중... {progress}%</span>
              </div>
              <div className="w-full bg-indigo-200 rounded-full h-2">
                <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-indigo-500 mt-2">실시간으로 동영상을 렌더링 중입니다. 창을 닫지 마세요.</p>
            </div>
          )}

          {processState === 'done' && downloadUrl && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                ✅ 처리 완료!
              </div>
              <video src={downloadUrl} controls className="w-full rounded-xl" />
              <a href={downloadUrl}
                download={`removed_text_${Date.now()}.webm`}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-sm transition-colors">
                ⬇️ WebM 파일 다운로드
              </a>
              <p className="text-xs text-emerald-600">
                💡 MP4가 필요하면 <a href="https://cloudconvert.com/webm-to-mp4" target="_blank" rel="noopener noreferrer" className="underline font-bold">CloudConvert</a>에서 무료 변환 가능
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">{errorMsg}</div>
          )}
        </div>

        {/* ── 오른쪽: 컨트롤 ── */}
        <div className="space-y-4">

          {/* 효과 선택 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h3 className="font-bold text-gray-800 text-sm mb-3">🎨 제거 효과</h3>
            <div className="space-y-1.5">
              {EFFECTS.map(ef => (
                <button key={ef.v} onClick={() => setEffect(ef.v)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                    effect === ef.v ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'
                  }`}>
                  <span className="text-lg">{ef.icon}</span>
                  <div>
                    <div className={`text-xs font-bold ${effect === ef.v ? 'text-indigo-700' : 'text-gray-700'}`}>{ef.label}</div>
                    <div className="text-[10px] text-gray-400">{ef.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            {effect === 'color' && (
              <div className="mt-3 flex items-center gap-2">
                <label className="text-xs text-gray-500">색상:</label>
                <input type="color" value={fillColor} onChange={e => setFillColor(e.target.value)}
                  className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer" />
                <span className="text-xs font-mono text-gray-500">{fillColor}</span>
              </div>
            )}
          </div>

          {/* 프리셋 영역 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h3 className="font-bold text-gray-800 text-sm mb-3">⚡ 빠른 선택 (프리셋)</h3>
            <div className="space-y-1.5">
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => addPreset(p)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-left text-xs font-medium text-gray-600 transition-colors">
                  <span className="text-sm">➕</span> {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 선택된 박스 목록 */}
          {boxes.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800 text-sm">📌 선택된 영역 ({boxes.length})</h3>
                <button onClick={() => { setBoxes([]); setSelected(null); }}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors">전체 삭제</button>
              </div>
              <div className="space-y-1.5">
                {boxes.map(box => (
                  <div key={box.id}
                    onClick={() => setSelected(box.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all ${
                      selected === box.id ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 hover:bg-gray-100'
                    }`}>
                    <div className={`w-2 h-2 rounded-full ${selected === box.id ? 'bg-indigo-500' : 'bg-red-400'}`} />
                    <span className="text-xs flex-1 text-gray-700">{box.label}</span>
                    <span className="text-[10px] text-gray-400">
                      {Math.round(box.w * 100)}%×{Math.round(box.h * 100)}%
                    </span>
                    <button onClick={e => { e.stopPropagation(); setBoxes(prev => prev.filter(b => b.id !== box.id)); setSelected(null); }}
                      className="text-gray-300 hover:text-red-500 transition-colors text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 처리 버튼 */}
          <button
            onClick={startProcessing}
            disabled={!videoSrc || boxes.length === 0 || processState === 'processing'}
            className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)' }}>
            {processState === 'processing'
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />처리 중 {progress}%</>
              : '✂️ 텍스트 제거 시작'
            }
          </button>
          {!videoSrc && <p className="text-xs text-gray-400 text-center">동영상을 먼저 업로드해주세요</p>}
          {videoSrc && boxes.length === 0 && <p className="text-xs text-amber-500 text-center">영역을 드래그하거나 프리셋을 선택해주세요</p>}

          {/* 사용 안내 */}
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs text-gray-600 space-y-2">
            <div className="font-bold text-gray-700 mb-2">📖 사용 방법</div>
            {[
              '동영상 업로드 또는 URL 입력',
              '프리뷰 화면에서 드래그로 영역 선택',
              '또는 프리셋 버튼으로 빠른 선택',
              '제거 효과 선택 (블러/모자이크 등)',
              '"텍스트 제거 시작" 클릭',
              '완료 후 WebM 파일 다운로드',
            ].map((step, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="text-indigo-400 font-bold flex-shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </div>
            ))}
            <div className="pt-1 text-amber-600">
              ⚠️ 처리 시간 = 영상 길이와 동일합니다 (실시간 렌더링)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
