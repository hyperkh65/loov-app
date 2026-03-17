'use client';

/**
 * CAM1 - 계속 녹화 카메라 (아이폰 잠금화면 위장)
 * 활성화: 시계 3번 빠르게 탭 → PIN 입력
 * 기능: WebRTC 스트리밍 + 5분 단위 NAS 자동 녹화 (1080p 고화질)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const CCTV_PIN = process.env.NEXT_PUBLIC_CCTV_PIN || '0609';
const CHANNEL = 'cctv-cam1';
const CAM_ID = 'cam1';
const CHUNK_MS = 30 * 1000; // 30초 청크
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// 전체화면 진입 (iOS Safari는 미지원 → 홈화면 추가 안내)
function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
}

// 홈 화면에서 실행 중인지 (iOS PWA standalone)
function isStandalone() {
  return typeof window !== 'undefined' &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function Cam1Page() {
  const [phase, setPhase] = useState<'lock' | 'pin' | 'active'>('lock');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadError, setUploadError] = useState(false);
  const [viewerConnected, setViewerConnected] = useState(false);
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  const [clockTaps, setClockTaps] = useState(0);
  const [showPwaHint, setShowPwaHint] = useState(false);
  const clockTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }));
      setDate(now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock.request('screen');
      }
    } catch { /* ignore */ }
  };

  // iOS Safari는 webm 미지원 → mp4 우선 시도
  const getSupportedMimeType = () => {
    const types = [
      'video/mp4;codecs=avc1,mp4a.40.2', // iOS Safari (H.264 + AAC)
      'video/mp4',                         // iOS Safari 폴백
      'video/webm;codecs=vp9,opus',        // Chrome/Android
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  };

  const flushChunk = useCallback(async (blob: Blob, ts: number, ext: string) => {
    if (blob.size < 1000) { console.warn('blob too small', blob.size); return; }
    try {
      console.log(`[cam1] uploading ${(blob.size/1024/1024).toFixed(1)}MB ext=${ext}`);
      const filename = `${CAM_ID}_${ts}.${ext}`;
      const form = new FormData();
      form.append('file', blob, filename);
      form.append('filename', filename);
      const res = await fetch('/api/cctv/record', { method: 'POST', body: form });
      if (!res.ok) {
        const txt = await res.text();
        console.error('upload failed', res.status, txt);
        setUploadError(true);
        setTimeout(() => setUploadError(false), 5000);
      } else {
        console.log('[cam1] upload OK', filename);
        setUploadCount(c => c + 1);
      }
    } catch (e) {
      console.error('flushChunk error', e);
      setUploadError(true);
      setTimeout(() => setUploadError(false), 5000);
    }
  }, []);

  const startChunk = useCallback((stream: MediaStream) => {
    const mimeType = getSupportedMimeType();
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    let mr: MediaRecorder;
    try {
      mr = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 800_000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 800_000 });
    } catch (e) {
      console.error('MediaRecorder 생성 실패', e);
      return;
    }
    mediaRecorderRef.current = mr;
    recChunksRef.current = [];
    const startTs = Date.now();

    mr.ondataavailable = (e) => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(recChunksRef.current, { type: mimeType || 'video/webm' });
      recChunksRef.current = [];
      flushChunk(blob, startTs, ext);
      if (isRecordingRef.current) startChunk(stream);
    };

    mr.start(5000);
    chunkTimerRef.current = setTimeout(() => {
      if (mr.state === 'recording') mr.stop();
    }, CHUNK_MS);
  }, [flushChunk]);

  const startRecording = useCallback((stream: MediaStream) => {
    isRecordingRef.current = true;
    setIsRecording(true);
    startChunk(stream);
  }, [startChunk]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  }, []);

  const handleClockTap = () => {
    const next = clockTaps + 1;
    setClockTaps(next);
    if (clockTapTimer.current) clearTimeout(clockTapTimer.current);
    if (next >= 3) {
      setClockTaps(0);
      setPhase('pin');
      return;
    }
    clockTapTimer.current = setTimeout(() => setClockTaps(0), 800);
  };

  const handlePinKey = (k: string) => {
    if (k === '←') { setPin(p => p.slice(0, -1)); setPinError(false); return; }
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      if (next === CCTV_PIN) {
        setPhase('active');
        setPin('');
        startCamera();
      } else {
        setPinError(true);
        setTimeout(() => { setPin(''); setPinError(false); }, 600);
      }
    }
  };

  const startCamera = useCallback(async () => {
    await requestWakeLock();
    requestFullscreen();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: { echoCancellation: false, noiseSuppression: false, sampleRate: 48000 },
    });
    localStreamRef.current = stream;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    supabaseRef.current = supabase;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    const ch = supabase.channel(CHANNEL, { config: { broadcast: { self: false } } });
    channelRef.current = ch;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) ch.send({ type: 'broadcast', event: 'cam-ice', payload: { candidate: candidate.toJSON() } });
    };
    pc.onconnectionstatechange = () => setViewerConnected(pc.connectionState === 'connected');

    ch.on('broadcast', { event: 'viewer-request' }, async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ch.send({ type: 'broadcast', event: 'cam-offer', payload: { sdp: pc.localDescription } });
    });
    ch.on('broadcast', { event: 'viewer-answer' }, async ({ payload }) => {
      if (pc.signalingState === 'have-local-offer')
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    });
    ch.on('broadcast', { event: 'viewer-ice' }, async ({ payload }) => {
      try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { /* ignore */ }
    });

    await ch.subscribe();
    setIsStreaming(true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ch.send({ type: 'broadcast', event: 'cam-offer', payload: { sdp: pc.localDescription } });

    startRecording(stream);
  }, [startRecording]);

  const stopCamera = useCallback(() => {
    stopRecording();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    channelRef.current?.unsubscribe();
    wakeLockRef.current?.release();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setIsStreaming(false);
    setViewerConnected(false);
    setPhase('lock');
  }, [stopRecording]);

  // ── 잠금화면 ──────────────────────────────────────────
  if (phase === 'lock') {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-start pt-20 select-none"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          paddingTop: 'max(5rem, env(safe-area-inset-top))',
        }}
      >
        {/* PWA 힌트 */}
        {showPwaHint && (
          <div className="absolute top-0 left-0 right-0 z-50 bg-black/95 text-white text-xs px-4 py-3 text-center">
            완전한 전체화면을 위해 Safari → <strong>공유 버튼 → 홈 화면에 추가</strong> 후 앱으로 실행하세요
            <button onClick={() => setShowPwaHint(false)} className="ml-3 text-white/50">✕</button>
          </div>
        )}

        {/* 상태바 */}
        <div className="absolute top-0 left-0 right-0 flex justify-between items-center px-6 text-white text-xs font-semibold"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <span>{time.slice(0,5)}</span>
          <div className="flex items-center gap-1"><span>●●●</span><span>WiFi</span><span>🔋</span></div>
        </div>

        <button onClick={handleClockTap} className="text-white text-center mt-8 active:opacity-70 transition-opacity">
          <div className="text-7xl font-thin tracking-tight">{time}</div>
          <div className="text-lg font-light opacity-80 mt-2">{date}</div>
        </button>

        <div className="absolute bottom-32 left-0 right-0 grid grid-cols-4 gap-4 px-8">
          {['📷','📱','🎵','🗺️','📸','🔍','⚙️','🗓️','💬','📧','🌐','🏦'].map((icon, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl">{icon}</div>
              <span className="text-white text-xs opacity-60">App</span>
            </div>
          ))}
        </div>

        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-5"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {['📞','📩','🌐','🎵'].map((icon, i) => (
            <div key={i} className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl">{icon}</div>
          ))}
        </div>

      </div>
    );
  }

  // ── PIN 입력 ──────────────────────────────────────────
  if (phase === 'pin') {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center select-none"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
      >
        <div className="text-white text-center mb-8">
          <div className="text-lg font-light opacity-80">암호 입력</div>
          <div className={`flex gap-4 justify-center mt-4 ${pinError ? 'animate-pulse' : ''}`}>
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 border-white/60 ${i < pin.length ? 'bg-white' : 'bg-transparent'}`} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-white">
          {['1','2','3','4','5','6','7','8','9','','0','←'].map((k, i) => (
            <button key={i} onClick={() => k && handlePinKey(k)}
              className={`w-20 h-20 rounded-full text-2xl font-light active:bg-white/20 transition-colors ${k === '' ? 'invisible' : 'bg-white/10 hover:bg-white/20'}`}>
              {k}
            </button>
          ))}
        </div>
        <button onClick={() => setPhase('lock')} className="mt-8 text-white/50 text-sm">취소</button>
      </div>
    );
  }

  // ── 활성화 (거의 검은 화면 — 진단 정보 아주 작게) ────
  return (
    <div className="fixed inset-0 bg-black select-none">
      {/* 좌하단: 업로드 카운터 (아주 작고 어둡게) */}
      <div
        className="absolute text-[10px] font-mono"
        style={{
          bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          left: '1rem',
          color: uploadError ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)',
        }}
      >
        {uploadError ? 'ERR' : uploadCount > 0 ? `↑${uploadCount}` : '●'}
      </div>

      {/* 우하단: 투명 중지 버튼 */}
      <button
        onClick={stopCamera}
        className="absolute opacity-0"
        style={{
          bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          right: '1rem',
          width: '3rem',
          height: '3rem',
        }}
        aria-hidden="true"
      />
    </div>
  );
}
