'use client';

/**
 * CCTV 카메라 페이지 - 아이폰 잠금화면 위장
 * 활성화: 시계 3번 빠르게 탭 → PIN 입력
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const CCTV_PIN = process.env.NEXT_PUBLIC_CCTV_PIN || '0609';
const CHANNEL = 'cctv-room';
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

  // 화면 켜짐 유지 (Wake Lock)
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock.request('screen');
      }
    } catch { /* ignore */ }
  };

  // 시계 탭: 3번 빠르게 탭하면 PIN 입력창
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

  // PIN 입력
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
      if (candidate) {
        channel.send({ type: 'broadcast', event: 'cam-ice', payload: { candidate: candidate.toJSON() } });
      }
    };

    pc.onconnectionstatechange = () => {
      setViewerConnected(pc.connectionState === 'connected');
    };

    // 뷰어가 요청(request)을 보내면 offer 생성
    channel.on('broadcast', { event: 'viewer-request' }, async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      channel.send({ type: 'broadcast', event: 'cam-offer', payload: { sdp: pc.localDescription } });
    });

    // 뷰어 answer 수신
    channel.on('broadcast', { event: 'viewer-answer' }, async ({ payload }) => {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      }
    });

    // 뷰어 ICE 후보 수신
    channel.on('broadcast', { event: 'viewer-ice' }, async ({ payload }) => {
      try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { /* ignore */ }
    });

    await channel.subscribe();
    setIsStreaming(true);
    // 초기 offer 즉시 생성 (뷰어가 이미 대기 중일 수 있으므로)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    channel.send({ type: 'broadcast', event: 'cam-offer', payload: { sdp: pc.localDescription } });
  }, []);

  // 스톱
  const stopCamera = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    channelRef.current?.unsubscribe();
    wakeLockRef.current?.release();
    setIsStreaming(false);
    setViewerConnected(false);
    setPhase('lock');
  };

  // ── 잠금화면 렌더 ─────────────────────────────────────
  if (phase === 'lock') {
    return (
      <div
        className="fixed inset-0 bg-gradient-to-b from-slate-800 via-slate-700 to-slate-900 flex flex-col items-center justify-start pt-20 select-none"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
      >
        {/* 상태바 */}
        <div className="absolute top-0 left-0 right-0 flex justify-between items-center px-6 pt-3 text-white text-xs font-semibold">
          <span>{time.slice(0,5)}</span>
          <div className="flex items-center gap-1">
            <span>●●●</span>
            <span>WiFi</span>
            <span>🔋</span>
          </div>
        </div>

        {/* 시계 — 3번 탭 활성화 */}
        <button
          onClick={handleClockTap}
          className="text-white text-center mt-8 active:opacity-70 transition-opacity"
        >
          <div className="text-7xl font-thin tracking-tight">{time}</div>
          <div className="text-lg font-light opacity-80 mt-2">{date}</div>
        </button>

        {/* 앱 아이콘 그리드 (가짜) */}
        <div className="absolute bottom-32 left-0 right-0 grid grid-cols-4 gap-4 px-8">
          {['📷','📱','🎵','🗺️','📸','🔍','⚙️','🗓️','💬','📧','🌐','🏦'].map((icon, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl">
                {icon}
              </div>
              <span className="text-white text-xs opacity-60 text-shadow">App</span>
            </div>
          ))}
        </div>

        {/* 하단 독 */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-5">
          {['📞','📩','🌐','🎵'].map((icon, i) => (
            <div key={i} className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl">
              {icon}
            </div>
          ))}
        </div>

        {/* 활성화된 경우 표시 (아주 작은 점) */}
        {isStreaming && (
          <div className="absolute top-3 right-20 w-2 h-2 rounded-full bg-green-400" />
        )}
      </div>
    );
  }

  // ── PIN 입력 ─────────────────────────────────────────
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

        {/* 숫자 패드 */}
        <div className="grid grid-cols-3 gap-3 text-white">
          {['1','2','3','4','5','6','7','8','9','','0','←'].map((k, i) => (
            <button
              key={i}
              onClick={() => k && handlePinKey(k)}
              className={`w-20 h-20 rounded-full text-2xl font-light active:bg-white/20 transition-colors ${
                k === '' ? 'invisible' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <button onClick={() => setPhase('lock')} className="mt-8 text-white/50 text-sm">취소</button>
      </div>
    );
  }

  // ── 활성화 (카메라 실행 중) ──────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black flex flex-col items-center justify-center select-none"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      {/* 상태 (최소화, 눈에 안 띄게) */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-400' : 'bg-gray-500'}`} />
          <span className="text-white/40 text-xs">{viewerConnected ? '●' : '○'}</span>
        </div>
        <span className="text-white/30 text-xs">{time}</span>
      </div>

      {/* 화면을 검게 유지 (배터리 절약) */}
      <div className="text-white/10 text-xs text-center">
        <div className="text-4xl mb-2 opacity-20">📷</div>
      </div>

      {/* 종료 버튼 (작게) */}
      <button
        onClick={stopCamera}
        className="absolute bottom-8 px-6 py-2 bg-white/10 rounded-full text-white/40 text-sm"
      >
        중지
      </button>
    </div>
  );
}
