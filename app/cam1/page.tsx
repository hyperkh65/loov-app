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
const CHUNK_MS = 5 * 60 * 1000; // 5분 청크 (연속 녹화처럼 보이도록)
// TURN 서버: 모바일 LTE/5G 대칭형 NAT(CGNAT) 환경에서 필수
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
  const [showStopPin, setShowStopPin] = useState(false);
  const [stopPin, setStopPin] = useState('');
  const [stopPinError, setStopPinError] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const clockTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const noSleepVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDataRef = useRef<number>(0); // 마지막 ondataavailable 시각

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

  // iOS Safari용 화면 잠금 방지: 1×1 canvas stream을 video로 재생
  const startNoSleep = () => {
    try {
      if (noSleepVideoRef.current) return; // 이미 실행 중
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

  const stopNoSleep = () => {
    if (noSleepVideoRef.current) {
      noSleepVideoRef.current.pause();
      noSleepVideoRef.current.remove();
      noSleepVideoRef.current = null;
    }
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
    lastDataRef.current = Date.now();

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recChunksRef.current.push(e.data);
        lastDataRef.current = Date.now();
      }
    };
    mr.onstop = () => {
      const chunks = [...recChunksRef.current];
      recChunksRef.current = [];
      if (chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        flushChunk(blob, startTs, ext);
      }
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
    startNoSleep();
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

    // iOS 백그라운드 방지: 무음 버퍼 재생 (오실레이터 사용 시 삐 소리 발생)
    try {
      const keepAliveCtx = new AudioContext();
      audioCtxRef.current = keepAliveCtx;
      keepAliveCtx.resume().catch(() => {});
      const playsilence = () => {
        if (keepAliveCtx.state === 'suspended') { keepAliveCtx.resume().catch(() => {}); return; }
        const buf = keepAliveCtx.createBuffer(1, keepAliveCtx.sampleRate * 0.1, keepAliveCtx.sampleRate);
        const src = keepAliveCtx.createBufferSource();
        src.buffer = buf;
        src.connect(keepAliveCtx.destination);
        src.start();
      };
      audioKeepAliveRef.current = setInterval(playsilence, 5_000);
    } catch { /* ignore */ }

    // 스트림 트랙 ended 감지 → 카메라 재시작 (iOS가 강제 종료한 경우)
    stream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        console.warn('[cam1] track ended, restarting camera');
        if (isRecordingRef.current) {
          startCamera().catch(console.error);
        }
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

    // Supabase 채널 heartbeat (25초마다 ping → WebSocket 연결 유지)
    heartbeatRef.current = setInterval(() => {
      ch.send({ type: 'broadcast', event: 'cam-ping', payload: { ts: Date.now() } });
    }, 25_000);

    startRecording(stream);
  }, [startRecording]);

  const stopCamera = useCallback(() => {
    stopRecording();
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (audioKeepAliveRef.current) clearInterval(audioKeepAliveRef.current);
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    channelRef.current?.unsubscribe();
    wakeLockRef.current?.release();
    stopNoSleep();
    audioCtxRef.current?.close().catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setIsStreaming(false);
    setViewerConnected(false);
    setPhase('lock');
  }, [stopRecording]);

  // iOS 백그라운드에서 돌아왔을 때 재시작
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isRecordingRef.current) {
        // AudioContext 재개
        audioCtxRef.current?.resume().catch(() => {});
        // WakeLock 재요청
        requestWakeLock();
        // noSleep 비디오 재생 재개
        noSleepVideoRef.current?.play().catch(() => {});
        // Supabase 채널 재구독 (WebSocket 끊겼을 수 있음)
        const ch = channelRef.current;
        if (ch) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const state = (ch as any).state ?? (ch as any).socket?.connectionState?.();
            if (state === 'closed' || state === 'errored') {
              ch.subscribe();
            }
          } catch { ch.subscribe(); }
        }
        // MediaRecorder 재시작
        if (mediaRecorderRef.current?.state === 'inactive' && localStreamRef.current) {
          // 스트림 트랙이 살아있는지 확인
          const alive = localStreamRef.current.getTracks().every(t => t.readyState === 'live');
          if (alive) startChunk(localStreamRef.current);
          else startCamera().catch(console.error); // 트랙 죽었으면 전체 재시작
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [startChunk, startCamera]);

  // 녹화 watchdog: 15초마다 체크
  useEffect(() => {
    watchdogRef.current = setInterval(() => {
      if (!isRecordingRef.current) return;

      const stream = localStreamRef.current;
      const recState = mediaRecorderRef.current?.state;
      const tracksAlive = stream?.getTracks().every(t => t.readyState === 'live') ?? false;
      const dataSilent = Date.now() - lastDataRef.current > 20_000; // 20초 데이터 없음

      if (!tracksAlive) {
        // 스트림 트랙 자체가 죽음 → 카메라 전체 재시작
        console.warn('[cam1] watchdog: stream tracks dead, restarting camera');
        startCamera().catch(console.error);
      } else if (recState === 'inactive' || dataSilent) {
        // Recorder만 죽음 → chunk 재시작
        console.warn('[cam1] watchdog: recorder dead/silent, restarting chunk');
        if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
        startChunk(stream!);
      }
    }, 15_000);
    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
    };
  }, [startChunk, startCamera]);

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

  // ── 길게 누르기 핸들러 ────────────────────────────────
  const handleLongPressStart = () => {
    let progress = 0;
    longPressTimerRef.current = setInterval(() => {
      progress += 10;
      setLongPressProgress(progress);
      if (progress >= 100) {
        if (longPressTimerRef.current) clearInterval(longPressTimerRef.current);
        setLongPressProgress(0);
        setShowStopPin(true);
      }
    }, 1000); // 10초 = 1초마다 10% 증가
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) clearInterval(longPressTimerRef.current);
    setLongPressProgress(0);
  };

  const handleStopPinKey = (k: string) => {
    if (k === '←') { setStopPin(p => p.slice(0, -1)); setStopPinError(false); return; }
    const next = stopPin + k;
    setStopPin(next);
    if (next.length === 4) {
      if (next === CCTV_PIN) {
        setShowStopPin(false);
        setStopPin('');
        stopCamera();
      } else {
        setStopPinError(true);
        setTimeout(() => { setStopPin(''); setStopPinError(false); }, 600);
      }
    }
  };

  // ── 활성화: 이메일 위장 UI ────────────────────────────
  const FAKE_EMAILS = [
    { from: '네이버 알림', subject: '로그인 보안 알림이 도착했습니다', preview: '새로운 기기에서 로그인이 감지되었습니다. 본인이 아니라면...', time: '오전 9:12', unread: true },
    { from: '카카오페이', subject: '[카카오페이] 송금 완료 안내', preview: '홍길동님께 30,000원이 송금 완료되었습니다.', time: '어제', unread: false },
    { from: '쿠팡', subject: '주문하신 상품이 출고되었습니다', preview: '[주문번호 3847291] 오늘 배송 예정입니다. 배송 조회...', time: '어제', unread: false },
    { from: '구글', subject: 'Security alert for your Google Account', preview: 'Your account was just signed in from a new device.', time: '월요일', unread: false },
    { from: '토스', subject: '이번 달 소비 리포트가 도착했어요', preview: '4월 지출이 지난달보다 12% 줄었어요 🎉 자세히 보기', time: '일요일', unread: true },
    { from: '삼성카드', subject: '[삼성카드] 4월 결제 예정 안내', preview: '4월 18일 결제 예정금액: 284,000원 / 청구서 확인...', time: '토요일', unread: false },
    { from: 'GitHub', subject: '[GitHub] A new public key was added', preview: 'Hey, a new public key was added to your account.', time: '4/8', unread: false },
    { from: '배달의민족', subject: '리뷰 감사해요! 포인트 100P 지급', preview: '소중한 리뷰 작성에 감사드립니다. 포인트가 적립되었습니다.', time: '4/7', unread: false },
  ];

  // ── 종료 PIN 입력 팝업 ────────────────────────────────
  if (showStopPin) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center select-none"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', background: 'rgba(0,0,0,0.85)' }}
      >
        <div className="text-white text-center mb-8">
          <div className="text-lg font-light opacity-80">암호 입력</div>
          <div className={`flex gap-4 justify-center mt-4 ${stopPinError ? 'animate-pulse' : ''}`}>
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 border-white/60 ${i < stopPin.length ? 'bg-white' : 'bg-transparent'}`} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-white">
          {['1','2','3','4','5','6','7','8','9','','0','←'].map((k, i) => (
            <button key={i} onClick={() => k && handleStopPinKey(k)}
              className={`w-20 h-20 rounded-full text-2xl font-light active:bg-white/20 transition-colors ${k === '' ? 'invisible' : 'bg-white/10 hover:bg-white/20'}`}>
              {k}
            </button>
          ))}
        </div>
        <button onClick={() => { setShowStopPin(false); setStopPin(''); }} className="mt-8 text-white/50 text-sm">취소</button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-white overflow-hidden select-none"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
      onMouseDown={handleLongPressStart}
      onMouseUp={handleLongPressEnd}
      onMouseLeave={handleLongPressEnd}
      onTouchStart={handleLongPressStart}
      onTouchEnd={handleLongPressEnd}
      onTouchCancel={handleLongPressEnd}
    >
      {/* 길게 누르기 진행 바 (투명하게, 아주 얇게) */}
      {longPressProgress > 0 && (
        <div className="absolute top-0 left-0 right-0 h-0.5 z-50">
          <div className="h-full bg-blue-400/40 transition-all" style={{ width: `${longPressProgress}%` }} />
        </div>
      )}

      {/* 상단 헤더 */}
      <div className="flex items-center px-4 py-3 border-b border-gray-200"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="text-xl font-semibold text-gray-900 flex-1">받은편지함</div>
        <div className="flex items-center gap-3 text-blue-500">
          <span className="text-sm">편집</span>
          <span className="text-2xl">✏️</span>
        </div>
      </div>

      {/* 검색 바 */}
      <div className="px-4 py-2 bg-gray-50">
        <div className="flex items-center bg-gray-200 rounded-xl px-3 py-2 gap-2">
          <span className="text-gray-400 text-sm">🔍</span>
          <span className="text-gray-400 text-sm">검색</span>
        </div>
      </div>

      {/* 이메일 목록 */}
      <div className="overflow-y-auto" style={{ height: 'calc(100dvh - 110px)' }}>
        {FAKE_EMAILS.map((email, i) => (
          <div key={i} className="flex items-start px-4 py-3 border-b border-gray-100 active:bg-gray-50">
            {/* 읽음/안읽음 표시 */}
            <div className="mt-2 mr-3 flex-shrink-0">
              {email.unread
                ? <div className="w-2 h-2 rounded-full bg-blue-500" />
                : <div className="w-2 h-2" />}
            </div>
            {/* 아바타 */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold mr-3 flex-shrink-0"
              style={{ background: `hsl(${i * 45},60%,55%)` }}>
              {email.from[0]}
            </div>
            {/* 내용 */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline">
                <span className={`text-sm ${email.unread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{email.from}</span>
                <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{email.time}</span>
              </div>
              <div className={`text-sm truncate ${email.unread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{email.subject}</div>
              <div className="text-xs text-gray-400 truncate mt-0.5">{email.preview}</div>
            </div>
            <span className="text-gray-300 ml-2 flex-shrink-0">›</span>
          </div>
        ))}
      </div>

      {/* 우하단: 업로드 상태 (아주 작게) */}
      <div
        className="absolute text-[9px] font-mono"
        style={{
          bottom: 'max(1rem, env(safe-area-inset-bottom))',
          right: '0.75rem',
          color: uploadError ? 'rgba(239,68,68,0.4)' : 'rgba(0,0,0,0.1)',
        }}
      >
        {uploadError ? '!' : uploadCount > 0 ? `${uploadCount}` : ''}
      </div>
    </div>
  );
}
