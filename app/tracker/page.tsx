'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const CCTV_PIN = process.env.NEXT_PUBLIC_CCTV_PIN || '0609';
const MAX_RECORD_MS = 60 * 1000; // 60초마다 자동 저장 (파일 크기 제한 + 안정성)

function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
}

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function TrackerPage() {
  // phase: login → lock → pin → active
  const [phase, setPhase] = useState<'init' | 'login' | 'lock' | 'pin' | 'active'>('init');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  const [clockTaps, setClockTaps] = useState(0);
  const clockTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Active state
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadError, setUploadError] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceElapsed, setVoiceElapsed] = useState(0);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [pointCount, setPointCount] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lastLat, setLastLat] = useState<number | null>(null);
  const [lastLng, setLastLng] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState('GPS 연결 중...');
  const [waveform, setWaveform] = useState<number[]>(Array(20).fill(4));

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const noSleepVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string>(generateSessionId());
  const sessionStartRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const isSendingRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseRef = useRef<any>(null);
  const accessTokenRef = useRef<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waveformTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const isVoiceRecordingRef = useRef(false);
  const voiceStartRef = useRef<number>(0);
  const voiceMimeTypeRef = useRef<string>('');
  const voiceLastDataRef = useRef<number>(0);
  const [voiceError, setVoiceError] = useState('');

  // Clock
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

  // Check existing session on mount
  useEffect(() => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    supabaseRef.current = sb;
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        accessTokenRef.current = session.access_token;
        setPhase('lock');
      } else {
        setPhase('login');
      }
    });
    // Auto-refresh token
    sb.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) accessTokenRef.current = session.access_token;
    });
  }, []);

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const sb = supabaseRef.current!;
      const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
      if (error || !data.session) {
        setLoginError(error?.message || '로그인 실패');
      } else {
        accessTokenRef.current = data.session.access_token;
        setPhase('lock');
      }
    } catch (e) {
      setLoginError(String(e));
    } finally {
      setLoginLoading(false);
    }
  };

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as Navigator & {
          wakeLock: { request: (t: string) => Promise<WakeLockSentinel> };
        }).wakeLock.request('screen');
      }
    } catch { /* ignore */ }
  };

  // iOS Safari용 화면 잠금 방지: 1×1 canvas stream을 video로 재생
  const startNoSleep = () => {
    try {
      if (noSleepVideoRef.current) return;
      const canvas = document.createElement('canvas');
      canvas.width = 1; canvas.height = 1;
      const ctx2d = canvas.getContext('2d');
      if (ctx2d) ctx2d.fillRect(0, 0, 1, 1);
      const stream = canvas.captureStream(1);
      const vid = document.createElement('video');
      vid.setAttribute('playsinline', '');
      vid.setAttribute('loop', '');
      vid.muted = true;
      vid.srcObject = stream;
      vid.style.cssText = 'position:fixed;width:1px;height:1px;top:-1px;left:-1px;opacity:0.01;pointer-events:none;z-index:-1';
      document.body.appendChild(vid);
      noSleepVideoRef.current = vid;
      vid.play().catch(() => {});
    } catch { /* ignore */ }
  };

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
      if (next === CCTV_PIN) { setPhase('active'); setPin(''); startTracking(); }
      else { setPinError(true); setTimeout(() => { setPin(''); setPinError(false); }, 600); }
    }
  };

  const sendLocation = useCallback(async (pos: GeolocationPosition) => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    try {
      const { latitude: lat, longitude: lng, accuracy: acc, altitude, speed, heading } = pos.coords;
      if (lastPosRef.current) {
        const d = haversineKm(lastPosRef.current.lat, lastPosRef.current.lng, lat, lng);
        if (d < 10) setTotalDistance(prev => Math.round((prev + d) * 1000) / 1000);
      }
      lastPosRef.current = { lat, lng };
      currentPosRef.current = { lat, lng };
      setLastLat(lat); setLastLng(lng); setAccuracy(acc ?? null);
      setPointCount(c => c + 1); setStatusMsg('추적 중');

      const res = await fetch('/api/tracking/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessTokenRef.current}`,
        },
        body: JSON.stringify({ lat, lng, accuracy: acc, altitude, speed, heading, sessionId: sessionIdRef.current, recordedAt: new Date().toISOString() }),
      });
      if (!res.ok) { setUploadError(true); setTimeout(() => setUploadError(false), 3000); }
      else setUploadCount(c => c + 1);
    } catch (e) {
      console.error('sendLocation error', e);
    } finally {
      isSendingRef.current = false;
    }
  }, []);

  const startTracking = useCallback(async () => {
    await requestWakeLock();
    startNoSleep();
    requestFullscreen();
    sessionStartRef.current = Date.now();
    sessionIdRef.current = generateSessionId();

    // AudioContext keep-alive (완전 무음 — 소리 없이 AudioContext만 유지)
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      // 완전 무음 버퍼를 주기적으로 재생 (오실레이터 대신 → 삐 소리 없음)
      const playsilence = () => {
        if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); return; }
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate); // 0.1초 무음
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
      };
      ctx.resume().catch(() => {});
      audioKeepAliveRef.current = setInterval(playsilence, 5_000);
    } catch { /* ignore */ }

    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        sendLocation,
        (err) => setStatusMsg('GPS 오류: ' + err.message),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
    } else { setStatusMsg('GPS 미지원'); }

    const t = setInterval(() => setSessionElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [sendLocation]);

  useEffect(() => {
    const handle = () => {
      if (document.visibilityState === 'visible' && phase === 'active') {
        // AudioContext 즉시 재개
        audioCtxRef.current?.resume().catch(() => {});
        // WakeLock 재요청
        requestWakeLock();
        // noSleep 비디오 재생 재개
        noSleepVideoRef.current?.play().catch(() => {});
        // GPS 재시작
        if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = navigator.geolocation.watchPosition(
          sendLocation, (e) => console.error(e),
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [phase, sendLocation]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      wakeLockRef.current?.release();
      if (audioKeepAliveRef.current) clearInterval(audioKeepAliveRef.current);
      if (noSleepVideoRef.current) { noSleepVideoRef.current.pause(); noSleepVideoRef.current.remove(); }
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  const uploadVoiceMemo = useCallback(async (blob: Blob, durationSec: number, actualMimeType?: string) => {
    try {
      const ext = (actualMimeType || '').includes('mp4') ? 'mp4' : 'webm';
      const form = new FormData();
      form.append('file', blob, `memo.${ext}`);
      if (currentPosRef.current) {
        form.append('lat', String(currentPosRef.current.lat));
        form.append('lng', String(currentPosRef.current.lng));
      }
      form.append('sessionId', sessionIdRef.current);
      form.append('duration', String(durationSec));

      const res = await fetch('/api/tracking/voice', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessTokenRef.current}` },
        body: form,
      });
      if (!res.ok) { setUploadError(true); setTimeout(() => setUploadError(false), 3000); }
      else setUploadCount(c => c + 1);
    } catch (e) { console.error('voice upload error', e); }
  }, []);

  const stopVoiceRecording = useCallback(async () => {
    isVoiceRecordingRef.current = false;
    setIsVoiceRecording(false);
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    if (voiceMaxTimerRef.current) clearTimeout(voiceMaxTimerRef.current);
    if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);

    const mr = mediaRecorderRef.current;
    if (!mr) return;

    if (mr.state === 'recording') {
      mr.stop(); // onstop에서 업로드 처리
    } else if (mr.state === 'inactive' && voiceChunksRef.current.length > 0) {
      // iOS: recorder가 이미 멈췄지만 청크 남아있는 경우
      const chunks = [...voiceChunksRef.current];
      voiceChunksRef.current = [];
      const mimeType = voiceMimeTypeRef.current || 'audio/mp4';
      const durationSec = voiceStartRef.current ? Math.round((Date.now() - voiceStartRef.current) / 1000) : 0;
      uploadVoiceMemo(new Blob(chunks, { type: mimeType }), durationSec, mimeType);
      setVoiceElapsed(0); setWaveform(Array(20).fill(4));
    }
  }, [uploadVoiceMemo]);

  // 60초 자동 저장 후 새 녹음 재시작 (연속 녹음 유지)
  const restartVoiceRecording = useCallback(async () => {
    if (!isVoiceRecordingRef.current) return;
    const mr = mediaRecorderRef.current;
    if (mr?.state === 'recording') mr.stop(); // onstop이 upload + 재시작 처리
  }, []);

  const startVoiceRecording = useCallback(async (autoRestart = false) => {
    if (!autoRestart && isVoiceRecordingRef.current) { stopVoiceRecording(); return; }
    // 이전 타이머 정리
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    if (voiceMaxTimerRef.current) clearTimeout(voiceMaxTimerRef.current);
    if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
    setVoiceError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      voiceChunksRef.current = [];
      const recStart = Date.now();
      voiceStartRef.current = recStart;
      isVoiceRecordingRef.current = true;
      setIsVoiceRecording(true);
      setVoiceElapsed(0);

      const actualMimeType = mr.mimeType || mimeType || 'audio/mp4';
      voiceMimeTypeRef.current = actualMimeType;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data);
      };

      mr.onerror = () => {
        setVoiceError('녹음 오류 — 다시 탭하세요');
        isVoiceRecordingRef.current = false;
        setIsVoiceRecording(false);
        if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
        if (voiceMaxTimerRef.current) clearTimeout(voiceMaxTimerRef.current);
        if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
        stream.getTracks().forEach(t => t.stop());
        setVoiceElapsed(0); setWaveform(Array(20).fill(4));
      };

      mr.onstop = () => {
        const durationSec = Math.round((Date.now() - recStart) / 1000);
        const chunks = [...voiceChunksRef.current];
        voiceChunksRef.current = [];
        stream.getTracks().forEach(t => t.stop());
        if (chunks.length > 0) {
          uploadVoiceMemo(new Blob(chunks, { type: actualMimeType }), durationSec, actualMimeType);
        }
        // 연속 녹음: 아직 recording 상태이면 자동 재시작
        if (isVoiceRecordingRef.current) {
          isVoiceRecordingRef.current = false; // startVoiceRecording 토글 방지
          setVoiceElapsed(0);
          setTimeout(() => startVoiceRecording(true), 300);
        } else {
          setVoiceElapsed(0); setWaveform(Array(20).fill(4));
        }
      };

      mr.start(1000); // 1초 청크 (500ms보다 안정적)
      voiceTimerRef.current = setInterval(() => setVoiceElapsed(Math.round((Date.now() - recStart) / 1000)), 1000);
      // 60초마다 자동 분할 저장
      voiceMaxTimerRef.current = setTimeout(restartVoiceRecording, MAX_RECORD_MS);
      waveformTimerRef.current = setInterval(() => setWaveform(Array(20).fill(0).map(() => Math.floor(Math.random() * 24) + 4)), 150);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setVoiceError(msg.includes('Permission') || msg.includes('allowed') ? '마이크 권한 허용 필요' : '마이크 오류');
      console.error('voice start error', e);
    }
  }, [stopVoiceRecording, uploadVoiceMemo, restartVoiceRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── init ──────────────────────────────────────────────
  if (phase === 'init') {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#080e1a' }}>
        <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
      </div>
    );
  }

  // ── 로그인 ────────────────────────────────────────────
  if (phase === 'login') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center px-6 gap-4"
        style={{ background: 'linear-gradient(180deg,#1c2b4a,#0a1628)', fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif' }}>
        <div className="text-white text-2xl font-light mb-2">로그인</div>
        <input
          type="email" placeholder="이메일" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
          className="w-full max-w-sm px-4 py-3 rounded-xl bg-white/10 text-white placeholder-white/30 border border-white/20 outline-none text-sm"
          autoComplete="email"
        />
        <input
          type="password" placeholder="비밀번호" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          className="w-full max-w-sm px-4 py-3 rounded-xl bg-white/10 text-white placeholder-white/30 border border-white/20 outline-none text-sm"
          autoComplete="current-password"
        />
        {loginError && <div className="text-red-400 text-xs">{loginError}</div>}
        <button onClick={handleLogin} disabled={loginLoading}
          className="w-full max-w-sm py-3 rounded-xl bg-cyan-500 text-white font-medium text-sm active:bg-cyan-600 disabled:opacity-50">
          {loginLoading ? '로그인 중...' : '시작하기'}
        </button>
      </div>
    );
  }

  // ── 잠금화면 ──────────────────────────────────────────
  if (phase === 'lock') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-start select-none"
        style={{ fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', background: 'linear-gradient(180deg,#1c2b4a 0%,#0d1f3c 50%,#0a1628 100%)', paddingTop: 'max(5rem,env(safe-area-inset-top))' }}>
        <div className="absolute top-0 left-0 right-0 flex justify-between items-center px-6 text-white text-xs font-semibold"
          style={{ paddingTop: 'max(0.75rem,env(safe-area-inset-top))' }}>
          <span>{time.slice(0,5)}</span>
          <div className="flex items-center gap-1"><span>●●●</span><span>WiFi</span><span>🔋</span></div>
        </div>
        <button onClick={handleClockTap} className="text-white text-center mt-8 active:opacity-70 transition-opacity">
          <div className="text-7xl font-thin tracking-tight">{time}</div>
          <div className="text-lg font-light opacity-80 mt-2">{date}</div>
        </button>
        <div className="absolute bottom-32 left-0 right-0 grid grid-cols-4 gap-4 px-8">
          {['🌤️','🗓️','🗺️','🔍','📷','💬','⚙️','📧','🎵','📰','🏦','📱'].map((icon, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl">{icon}</div>
              <span className="text-white text-xs opacity-60">App</span>
            </div>
          ))}
        </div>
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-5" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {['📞','📩','🌐','📸'].map((icon, i) => (
            <div key={i} className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center text-2xl">{icon}</div>
          ))}
        </div>
      </div>
    );
  }

  // ── PIN ───────────────────────────────────────────────
  if (phase === 'pin') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center select-none"
        style={{ fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', background: 'linear-gradient(180deg,#1c2b4a,#0a1628)' }}>
        <div className="text-white text-center mb-8">
          <div className="text-lg font-light opacity-80">암호 입력</div>
          <div className={`flex gap-4 justify-center mt-4 ${pinError ? 'animate-pulse' : ''}`}>
            {[0,1,2,3].map(i => <div key={i} className={`w-4 h-4 rounded-full border-2 border-white/60 ${i < pin.length ? 'bg-white' : 'bg-transparent'}`} />)}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-white">
          {['1','2','3','4','5','6','7','8','9','','0','←'].map((k, i) => (
            <button key={i} onClick={() => k && handlePinKey(k)}
              className={`w-20 h-20 rounded-full text-2xl font-light active:bg-white/20 transition-colors ${k==='' ? 'invisible' : 'bg-white/10 hover:bg-white/20'}`}>{k}</button>
          ))}
        </div>
        <button onClick={() => setPhase('lock')} className="mt-8 text-white/50 text-sm">취소</button>
      </div>
    );
  }

  // ── 트래킹 활성 ───────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col select-none"
      style={{ fontFamily: '-apple-system,BlinkMacSystemFont,sans-serif', background: '#080e1a', color: '#fff', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around px-4 py-3 border-b border-white/10">
        {[['세션', formatTime(sessionElapsed), 'text-cyan-400'], ['거리', `${totalDistance.toFixed(2)}km`, 'text-green-400'], ['포인트', String(pointCount), 'text-white'],
          ['정확도', accuracy !== null ? `±${Math.round(accuracy)}m` : '--', accuracy !== null && accuracy < 20 ? 'text-green-400' : accuracy !== null && accuracy < 50 ? 'text-yellow-400' : 'text-red-400']
        ].map(([label, val, cls]) => (
          <div key={label} className="text-center">
            <div className="text-xs text-white/40">{label}</div>
            <div className={`text-sm font-mono font-bold ${cls}`}>{val}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusMsg==='추적 중' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
          <span className="text-xs text-white/60">{statusMsg}</span>
        </div>
        {lastLat !== null && lastLng !== null ? (
          <div className="text-center">
            <div className="text-xs text-white/30 mb-1">현재 위치</div>
            <div className="font-mono text-sm text-cyan-300">{lastLat.toFixed(6)}</div>
            <div className="font-mono text-sm text-cyan-300">{lastLng.toFixed(6)}</div>
          </div>
        ) : <div className="text-white/20 text-sm">GPS 신호 대기 중...</div>}

        <div className="mt-8 flex flex-col items-center gap-3">
          {isVoiceRecording && (
            <div className="flex items-end gap-[3px] h-10">
              {waveform.map((h, i) => <div key={i} className="w-1.5 bg-red-400 rounded-full transition-all duration-100" style={{ height: `${h}px` }} />)}
            </div>
          )}
          {isVoiceRecording && <div className="font-mono text-red-400 text-sm">{formatTime(voiceElapsed)}</div>}
          <button onClick={() => startVoiceRecording()}
            className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl transition-all active:scale-95 ${isVoiceRecording ? 'bg-red-500/30 border-2 border-red-400 animate-pulse' : 'bg-white/10 border-2 border-white/20 active:bg-white/20'}`}>
            {isVoiceRecording ? '⏹' : '🎙'}
          </button>
          <div className="text-xs text-white/30">{isVoiceRecording ? '탭하여 중지 (60초마다 자동저장)' : '탭하여 녹음'}</div>
          {voiceError && <div className="text-xs text-red-400 text-center mt-1">{voiceError}</div>}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2" style={{ paddingBottom: 'max(0.5rem,env(safe-area-inset-bottom))' }}>
        <div className={`text-[11px] font-mono ${uploadError ? 'text-red-400' : 'text-white/20'}`}>
          {uploadError ? 'ERR' : uploadCount > 0 ? `↑${uploadCount}` : '●'}
        </div>
        <button onClick={() => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); wakeLockRef.current?.release(); setPhase('lock'); }}
          className="opacity-0 w-8 h-8" aria-hidden="true" />
      </div>
    </div>
  );
}
