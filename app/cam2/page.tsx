'use client';

/**
 * CAM2 - 모션 감지 녹화 카메라 (아이폰 잠금화면 위장)
 * 활성화: 시계 3번 빠르게 탭 → PIN 입력
 * 기능: WebRTC 스트리밍 + 모션 감지 자동 녹화 (1080p 고화질)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const CCTV_PIN = process.env.NEXT_PUBLIC_CCTV_PIN || '0609';
const CHANNEL = 'cctv-cam2';
const CAM_ID = 'cam2';
function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl) servers.push({ urls: turnUrl, username: turnUser ?? '', credential: turnCred ?? '' });
  return servers;
}
const ICE_SERVERS = getIceServers();
const MOTION_THRESHOLD = 18;
const MOTION_STOP_DELAY = 15000;
const FRAME_INTERVAL = 500;

function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
}

export default function Cam2Page() {
  const [phase, setPhase] = useState<'lock' | 'pin' | 'active'>('lock');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [motionAlert, setMotionAlert] = useState(false);
  const [viewerConnected, setViewerConnected] = useState(false);
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const motionStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionDetectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const motionVideoRef = useRef<HTMLVideoElement | null>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recStartTsRef = useRef<number>(0);

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
      if (!res.ok) console.error('upload failed', await res.text());
    } catch (e) { console.error('flushChunk error', e); }
  }, []);

  const startRecording = useCallback((stream: MediaStream) => {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;
    setIsRecording(true);

    const mimeType = getSupportedMimeType();
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    let mr: MediaRecorder;
    try {
      mr = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 1_500_000 });
    } catch (e) {
      console.error('MediaRecorder 생성 실패', e);
      isRecordingRef.current = false;
      setIsRecording(false);
      return;
    }
    mediaRecorderRef.current = mr;
    recChunksRef.current = [];
    recStartTsRef.current = Date.now();

    mr.ondataavailable = (e) => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(recChunksRef.current, { type: mimeType || 'video/webm' });
      recChunksRef.current = [];
      flushChunk(blob, recStartTsRef.current, ext);
      isRecordingRef.current = false;
      setIsRecording(false);
    };
    mr.start(5000);
  }, [flushChunk]);

  const stopRecording = useCallback(() => {
    if (motionStopTimerRef.current) clearTimeout(motionStopTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    } else {
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  }, []);

  const startMotionDetect = useCallback((stream: MediaStream) => {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.play().catch(() => {});
    motionVideoRef.current = video;

    const canvas = document.createElement('canvas');
    motionCanvasRef.current = canvas;

    motionDetectIntervalRef.current = setInterval(() => {
      if (!video.videoWidth) return;
      const W = Math.floor(video.videoWidth / 4);
      const H = Math.floor(video.videoHeight / 4);
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, W, H);
      const frame = ctx.getImageData(0, 0, W, H);
      const pixels = frame.data;

      if (prevPixelsRef.current && prevPixelsRef.current.length === pixels.length) {
        let diffSum = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          diffSum += Math.abs(pixels[i] - prevPixelsRef.current[i]);
        }
        const avgDiff = diffSum / (pixels.length / 4);

        if (avgDiff > MOTION_THRESHOLD) {
          setMotionAlert(true);
          setTimeout(() => setMotionAlert(false), 2000);
          if (!isRecordingRef.current) startRecording(stream);
          if (motionStopTimerRef.current) clearTimeout(motionStopTimerRef.current);
          motionStopTimerRef.current = setTimeout(() => stopRecording(), MOTION_STOP_DELAY);
        }
      }
      prevPixelsRef.current = new Uint8ClampedArray(pixels);
    }, FRAME_INTERVAL);
  }, [startRecording, stopRecording]);

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

    // iOS 백그라운드 방지: 오디오를 극소 볼륨으로 출력 (페이지 살아있게)
    try {
      const keepAliveCtx = new AudioContext();
      const src = keepAliveCtx.createMediaStreamSource(stream);
      const gain = keepAliveCtx.createGain();
      gain.gain.value = 0.001; // 거의 무음이지만 0이 아님
      src.connect(gain);
      gain.connect(keepAliveCtx.destination);
      keepAliveCtx.resume().catch(() => {});
    } catch { /* ignore */ }

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
      // offer 전송 후 뷰어가 못 받았을 경우 기존 offer 재전송
      if (pc.signalingState === 'have-local-offer' && pc.localDescription) {
        ch.send({ type: 'broadcast', event: 'cam-offer', payload: { sdp: pc.localDescription } });
        return;
      }
      if (pc.signalingState !== 'stable') return;
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

    startMotionDetect(stream);
  }, [startMotionDetect]);

  const stopCamera = useCallback(() => {
    stopRecording();
    if (motionDetectIntervalRef.current) clearInterval(motionDetectIntervalRef.current);
    motionVideoRef.current?.pause();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    channelRef.current?.unsubscribe();
    wakeLockRef.current?.release();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setIsStreaming(false);
    setViewerConnected(false);
    setPhase('lock');
  }, [stopRecording]);

  // iOS 백그라운드에서 돌아왔을 때 MediaRecorder 재시작
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isRecordingRef.current) {
        // 돌아왔을 때 MediaRecorder가 죽어있으면 재시작
        if (mediaRecorderRef.current?.state === 'inactive' && localStreamRef.current) {
          startRecording(localStreamRef.current);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [startRecording]);

  // ── 잠금화면 ──────────────────────────────────────────
  if (phase === 'lock') {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-start select-none"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          paddingTop: 'max(5rem, env(safe-area-inset-top))',
        }}
      >
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

  // ── 활성화 (완전 검은 화면) ───────────────────────────
  return (
    <div className="fixed inset-0 bg-black select-none">
      {/* 완전 투명 중지 터치 영역 — 우하단 모서리 탭 */}
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
