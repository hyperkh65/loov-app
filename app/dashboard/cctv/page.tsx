'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const CHANNELS = {
  'cctv-room': { label: '/cctv', desc: '스트리밍 전용' },
  'cctv-cam1': { label: '/cam1', desc: '계속 녹화' },
  'cctv-cam2': { label: '/cam2', desc: '모션 녹화' },
} as const;
type CamChannel = keyof typeof CHANNELS;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface Recording {
  name: string;
  size: number;
  modTime: number;
}

export default function CCTVViewerPage() {
  const [selectedCam, setSelectedCam] = useState<CamChannel>('cctv-cam1');
  const [status, setStatus] = useState<'idle' | 'waiting' | 'connected' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  // 녹화
  const [recording, setRecording] = useState(false);
  const [autoRecord, setAutoRecord] = useState(false);
  const [recDuration, setRecDuration] = useState(0);

  // 감지
  const [motionDetect, setMotionDetect] = useState(false);
  const [audioDetect, setAudioDetect] = useState(false);
  const [motionAlert, setMotionAlert] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [motionLevel, setMotionLevel] = useState(0);

  // 화면 변환
  const [rotation, setRotation] = useState(0); // 0 / 90 / 180 / 270
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 녹화 목록
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [showRecordings, setShowRecordings] = useState(false);
  const [recFilter, setRecFilter] = useState<'all' | 'cam1' | 'cam2' | 'cctv'>('all');
  const [selectedDate, setSelectedDate] = useState(''); // 'YYYY-MM-DD' 형식
  const [playbackRate, setPlaybackRate] = useState(1); // 재생 속도

  // 재생 모달
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [playName, setPlayName] = useState('');
  const [playLoading, setPlayLoading] = useState(false);
  const playVideoRef = useRef<HTMLVideoElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const motionAlertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── WebRTC 연결 ───────────────────────────────────────
  const connect = useCallback(async () => {
    setStatus('waiting');
    setStatusMsg('카메라 연결 대기중...');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    supabaseRef.current = supabase;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    const channel = selectedCam;

    pc.ontrack = ({ streams }) => {
      if (videoRef.current && streams[0]) {
        videoRef.current.srcObject = streams[0];
        setStatus('connected');
        setStatusMsg('🟢 연결됨');
        setupAudioAnalyser(streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setStatus('idle');
        setStatusMsg('카메라 연결 끊김 — 재연결 중...');
        stopRecording();
        // 2초 후 자동 재연결
        setTimeout(() => {
          if (pcRef.current === pc) connect();
        }, 2000);
      }
    };

    const sbChannel = supabase.channel(channel, { config: { broadcast: { self: false } } });
    channelRef.current = sbChannel;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        sbChannel.send({ type: 'broadcast', event: 'viewer-ice', payload: { candidate: candidate.toJSON() } });
      }
    };

    // 카메라 offer 수신 → answer 생성
    sbChannel.on('broadcast', { event: 'cam-offer' }, async ({ payload }) => {
      if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sbChannel.send({ type: 'broadcast', event: 'viewer-answer', payload: { sdp: pc.localDescription } });
        setStatusMsg('응답 전송 완료, 연결 중...');
      }
    });

    // 카메라 ICE 후보 수신
    sbChannel.on('broadcast', { event: 'cam-ice' }, async ({ payload }) => {
      try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { /* ignore */ }
    });

    await sbChannel.subscribe();
    // 카메라에 연결 요청 (최초 + 3초마다 재시도 — 카메라가 늦게 켜져도 연결됨)
    const sendRequest = () => {
      if (pcRef.current?.connectionState !== 'connected') {
        sbChannel.send({ type: 'broadcast', event: 'viewer-request', payload: {} });
      } else {
        if (retryTimerRef.current) clearInterval(retryTimerRef.current);
      }
    };
    sendRequest();
    retryTimerRef.current = setInterval(sendRequest, 3000);
  }, [selectedCam]);

  const disconnect = useCallback(() => {
    stopRecording();
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    pcRef.current?.close();
    channelRef.current?.unsubscribe();
    audioCtxRef.current?.close();
    cancelAnimationFrame(animFrameRef.current);
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
    setStatusMsg('');
    setAudioLevel(0);
    setMotionLevel(0);
  }, []);

  // ── 오디오 분석 ───────────────────────────────────────
  const setupAudioAnalyser = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch { /* ignore */ }
  };

  // ── 모션 + 오디오 감지 루프 ───────────────────────────
  useEffect(() => {
    const loop = () => {
      animFrameRef.current = requestAnimationFrame(loop);

      // 오디오 레벨
      if (analyserRef.current && audioDetect) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const level = Math.min(100, Math.round(avg * 2));
        setAudioLevel(level);
        if (level > 40 && autoRecord && !recording) startRecording();
      }

      // 모션 감지
      if (motionDetect && videoRef.current && canvasRef.current && status === 'connected') {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx || video.readyState < 2) return;

        canvas.width = 320;
        canvas.height = 180;
        ctx.drawImage(video, 0, 0, 320, 180);
        const frame = ctx.getImageData(0, 0, 320, 180);

        if (prevFrameRef.current) {
          const prev = prevFrameRef.current.data;
          const curr = frame.data;
          let diff = 0;
          for (let i = 0; i < curr.length; i += 16) {
            diff += Math.abs(curr[i] - prev[i]) + Math.abs(curr[i+1] - prev[i+1]) + Math.abs(curr[i+2] - prev[i+2]);
          }
          const motion = Math.min(100, Math.round(diff / 500));
          setMotionLevel(motion);

          if (motion > 20) {
            setMotionAlert(true);
            if (motionAlertTimer.current) clearTimeout(motionAlertTimer.current);
            motionAlertTimer.current = setTimeout(() => setMotionAlert(false), 3000);
            if (autoRecord && !recording) startRecording();
          }
        }
        prevFrameRef.current = frame;
      }
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [motionDetect, audioDetect, autoRecord, recording, status]);

  // ── 녹화 ─────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (recording || !videoRef.current?.srcObject) return;
    const stream = videoRef.current.srcObject as MediaStream;
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1500000 });
    mediaRecorderRef.current = mr;
    recChunksRef.current = [];

    mr.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
    mr.onstop = async () => {
      const blob = new Blob(recChunksRef.current, { type: 'video/webm' });
      await saveToNAS(blob);
      recChunksRef.current = [];
    };

    mr.start(1000);
    setRecording(true);
    let sec = 0;
    recTimerRef.current = setInterval(() => {
      sec++;
      setRecDuration(sec);
      // 5분마다 자동 분할 저장
      if (sec % 300 === 0) {
        mr.stop();
        setTimeout(() => {
          if (recording) startRecording();
        }, 500);
      }
    }, 1000);
  }, [recording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecording(false);
    setRecDuration(0);
  }, []);

  const saveToNAS = async (blob: Blob) => {
    const now = new Date();
    const filename = `cctv_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}.webm`;
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('filename', filename);
    try {
      await fetch('/api/cctv/record', { method: 'POST', body: form });
      loadRecordings();
    } catch { /* ignore */ }
  };

  const loadRecordings = async () => {
    try {
      const res = await fetch('/api/cctv/record');
      const data = await res.json();
      setRecordings(data.files || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadRecordings(); }, []);

  const formatDuration = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const formatSize = (b: number) => b < 1024*1024 ? `${(b/1024).toFixed(0)}KB` : `${(b/1024/1024).toFixed(1)}MB`;
  const formatDate = (ts: number) => new Date(ts*1000).toLocaleString('ko-KR', { month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' });

  const getCamLabel = (name: string) => {
    if (name.startsWith('cam1_')) return { label: 'CAM1', color: 'text-blue-400 bg-blue-900/30' };
    if (name.startsWith('cam2_')) return { label: 'CAM2', color: 'text-green-400 bg-green-900/30' };
    return { label: 'CCTV', color: 'text-gray-400 bg-gray-700/30' };
  };

  const filteredRecordings = recordings.filter(r => {
    if (recFilter === 'all') return true;
    if (recFilter === 'cam1') return r.name.startsWith('cam1_');
    if (recFilter === 'cam2') return r.name.startsWith('cam2_');
    if (recFilter === 'cctv') return !r.name.startsWith('cam1_') && !r.name.startsWith('cam2_');
    return true;
  });

  const getRecordingDate = (name: string): Date | null => {
    const m = name.match(/_(\d{10,13})\./);
    if (!m) return null;
    const ts = parseInt(m[1]);
    return new Date(ts > 9999999999 ? ts : ts * 1000);
  };

  const dateFilteredRecordings = filteredRecordings.filter(r => {
    if (!selectedDate) return true;
    const d = getRecordingDate(r.name);
    if (!d) return true;
    return d.toISOString().slice(0, 10) === selectedDate;
  });

  const playRecording = async (name: string) => {
    setPlayLoading(true);
    setPlayName(name);
    setPlayUrl(null);
    try {
      const res = await fetch(`/api/nas/download?path=/volume1/homes/urjent/loov/movie/${encodeURIComponent(name)}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPlayUrl(url);
    } catch {
      alert('영상을 불러오지 못했습니다.');
    } finally {
      setPlayLoading(false);
    }
  };

  const closePlayer = () => {
    if (playUrl) URL.revokeObjectURL(playUrl);
    setPlayUrl(null);
    setPlayName('');
  };

  // 재생 속도 적용
  useEffect(() => {
    if (playVideoRef.current) playVideoRef.current.playbackRate = playbackRate;
  }, [playbackRate, playUrl]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 헤더 */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold">📷 CCTV 뷰어</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              status === 'connected' ? 'bg-green-500/20 text-green-400'
              : status === 'waiting' ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-gray-700 text-gray-400'
            }`}>
              {status === 'connected' ? '● LIVE' : status === 'waiting' ? '⏳ 대기중' : '○ 오프라인'}
            </span>
            {statusMsg && <span className="text-xs text-gray-500">{statusMsg}</span>}
          </div>
          <div className="flex items-center gap-2">
            {status === 'idle' ? (
              <button onClick={connect}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium">
                연결
              </button>
            ) : (
              <button onClick={disconnect}
                className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-medium">
                연결 해제
              </button>
            )}
          </div>
        </div>
        {/* 카메라 채널 탭 */}
        <div className="flex gap-2">
          {(Object.entries(CHANNELS) as [CamChannel, typeof CHANNELS[CamChannel]][]).map(([key, info]) => (
            <button
              key={key}
              onClick={() => { if (status !== 'idle') disconnect(); setSelectedCam(key); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedCam === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <span className="font-mono">{info.label}</span>
              <span className="ml-1 opacity-60">{info.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── 메인 비디오 ── */}
        <div className="lg:col-span-2 space-y-3">
          {/* 비디오 + 회전/반전 컨트롤 */}
          <div
            id="video-container"
            className={`relative bg-black rounded-xl overflow-hidden ${
              rotation === 90 || rotation === 270 ? 'aspect-[9/16]' : 'aspect-video'
            }`}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={false}
              className="w-full h-full object-contain transition-transform duration-300"
              style={{
                transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
              }}
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* 오버레이: 연결 안됨 */}
            {status !== 'connected' && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                <div className="text-center">
                  <div className="text-4xl mb-3">📷</div>
                  <p className="text-gray-400 text-sm">
                    {status === 'waiting' ? '카메라 연결 대기중...' : '카메라가 오프라인입니다'}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">아이폰에서 /cam1 또는 /cam2 페이지를 열어주세요</p>
                </div>
              </div>
            )}

            {/* 모션 감지 알림 */}
            {motionAlert && (
              <div className="absolute top-3 right-3 px-3 py-1 bg-red-600/90 text-white text-xs font-bold rounded-full animate-pulse">
                🚨 모션 감지
              </div>
            )}

            {/* 녹화 중 표시 */}
            {recording && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded-full">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-mono text-white">{formatDuration(recDuration)}</span>
              </div>
            )}

            {/* 전체화면 버튼 */}
            <button
              onClick={() => {
                const el = document.getElementById('video-container');
                if (!document.fullscreenElement) {
                  el?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
                } else {
                  document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
                }
              }}
              className="absolute bottom-3 right-3 p-1.5 bg-black/50 hover:bg-black/80 rounded-lg text-white/70 hover:text-white transition-colors"
              title="전체화면"
            >
              {isFullscreen ? '⊠' : '⛶'}
            </button>
          </div>

          {/* 화면 변환 컨트롤 */}
          <div className="bg-gray-900 rounded-xl p-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 mr-1">화면:</span>
            {/* 회전 */}
            <button onClick={() => setRotation(r => (r + 90) % 360)}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg flex items-center gap-1">
              ↻ <span>회전 {rotation}°</span>
            </button>
            <button onClick={() => setRotation(0)}
              className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg">
              원위치
            </button>
            {/* 반전 */}
            <button onClick={() => setFlipH(v => !v)}
              className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${flipH ? 'bg-blue-600/30 text-blue-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              ↔ 좌우반전
            </button>
            <button onClick={() => setFlipV(v => !v)}
              className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1 ${flipV ? 'bg-blue-600/30 text-blue-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              ↕ 상하반전
            </button>
          </div>

          {/* 라이브 스트림 수동 녹화 컨트롤 */}
          <div className="bg-gray-900 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs text-gray-500 font-medium">🖥 뷰어 측 라이브 녹화</div>
              <div className="text-[10px] text-gray-600 bg-gray-800 px-2 py-0.5 rounded">
                ※ cam1/cam2 자체 저장과 별개
              </div>
              <button onClick={() => setShowRecordings(v => !v)}
                className="ml-auto px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-300">
                📁 저장 목록 ({recordings.length})
              </button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {!recording ? (
                <button onClick={startRecording} disabled={status !== 'connected'}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 rounded-lg text-xs font-semibold transition-colors">
                  <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  라이브 녹화 시작
                </button>
              ) : (
                <button onClick={stopRecording}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs font-semibold">
                  <div className="w-2.5 h-2.5 bg-white" />
                  라이브 녹화 중지 {formatDuration(recDuration)}
                </button>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => setAutoRecord(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${autoRecord ? 'bg-orange-500' : 'bg-gray-600'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${autoRecord ? 'left-4.5' : 'left-0.5'}`} />
                </div>
                <span className="text-xs text-gray-400">감지 시 자동</span>
              </label>
            </div>
          </div>
        </div>

        {/* ── 사이드 패널 ── */}
        <div className="space-y-3">
          {/* 감지 설정 */}
          <div className="bg-gray-900 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300">🔍 감지 설정</h3>

            {/* 모션 감지 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">모션 감지</span>
                <div onClick={() => setMotionDetect(v => !v)} className="cursor-pointer">
                  <div className={`relative w-10 h-5 rounded-full transition-colors ${motionDetect ? 'bg-blue-500' : 'bg-gray-600'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${motionDetect ? 'left-5.5' : 'left-0.5'}`} />
                  </div>
                </div>
              </div>
              {motionDetect && (
                <div className="mt-1">
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-100 ${motionLevel > 30 ? 'bg-red-500' : 'bg-blue-500'}`}
                      style={{ width: `${motionLevel}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 mt-0.5 block">레벨: {motionLevel}%</span>
                </div>
              )}
            </div>

            {/* 오디오 감지 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">음성 감지</span>
                <div onClick={() => setAudioDetect(v => !v)} className="cursor-pointer">
                  <div className={`relative w-10 h-5 rounded-full transition-colors ${audioDetect ? 'bg-green-500' : 'bg-gray-600'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${audioDetect ? 'left-5.5' : 'left-0.5'}`} />
                  </div>
                </div>
              </div>
              {audioDetect && (
                <div className="mt-1">
                  <div className="flex gap-0.5 h-8 items-end">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm transition-all duration-75 ${
                          i * 5 < audioLevel
                            ? audioLevel > 70 ? 'bg-red-500' : audioLevel > 40 ? 'bg-yellow-500' : 'bg-green-500'
                            : 'bg-gray-700'
                        }`}
                        style={{ height: `${20 + i * 4}%` }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-500 mt-0.5 block">레벨: {audioLevel}%</span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-gray-800">
              <p className="text-xs text-gray-500">
                자동 녹화 + 감지 활성화 시<br />감지되면 자동으로 녹화 시작
              </p>
            </div>
          </div>

          {/* 카메라 URL 안내 */}
          <div className="bg-gray-900 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">📱 카메라 설정</h3>
            <p className="text-xs text-gray-500 mb-2">아이폰 Safari에서 아래 URL 접속:</p>
            <div className="space-y-2">
              {(Object.entries(CHANNELS) as [CamChannel, typeof CHANNELS[CamChannel]][]).map(([key, info]) => (
                <div key={key} className={`rounded-lg p-2 text-xs font-mono break-all border ${
                  selectedCam === key ? 'bg-blue-900/30 text-blue-300 border-blue-700/50' : 'bg-gray-800 text-gray-500 border-transparent'
                }`}>
                  <span className="text-gray-400">{typeof window !== 'undefined' ? window.location.origin : ''}</span>
                  <span className="font-bold">{info.label}</span>
                  <span className="ml-2 font-sans text-[10px] opacity-60">— {info.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-2">시계를 3번 탭 → PIN 입력</p>
          </div>
        </div>
      </div>

      {/* 녹화 목록 */}
      {showRecordings && (
        <div className="mx-4 mb-4 bg-gray-900 rounded-xl overflow-hidden">
          {/* 헤더 */}
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">📁 저장된 녹화</h3>
              <span className="text-xs text-gray-500">({filteredRecordings.length}개)</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* 필터 탭 */}
              {(['all', 'cam1', 'cam2', 'cctv'] as const).map(f => (
                <button key={f} onClick={() => setRecFilter(f)}
                  className={`px-2 py-1 rounded text-xs font-medium ${recFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {f === 'all' ? '전체' : f.toUpperCase()}
                </button>
              ))}
              {/* 날짜 필터 */}
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1 border border-gray-700"
              />
              {selectedDate && (
                <button onClick={() => setSelectedDate('')} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
              )}
              <button onClick={loadRecordings} className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-400">🔄</button>
            </div>
          </div>

          {/* cam1 간격 안내 */}
          <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-800 text-xs text-gray-500 flex gap-4">
            <span>📹 CAM1: 30초 단위 자동 분할 저장</span>
            <span>📷 CAM2: 모션 감지 시 저장</span>
          </div>

          {/* 타임라인 뷰 (날짜 선택 시) */}
          {selectedDate && dateFilteredRecordings.length > 0 && (
            <div className="px-4 py-3 border-b border-gray-800">
              <div className="text-xs text-gray-500 mb-2">📅 {selectedDate} 타임라인</div>
              <div className="relative h-8 bg-gray-800 rounded-lg overflow-hidden">
                {/* 시간 눈금 */}
                {[0, 6, 12, 18, 24].map(h => (
                  <div key={h} className="absolute top-0 bottom-0 border-l border-gray-600/30 text-[8px] text-gray-600 pl-0.5"
                    style={{ left: `${(h / 24) * 100}%` }}>
                    {h > 0 && h < 24 ? `${h}시` : ''}
                  </div>
                ))}
                {/* 녹화 블록 */}
                {dateFilteredRecordings.map(r => {
                  const d = getRecordingDate(r.name);
                  if (!d) return null;
                  const hourPct = ((d.getHours() * 60 + d.getMinutes()) / (24 * 60)) * 100;
                  const widthPct = (30 / (24 * 60)) * 100; // 30초 = 0.035%
                  return (
                    <div
                      key={r.name}
                      onClick={() => playRecording(r.name)}
                      className="absolute top-1 bottom-1 rounded-sm cursor-pointer hover:opacity-100 opacity-80"
                      style={{
                        left: `${hourPct}%`,
                        width: `max(4px, ${widthPct}%)`,
                        backgroundColor: r.name.startsWith('cam1_') ? '#3b82f6' : '#22c55e',
                      }}
                      title={`${d.toLocaleTimeString('ko-KR')} - ${r.name}`}
                    />
                  );
                })}
              </div>
              <div className="flex gap-2 mt-1">
                <span className="text-[10px] flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded-sm inline-block"></span>CAM1</span>
                <span className="text-[10px] flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-sm inline-block"></span>CAM2</span>
              </div>
            </div>
          )}

          {/* 목록 */}
          <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
            {dateFilteredRecordings.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-600 text-sm">저장된 녹화 없음</div>
            ) : dateFilteredRecordings.map(r => {
              const cam = getCamLabel(r.name);
              return (
                <div key={r.name} className="px-4 py-3 flex items-center justify-between hover:bg-gray-800/40 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${cam.color}`}>
                      {cam.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-300 font-mono truncate">{r.name}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{formatDate(r.modTime)} · {formatSize(r.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* 재생 */}
                    <button
                      onClick={() => playRecording(r.name)}
                      className="px-2.5 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 rounded text-xs font-medium flex items-center gap-1"
                    >
                      ▶ 재생
                    </button>
                    {/* 다운로드 */}
                    <a
                      href={`/api/nas/download?path=/volume1/homes/urjent/loov/movie/${encodeURIComponent(r.name)}`}
                      download={r.name}
                      className="px-2 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded text-xs"
                    >
                      ⬇
                    </a>
                    {/* 삭제 */}
                    <button
                      onClick={async () => {
                        if (!confirm(`"${r.name}" 삭제?`)) return;
                        await fetch('/api/cctv/record', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ filename: r.name }),
                        });
                        loadRecordings();
                      }}
                      className="px-2 py-1.5 bg-red-600/20 text-red-400 hover:bg-red-600/40 rounded text-xs"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 재생 모달 */}
      {(playUrl || playLoading) && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closePlayer(); }}
        >
          <div className="w-full max-w-3xl bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${getCamLabel(playName).color}`}>
                  {getCamLabel(playName).label}
                </span>
                <span className="text-xs text-gray-300 font-mono truncate">{playName}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={playUrl || '#'}
                  download={playName}
                  className="px-3 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 rounded text-xs"
                >
                  ⬇ 다운로드
                </a>
                <button onClick={closePlayer} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
                  ✕
                </button>
              </div>
            </div>

            {/* 비디오 */}
            <div className="bg-black aspect-video flex items-center justify-center">
              {playLoading ? (
                <div className="text-center text-gray-500">
                  <div className="text-3xl mb-3 animate-pulse">⏳</div>
                  <p className="text-sm">영상 불러오는 중...</p>
                  <p className="text-xs mt-1 opacity-60">파일 크기에 따라 시간이 걸릴 수 있습니다</p>
                </div>
              ) : playUrl ? (
                <video
                  ref={playVideoRef}
                  src={playUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                  controlsList="nodownload"
                />
              ) : null}
            </div>

            {/* 재생 속도 컨트롤 */}
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 border-t border-gray-800">
              <span className="text-xs text-gray-500">재생 속도:</span>
              {[1, 2, 4, 8, 16].map(rate => (
                <button key={rate} onClick={() => setPlaybackRate(rate)}
                  className={`px-2 py-1 text-xs rounded ${playbackRate === rate ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
