'use client';

/**
 * CAM1 - 계속 녹화 카메라 (아이폰 잠금화면 위장)
 * 활성화: 시계 3번 빠르게 탭 → PIN 입력
 * 기능: WebRTC 스트리밍 + 5분 단위 NAS 자동 녹화
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const CCTV_PIN = process.env.NEXT_PUBLIC_CCTV_PIN || '0609';
const CHANNEL = 'cctv-cam1';
const CAM_ID = 'cam1';
const CHUNK_MS = 5 * 60 * 1000; // 5분 청크
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export default function Cam1Page() {
  const [phase, setPhase] = useState<'lock' | 'pin' | 'active'>('lock');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
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
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);

  // 시계 업데이트
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

  // 청크 저장 (NAS 업로드)
  const flushChunk = useCallback(async (blob: Blob, ts: number) => {
    if (blob.size < 1000) return;
    try {
      const filename = `${CAM_ID}_${ts}.webm`;
      const form = new FormData();
      form.append('file', blob, filename);
      form.append('filename', filename);
      await fetch('/api/cctv/record', { method: 'POST', body: form });
    } catch { /* ignore */ }
  }, []);

  // MediaRecorder 한 세션 시작 (CHUNK_MS 후 자동 rotate)
  const startChunk = useCallback((stream: MediaStream) => {
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';
    const mr = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = mr;
    recChunksRef.current = [];
    const startTs = Date.now();

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) recChunksRef.current.push(e.data);
    };

    mr.onstop = () => {
      const blob = new Blob(recChunksRef.current, { type: 'video/webm' });
      recChunksRef.current = [];
      flushChunk(blob, startTs);
      // 아직 녹화 중이면 다음 청크 시작
      if (isRecordingRef.current) startChunk(stream);
    };

    mr.start(5000); // 5초마다 ondataavailable 트리거 (버퍼링)

    // CHUNK_MS 후 자동 stop → onstop에서 재시작
    chunkTimerRef.current = setTimeout(() => {
      if (mr.state === 'recording') mr.stop();
    }, CHUNK_MS);
  }, [flushChunk]);

  // 녹화 시작
  const startRecording = useCallback((stream: MediaStream) => {
    isRecordingRef.current = true;
    setIsRecording(true);
    startChunk(stream);
  }, [startChunk]);

  // 녹화 중지
  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // 시계 탭 (3번 → PIN)
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

  // 카메라 시작
  const startCamera = useCallback(async () => {
    await requestWakeLock();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    localStreamRef.current = stream;

    // WebRTC
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

    // 즉시 연속 녹화 시작
    startRecording(stream);
  }, [startRecording]);

  const stopCamera = useCallback(() => {
    stopRecording();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    channelRef.current?.unsubscribe();
    wakeLockRef.current?.release();
    setIsStreaming(false);
    setViewerConnected(false);
    setPhase('lock');
  }, [stopRecording]);

  // ── 잠금화면 ──────────────────────────────────────────
  if (phase === 'lock') {
    return (
      <div
        className="fixed inset-0 bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 flex flex-col items-center justify-start pt-20 select-none"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
      >
        <div className="absolute top-0 left-0 right-0 flex justify-between items-center px-6 pt-3 text-white text-xs font-semibold">
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

        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-5">
          {['📞','📩','🌐','🎵'].map((icon, i) => (
            <div key={i} className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl">{icon}</div>
          ))}
        </div>

        {isStreaming && <div className="absolute top-3 right-20 w-2 h-2 rounded-full bg-green-400" />}
        {isRecording && <div className="absolute top-3 right-24 w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
      </div>
    );
  }

  // ── PIN 입력 ──────────────────────────────────────────
  if (phase === 'pin') {
    return (
      <div
        className="fixed inset-0 bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 flex flex-col items-center justify-center select-none"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
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

  // ── 활성화 (검은 화면 + 상태 표시) ───────────────────
  return (
    <div
      className="fixed inset-0 bg-black flex flex-col items-center justify-center select-none"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-400' : 'bg-gray-500'}`} />
          {isRecording && <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
          <span className="text-white/40 text-xs">{viewerConnected ? '●' : '○'}</span>
        </div>
        <span className="text-white/30 text-xs">{time}</span>
      </div>

      <div className="text-white/10 text-xs text-center">
        <div className="text-4xl mb-2 opacity-20">📷</div>
      </div>

      <button onClick={stopCamera} className="absolute bottom-8 px-6 py-2 bg-white/10 rounded-full text-white/40 text-sm">
        중지
      </button>
    </div>
  );
}
