'use client';

/**
 * CCTV 카메라 페이지 - 아이폰 잠금화면 위장
 * 활성화: 시계 3번 빠르게 탭 → PIN 입력
 * 기능: WebRTC 스트리밍 + 30초 단위 NAS 자동 녹화 (연속)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const CCTV_PIN = process.env.NEXT_PUBLIC_CCTV_PIN || '0609';
const CHANNEL = 'cctv-room';
const CAM_ID = 'cctv';
const CHUNK_MS = 30 * 1000;
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export default function CCTVCameraPage() {
  const [phase, setPhase] = useState<'lock' | 'pin' | 'active'>('lock');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerConnected, setViewerConnected] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadError, setUploadError] = useState(false);
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  const [clockTaps, setClockTaps] = useState(0);
  const clockTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const noSleepVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 녹화 refs
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

  const startNoSleep = () => {
    try {
      if (noSleepVideoRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = 1; canvas.height = 1;
      const ctx2d = canvas.getContext('2d');
      if (ctx2d) ctx2d.fillRect(0, 0, 1, 1);
      const vid = document.createElement('video');
      vid.setAttribute('playsinline', '');
      vid.setAttribute('loop', '');
      vid.muted = true;
      vid.srcObject = canvas.captureStream(1);
      vid.style.cssText = 'position:fixed;width:1px;height:1px;top:-1px;left:-1px;opacity:0.01;pointer-events:none;z-index:-1';
      document.body.appendChild(vid);
      noSleepVideoRef.current = vid;
      vid.play().catch(() => {});
    } catch { /* ignore */ }
  };

  const getSupportedMimeType = () => {
    const types = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  };

  const flushChunk = useCallback(async (blob: Blob, ts: number, ext: string) => {
    if (blob.size < 1000) return;
    try {
      const filename = `${CAM_ID}_${ts}.${ext}`;
      const form = new FormData();
      form.append('file', blob, filename);
      form.append('filename', filename);
      const res = await fetch('/api/cctv/record', { method: 'POST', body: form });
      if (!res.ok) {
        setUploadError(true);
        setTimeout(() => setUploadError(false), 5000);
      } else {
        setUploadCount(c => c + 1);
      }
    } catch {
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
    } catch { return; }

    mediaRecorderRef.current = mr;
    recChunksRef.current = [];
    const startTs = Date.now();

    mr.ondataavailable = (e) => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
    mr.onerror = () => {
      // 오류 시 잠시 후 재시작
      if (isRecordingRef.current) setTimeout(() => startChunk(stream), 1000);
    };
    mr.onstop = () => {
      const chunks = [...recChunksRef.current];
      recChunksRef.current = [];
      if (chunks.length > 0) flushChunk(new Blob(chunks, { type: mimeType || 'video/webm' }), startTs, ext);
      // 연속 녹화: 자동 재시작
      if (isRecordingRef.current) startChunk(stream);
    };

    mr.start(5000);
    chunkTimerRef.current = setTimeout(() => {
      if (mr.state === 'recording') mr.stop();
    }, CHUNK_MS);
  }, [flushChunk]);

  const startRecording = useCallback((stream: MediaStream) => {
    isRecordingRef.current = true;
    startChunk(stream);
  }, [startChunk]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  }, []);

  const handleClockTap = () => {
    const next = clockTaps + 1;
    setClockTaps(next);
    if (clockTapTimer.current) clearTimeout(clockTapTimer.current);
    if (next >= 3) { setClockTaps(0); setPhase('pin'); return; }
    clockTapTimer.current = setTimeout(() => setClockTaps(0), 800);
  };

  const handlePinKey = (k: string) => {
    if (k === '←') { setPin(p => p.slice(0, -1)); setPinError(false); return; }
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      if (next === CCTV_PIN) { setPhase('active'); setPin(''); startCamera(); }
      else { setPinError(true); setTimeout(() => { setPin(''); setPinError(false); }, 600); }
    }
  };

  const startCamera = useCallback(async () => {
    await requestWakeLock();
    startNoSleep();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: false, noiseSuppression: false },
    });
    localStreamRef.current = stream;

    // 무음 버퍼로 iOS 백그라운드 방지 (삐 소리 없음)
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      ctx.resume().catch(() => {});
      const playsilence = () => {
        if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); return; }
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
      };
      audioKeepAliveRef.current = setInterval(playsilence, 5_000);
    } catch { /* ignore */ }

    // 트랙 종료 시 카메라 전체 재시작
    stream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        if (isRecordingRef.current) startCamera().catch(() => {});
      });
    });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    supabaseRef.current = supabase;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    const channel = supabase.channel(CHANNEL, { config: { broadcast: { self: false } } });
    channelRef.current = channel;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) channel.send({ type: 'broadcast', event: 'cam-ice', payload: { candidate: candidate.toJSON() } });
    };
    pc.onconnectionstatechange = () => setViewerConnected(pc.connectionState === 'connected');

    channel.on('broadcast', { event: 'viewer-request' }, async () => {
      if (pc.signalingState !== 'stable') return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      channel.send({ type: 'broadcast', event: 'cam-offer', payload: { sdp: pc.localDescription } });
    });
    channel.on('broadcast', { event: 'viewer-answer' }, async ({ payload }) => {
      if (pc.signalingState === 'have-local-offer')
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    });
    channel.on('broadcast', { event: 'viewer-ice' }, async ({ payload }) => {
      try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { /* ignore */ }
    });

    await channel.subscribe();
    setIsStreaming(true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    channel.send({ type: 'broadcast', event: 'cam-offer', payload: { sdp: pc.localDescription } });

    heartbeatRef.current = setInterval(() => {
      channel.send({ type: 'broadcast', event: 'cam-ping', payload: { ts: Date.now() } });
    }, 25_000);

    // 연속 녹화 시작
    startRecording(stream);
  }, [startRecording]);

  // 백그라운드 복귀 시 재시작
  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === 'visible' && isRecordingRef.current) {
        audioCtxRef.current?.resume().catch(() => {});
        requestWakeLock();
        noSleepVideoRef.current?.play().catch(() => {});
        if (mediaRecorderRef.current?.state === 'inactive' && localStreamRef.current) {
          const alive = localStreamRef.current.getTracks().every(t => t.readyState === 'live');
          if (alive) startChunk(localStreamRef.current);
          else startCamera().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [startChunk, startCamera]);

  const stopCamera = useCallback(() => {
    stopRecording();
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (audioKeepAliveRef.current) clearInterval(audioKeepAliveRef.current);
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    channelRef.current?.unsubscribe();
    wakeLockRef.current?.release();
    if (noSleepVideoRef.current) { noSleepVideoRef.current.pause(); noSleepVideoRef.current.remove(); noSleepVideoRef.current = null; }
    audioCtxRef.current?.close().catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setIsStreaming(false);
    setViewerConnected(false);
    setPhase('lock');
  }, [stopRecording]);

  // ── 잠금화면 ──────────────────────────────────────────
  if (phase === 'lock') {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 flex flex-col items-center justify-start select-none"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', paddingTop: 'max(5rem, env(safe-area-inset-top))' }}>
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
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-5" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {['📞','📩','🌐','🎵'].map((icon, i) => (
            <div key={i} className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl">{icon}</div>
          ))}
        </div>
        {isStreaming && <div className="absolute top-3 right-20 w-2 h-2 rounded-full bg-green-400" />}
      </div>
    );
  }

  // ── PIN 입력 ──────────────────────────────────────────
  if (phase === 'pin') {
    return (
      <div className="fixed inset-0 bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 flex flex-col items-center justify-center select-none"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <div className="text-white text-center mb-8">
          <div className="text-lg font-light opacity-80">암호 입력</div>
          <div className={`flex gap-4 justify-center mt-4 ${pinError ? 'animate-pulse' : ''}`}>
            {[0,1,2,3].map(i => <div key={i} className={`w-4 h-4 rounded-full border-2 border-white/60 ${i < pin.length ? 'bg-white' : 'bg-transparent'}`} />)}
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

  // ── 활성화 (검은 화면) ────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black select-none">
      <div className="absolute text-[10px] font-mono"
        style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))', left: '1rem', color: uploadError ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)' }}>
        {uploadError ? 'ERR' : uploadCount > 0 ? `↑${uploadCount}` : '●'}
      </div>
      <div className="absolute text-[10px] font-mono"
        style={{ top: 'max(1rem, env(safe-area-inset-top))', right: '1rem', color: viewerConnected ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)' }}>
        {viewerConnected ? '◉' : '○'}
      </div>
      <button onClick={stopCamera} className="absolute opacity-0"
        style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))', right: '1rem', width: '3rem', height: '3rem' }}
        aria-hidden="true" />
    </div>
  );
}
