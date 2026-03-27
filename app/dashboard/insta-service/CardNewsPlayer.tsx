'use client';

import { useState, useEffect, useRef } from 'react';
// Direct imports — this file is already 'use client', no SSR issue
import { Player, type PlayerRef } from '@remotion/player';
import html2canvas from 'html2canvas';
import { CardNewsScene } from '../shorts2/remotion/templates/CardNewsScene';
import type { CardSlide } from './types';

export const BGM_TRACKS = [
  { id: 'none',         label: '🔇 없음',              url: '' },
  // Lofi / Chill
  { id: 'lofi1',        label: '☕ Chill Lofi',         url: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3' },
  { id: 'lofi2',        label: '🌙 Night Lofi',         url: 'https://cdn.pixabay.com/audio/2023/01/25/audio_7071a33d2a.mp3' },
  { id: 'lofi3',        label: '🌿 Study Lofi',         url: 'https://cdn.pixabay.com/audio/2022/11/22/audio_febc508520.mp3' },
  { id: 'lofi4',        label: '🏙️ Urban Lofi',        url: 'https://cdn.pixabay.com/audio/2022/10/30/audio_a8c0d8c5c6.mp3' },
  // Pop / Upbeat
  { id: 'upbeat1',      label: '🎶 Upbeat Pop',         url: 'https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a73467.mp3' },
  { id: 'upbeat2',      label: '✨ Bright Pop',          url: 'https://cdn.pixabay.com/audio/2022/08/23/audio_d16737dc28.mp3' },
  { id: 'upbeat3',      label: '🌈 Happy Vibes',        url: 'https://cdn.pixabay.com/audio/2022/01/20/audio_d53cf79399.mp3' },
  // Cinematic / Epic
  { id: 'cinematic1',   label: '🎬 Epic Cinematic',     url: 'https://cdn.pixabay.com/audio/2022/01/18/audio_d0c6ff1c23.mp3' },
  { id: 'cinematic2',   label: '🌌 Space Epic',         url: 'https://cdn.pixabay.com/audio/2022/07/25/audio_8f42de6b0c.mp3' },
  { id: 'cinematic3',   label: '🔥 Action Hero',        url: 'https://cdn.pixabay.com/audio/2022/04/07/audio_f3d4c7d5e7.mp3' },
  // Acoustic / Guitar
  { id: 'acoustic1',    label: '🎸 Acoustic Guitar',    url: 'https://cdn.pixabay.com/audio/2021/12/13/audio_cb4e49b448.mp3' },
  { id: 'acoustic2',    label: '🪕 Folk Acoustic',      url: 'https://cdn.pixabay.com/audio/2022/03/15/audio_89e0a0e9c3.mp3' },
  // Electronic / Synth
  { id: 'electronic1',  label: '⚡ Electronic',         url: 'https://cdn.pixabay.com/audio/2022/08/04/audio_2dde668d05.mp3' },
  { id: 'electronic2',  label: '🔊 Synth Wave',         url: 'https://cdn.pixabay.com/audio/2022/10/13/audio_f6d43e4d07.mp3' },
  { id: 'electronic3',  label: '🎛️ Tech House',        url: 'https://cdn.pixabay.com/audio/2022/09/14/audio_c880f1c7d4.mp3' },
  // Jazz / Cafe
  { id: 'jazz1',        label: '🎷 Jazz Cafe',           url: 'https://cdn.pixabay.com/audio/2022/10/25/audio_946e3e9040.mp3' },
  { id: 'jazz2',        label: '🎺 Smooth Jazz',         url: 'https://cdn.pixabay.com/audio/2022/09/20/audio_0e26b24dbc.mp3' },
  // Corporate / Business
  { id: 'corporate1',   label: '💼 Corporate',           url: 'https://cdn.pixabay.com/audio/2022/05/17/audio_69a61cd6d6.mp3' },
  { id: 'corporate2',   label: '📊 Business Motivate',   url: 'https://cdn.pixabay.com/audio/2022/10/16/audio_5ec1b7c3d0.mp3' },
  // Piano
  { id: 'piano1',       label: '🎹 Piano Ballad',        url: 'https://cdn.pixabay.com/audio/2022/01/21/audio_a8a32f0aa4.mp3' },
  { id: 'piano2',       label: '🎵 Piano Chill',         url: 'https://cdn.pixabay.com/audio/2022/05/16/audio_b0c68ff9ea.mp3' },
  { id: 'piano3',       label: '🌸 Soft Piano',          url: 'https://cdn.pixabay.com/audio/2022/07/17/audio_f17e2ee5b0.mp3' },
  // Ambient / Nature
  { id: 'ambient1',     label: '🌊 Ocean Ambient',       url: 'https://cdn.pixabay.com/audio/2022/06/07/audio_b6d0e88da3.mp3' },
  { id: 'ambient2',     label: '🌲 Forest Ambient',      url: 'https://cdn.pixabay.com/audio/2022/07/31/audio_e8cc1f6df3.mp3' },
  // Hip Hop / R&B
  { id: 'hiphop1',      label: '🎤 Hip Hop Beat',        url: 'https://cdn.pixabay.com/audio/2022/08/25/audio_ce8aca0fbc.mp3' },
  { id: 'rnb1',         label: '🎙️ R&B Smooth',         url: 'https://cdn.pixabay.com/audio/2022/09/02/audio_2093a2e40b.mp3' },
  // Motivational
  { id: 'motivate1',    label: '💪 Motivational',        url: 'https://cdn.pixabay.com/audio/2022/04/27/audio_f30e81ef06.mp3' },
  { id: 'motivate2',    label: '🚀 Inspiring',           url: 'https://cdn.pixabay.com/audio/2022/09/06/audio_c5413ba3e2.mp3' },
  // Dreamy / Indie
  { id: 'dreamy1',      label: '✨ Dreamy Indie',        url: 'https://cdn.pixabay.com/audio/2022/07/23/audio_8437d8dc9c.mp3' },
  { id: 'dreamy2',      label: '🌠 Ethereal',            url: 'https://cdn.pixabay.com/audio/2023/02/14/audio_46ae50fae9.mp3' },
];

type CardTheme = 'blue' | 'dark' | 'warm' | 'green' | 'purple' | 'neon' | 'minimal' | 'sunset';

interface Props {
  slides: CardSlide[];
  theme: CardTheme;
  bgm: string;
  caption: string;
  onBgmChange: (id: string) => void;
}

const SLIDE_FRAMES = 150;
const SLIDE_SECS = 5; // seconds per slide in canvas recording
const GENRE_GROUPS = [
  { label: 'Lofi/Chill', ids: ['lofi1','lofi2','lofi3','lofi4'] },
  { label: 'Pop/Upbeat', ids: ['upbeat1','upbeat2','upbeat3'] },
  { label: 'Cinematic', ids: ['cinematic1','cinematic2','cinematic3'] },
  { label: 'Acoustic', ids: ['acoustic1','acoustic2'] },
  { label: 'Electronic', ids: ['electronic1','electronic2','electronic3'] },
  { label: 'Jazz', ids: ['jazz1','jazz2'] },
  { label: 'Corporate', ids: ['corporate1','corporate2'] },
  { label: 'Piano', ids: ['piano1','piano2','piano3'] },
  { label: 'Ambient', ids: ['ambient1','ambient2'] },
  { label: 'HipHop/R&B', ids: ['hiphop1','rnb1'] },
  { label: 'Motivate', ids: ['motivate1','motivate2'] },
  { label: 'Dreamy', ids: ['dreamy1','dreamy2'] },
];

// Best available video MIME type (prefer mp4 for Instagram compatibility)
function getBestMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';
}

/** NAS TTS 우선, 실패 시 Vercel edge-tts fallback */
async function generateTTSAudio(text: string, voice: string, rate: number): Promise<string> {
  try {
    const speed = 1.0 + rate / 100;
    const res = await fetch('/api/shorts/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: voice, speed }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.audio) return d.audio as string;
    }
  } catch { /* fallback */ }
  // Fallback: Vercel edge-tts
  try {
    const res = await fetch('/api/shorts/edge-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate }),
    });
    const d = await res.json();
    return (d.audio as string) || '';
  } catch { return ''; }
}

function slideToNarration(slide: CardSlide): string {
  if (slide.type === 'title') {
    return `${slide.title}. ${slide.body || '지금 바로 확인해보세요.'}`;
  }
  if (slide.type === 'brand') {
    return '팔로우하고 매일 유용한 정보를 받아보세요. 저장해두고 친구에게 공유해 보세요.';
  }
  const pts = (slide.points || []).slice(0, 3).map(p => {
    const hasEmoji = p.length > 1 && /\p{Emoji}/u.test(p[0] + p[1]);
    return hasEmoji ? p.slice(2).trim() : p;
  }).filter(Boolean).join('. ');
  return `${slide.title}. ${pts || slide.body || ''}`;
}

// ── Record a canvas slideshow from card image URLs ──
async function recordSlideshowVideo(
  imageUrls: string[],
  secsPerSlide: number,
  onProgress: (pct: number) => void
): Promise<Blob> {
  const SIZE = 720;
  const FPS = 30;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // Load images — no crossOrigin needed for blob: URLs
  const imgs = await Promise.all(imageUrls.map(url => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${url.slice(0, 40)}`));
    img.src = url;
  })));

  const mimeType = getBestMimeType();
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(100);

  // Draw each slide once, then wait the real duration — captureStream records whatever is on canvas
  const total = imgs.length;
  for (let i = 0; i < total; i++) {
    ctx.drawImage(imgs[i], 0, 0, SIZE, SIZE);
    await new Promise<void>(r => setTimeout(r, secsPerSlide * 1000));
    onProgress(Math.round(((i + 1) / total) * 80));
  }

  recorder.stop();
  await new Promise<void>(r => { recorder.onstop = () => r(); });
  onProgress(100);

  return new Blob(chunks, { type: mimeType });
}

async function recordSlideshowVideoWithAudio(
  imageUrls: string[],
  secsPerSlide: number,
  bgmProxyUrl: string,
  ttsAudios: string[], // base64 data URLs from edge-tts API
  onProgress: (pct: number) => void
): Promise<Blob> {
  const SIZE = 720;
  const FPS = 30;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // Load images
  const imgs = await Promise.all(imageUrls.map(url => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = url;
  })));

  // Setup Web Audio for mixing BGM + TTS
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();

  // BGM (via proxy to avoid CORS)
  let bgmNode: AudioBufferSourceNode | null = null;
  if (bgmProxyUrl) {
    try {
      const bgmData = await fetch(bgmProxyUrl).then(r => r.arrayBuffer());
      const bgmBuffer = await audioCtx.decodeAudioData(bgmData);
      bgmNode = audioCtx.createBufferSource();
      bgmNode.buffer = bgmBuffer;
      bgmNode.loop = true;
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.22;
      bgmNode.connect(gainNode);
      gainNode.connect(dest);
      bgmNode.start();
    } catch { /* BGM failed gracefully */ }
  }

  // Pre-decode TTS audio
  const ttsBuffers: (AudioBuffer | null)[] = [];
  for (const dataUrl of ttsAudios) {
    try {
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      ttsBuffers.push(await audioCtx.decodeAudioData(bytes.buffer.slice(0)));
    } catch {
      ttsBuffers.push(null);
    }
  }

  // Calculate per-slide durations (TTS-aware)
  const slideDurations = ttsBuffers.map((buf) =>
    buf ? Math.max(secsPerSlide * 1000, buf.duration * 1000 + 600) : secsPerSlide * 1000
  );
  // Schedule all TTS playback upfront at exact offsets using AudioContext clock
  let ttsOffset = 0;
  for (let i = 0; i < ttsBuffers.length; i++) {
    if (ttsBuffers[i]) {
      const node = audioCtx.createBufferSource();
      node.buffer = ttsBuffers[i]!;
      const gain = audioCtx.createGain();
      gain.gain.value = 1.0;
      node.connect(gain);
      gain.connect(dest);
      node.start(audioCtx.currentTime + ttsOffset / 1000);
    }
    ttsOffset += slideDurations[i];
  }
  const totalDuration = slideDurations.reduce((a, b) => a + b, 0);

  // Create video+audio stream
  const mimeType = getBestMimeType();
  const videoStream = canvas.captureStream(FPS);
  dest.stream.getAudioTracks().forEach(t => videoStream.addTrack(t));
  const recorder = new MediaRecorder(videoStream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(100);

  const total = imgs.length;
  const ENTER_MS = 480;  // 와이프업 입장 시간 (ms)
  const KB_MAX = 1.028;  // 켄번즈 시작 스케일

  // Real-time animation loop — performance.now() based, so duration is always accurate
  const recordStart = performance.now();
  let cumulativeMs = 0;

  for (let i = 0; i < total; i++) {
    const slideStart = recordStart + cumulativeMs;
    const slideEnd = slideStart + slideDurations[i];

    while (performance.now() < slideEnd) {
      const elapsed = performance.now() - slideStart;

      ctx.clearRect(0, 0, SIZE, SIZE);

      if (elapsed < ENTER_MS) {
        // === WIPE-UP ENTRANCE: 아래에서 위로 슬라이드 등장 ===
        const t = Math.min(elapsed / ENTER_MS, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic (스프링 느낌)

        // 이전 슬라이드: 페이드 아웃
        if (i > 0) {
          ctx.save();
          ctx.globalAlpha = 1 - eased;
          ctx.drawImage(imgs[i - 1], 0, 0, SIZE, SIZE);
          ctx.restore();
        }

        // 현재 슬라이드: 아래서 위로 리빌 + 줌 안정화 (1.08 → 1.02)
        const revealTop = SIZE * (1 - eased);
        const enterScale = 1.08 - 0.06 * eased;
        const xOff = (SIZE * (enterScale - 1)) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, revealTop, SIZE, SIZE);
        ctx.clip();
        ctx.drawImage(imgs[i], -xOff, -xOff, SIZE * enterScale, SIZE * enterScale);
        ctx.restore();

        // 리빌 경계선 shimmer 효과
        if (t > 0.05 && t < 0.90) {
          const grad = ctx.createLinearGradient(0, revealTop - 20, 0, revealTop + 20);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(0.5, 'rgba(255,255,255,0.42)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, revealTop - 20, SIZE, 40);
        }
      } else {
        // === KEN BURNS: 켄번즈 줌아웃 + 살짝 좌측 이동 ===
        const kbElapsed = elapsed - ENTER_MS;
        const kbDur = Math.max(slideDurations[i] - ENTER_MS, 1);
        const kbT = Math.min(kbElapsed / kbDur, 1);

        const scale = KB_MAX - (KB_MAX - 1.0) * kbT;
        const xOff = (SIZE * (scale - 1)) / 2;
        const xDrift = -SIZE * 0.012 * kbT; // 좌측으로 1.2% 이동

        ctx.drawImage(imgs[i], -xOff + xDrift, -xOff, SIZE * scale, SIZE * scale);
      }

      // ~30ms sleep — loop runs ~33fps; performance.now() controls actual duration
      await new Promise<void>(r => setTimeout(r, 30));
    }

    cumulativeMs += slideDurations[i];
    onProgress(Math.round(((i + 1) / total) * 80));
  }

  // Wait until full duration is truly elapsed (catches any early exit)
  const remaining = totalDuration - (performance.now() - recordStart);
  if (remaining > 0) await new Promise<void>(r => setTimeout(r, remaining));

  bgmNode?.stop();
  recorder.stop();
  await new Promise<void>(r => { recorder.onstop = () => r(); });
  await audioCtx.close();
  onProgress(100);

  return new Blob(chunks, { type: mimeType });
}

/**
 * Remotion Player를 frame-by-frame html2canvas로 캡처 → 실제 spring 애니메이션 + TTS 음성 포함 영상
 */
async function recordFromRemotionPlayer(
  playerRef: React.RefObject<PlayerRef | null>,
  playerContainerRef: React.RefObject<HTMLDivElement | null>,
  totalFrames: number,
  secsPerSlide: number,
  bgmProxyUrl: string,
  ttsAudios: string[],
  onProgress: (pct: number) => void
): Promise<Blob> {
  const SIZE = 720;
  const RECORD_FPS = 15;      // 15fps 녹화 (html2canvas 성능 고려)
  const FRAME_STEP = 2;       // Remotion 30fps → 15fps (매 2프레임 캡처)

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // ── 오디오 설정 ────────────────────────────────────────────
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();

  // BGM
  let bgmNode: AudioBufferSourceNode | null = null;
  if (bgmProxyUrl) {
    try {
      const bgmData = await fetch(bgmProxyUrl).then(r => r.arrayBuffer());
      const bgmBuffer = await audioCtx.decodeAudioData(bgmData);
      bgmNode = audioCtx.createBufferSource();
      bgmNode.buffer = bgmBuffer;
      bgmNode.loop = true;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.22;
      bgmNode.connect(gain);
      gain.connect(dest);
      bgmNode.start();
    } catch { /* BGM 로드 실패 무시 */ }
  }

  // TTS 오디오 디코드
  const ttsBuffers: (AudioBuffer | null)[] = [];
  for (const dataUrl of ttsAudios) {
    if (!dataUrl) { ttsBuffers.push(null); continue; }
    try {
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      ttsBuffers.push(await audioCtx.decodeAudioData(bytes.buffer.slice(0)));
    } catch { ttsBuffers.push(null); }
  }

  // TTS를 슬라이드 시작 시점에 맞춰 예약 (5초 간격 = Remotion SLIDE_FRAMES/fps)
  for (let i = 0; i < ttsBuffers.length; i++) {
    if (!ttsBuffers[i]) continue;
    const node = audioCtx.createBufferSource();
    node.buffer = ttsBuffers[i]!;
    const gain = audioCtx.createGain();
    gain.gain.value = 1.0;
    node.connect(gain);
    gain.connect(dest);
    node.start(audioCtx.currentTime + i * secsPerSlide);
  }

  // ── 영상 녹화 설정 ─────────────────────────────────────────
  const mimeType = getBestMimeType();
  const videoStream = canvas.captureStream(RECORD_FPS);
  dest.stream.getAudioTracks().forEach(t => videoStream.addTrack(t));
  const recorder = new MediaRecorder(videoStream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(100);

  // Remotion Player 일시정지 후 처음으로 이동
  const player = playerRef.current;
  player?.pause();

  const totalCaptures = Math.ceil(totalFrames / FRAME_STEP);
  const numSlides = totalFrames / 150; // SLIDE_FRAMES = 150
  const totalDurationMs = secsPerSlide * 1000 * numSlides;
  const msPerCapture = totalDurationMs / totalCaptures;

  const captureStart = performance.now();

  for (let captureIdx = 0; captureIdx < totalCaptures; captureIdx++) {
    const remotionFrame = Math.min(captureIdx * FRAME_STEP, totalFrames - 1);
    const targetWallTime = captureStart + captureIdx * msPerCapture;

    // Remotion Player를 목표 프레임으로 이동
    player?.seekTo(remotionFrame);

    // React 리렌더링 대기 (rAF 2회)
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    // html2canvas로 캡처
    const container = playerContainerRef.current;
    if (container) {
      try {
        const w = container.offsetWidth || 400;
        // 캡처 전 모서리 제거 (rounded-2xl이 영상에 반영되지 않도록)
        const parentEl = container.parentElement as HTMLElement | null;
        const savedRadius = parentEl?.style.borderRadius ?? '';
        if (parentEl) parentEl.style.borderRadius = '0';

        const captured = await html2canvas(container, {
          scale: SIZE / w,
          useCORS: true,
          allowTaint: true,
          logging: false,
          imageTimeout: 3000,
          backgroundColor: '#000000',
        });
        ctx.drawImage(captured, 0, 0, SIZE, SIZE);

        if (parentEl) parentEl.style.borderRadius = savedRadius;
      } catch { /* 프레임 실패 시 이전 프레임 유지 */ }
    }

    onProgress(Math.round((captureIdx / totalCaptures) * 85));

    // 실시간 동기화: 목표 wall time까지 대기
    const now = performance.now();
    const waitMs = targetWallTime + msPerCapture - now;
    if (waitMs > 5) await new Promise<void>(r => setTimeout(r, waitMs));
  }

  // 오디오가 완전히 재생되도록 남은 시간 대기
  const elapsed = performance.now() - captureStart;
  const remaining = totalDurationMs - elapsed;
  if (remaining > 0) await new Promise<void>(r => setTimeout(r, remaining));

  bgmNode?.stop();
  recorder.stop();
  await new Promise<void>(r => { recorder.onstop = () => r(); });
  await audioCtx.close();
  onProgress(100);

  return new Blob(chunks, { type: mimeType });
}

export default function CardNewsPlayer({ slides, theme, bgm, caption, onBgmChange }: Props) {
  const bgmUrl = BGM_TRACKS.find(t => t.id === bgm)?.url || '';
  const totalFrames = Math.max(1, slides.length) * SLIDE_FRAMES;

  // Upload modals
  const [showInstaModal, setShowInstaModal] = useState(false);
  const [showYtModal, setShowYtModal] = useState(false);
  const [instaCaption, setInstaCaption] = useState('');
  const [instaMode, setInstaMode] = useState<'carousel' | 'reels'>('carousel');
  const [instaProgress, setInstaProgress] = useState(0);
  const [instaProgressMsg, setInstaProgressMsg] = useState('');
  const [ytTitle, setYtTitle] = useState('');
  const [ytDesc, setYtDesc] = useState('');
  const [ytTags, setYtTags] = useState('카드뉴스,shorts,정보');

  // Upload state
  const [instaLoading, setInstaLoading] = useState(false);
  const [instaResult, setInstaResult] = useState<{ ok: boolean; url?: string; error?: string } | null>(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytResult, setYtResult] = useState<{ ok: boolean; url?: string; error?: string } | null>(null);
  const [ytProgress, setYtProgress] = useState(0);
  const [ytProgressMsg, setYtProgressMsg] = useState('');

  // YouTube connection
  const [ytConnected, setYtConnected] = useState<boolean | null>(null);
  const [ytChannel, setYtChannel] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PlayerRef>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [ttsVoice, setTtsVoice] = useState('ko-KR-SunHiNeural');
  const [ttsRate, setTtsRate] = useState(10);

  // Check YouTube connection on modal open or after OAuth redirect
  useEffect(() => {
    if (showYtModal && ytConnected === null) {
      fetch('/api/youtube/status')
        .then(r => r.json())
        .then(d => { setYtConnected(d.connected); setYtChannel(d.channelName || ''); });
    }
  }, [showYtModal, ytConnected]);

  // OAuth 콜백 후 자동 상태 갱신 (?yt_connected=1)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('yt_connected') === '1') {
      fetch('/api/youtube/status')
        .then(r => r.json())
        .then(d => {
          setYtConnected(d.connected);
          setYtChannel(d.channelName || '');
          setShowYtModal(true); // 모달 자동 오픈
        });
      // URL 파라미터 제거
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Open Instagram modal
  const openInstaModal = () => {
    setInstaCaption(caption || '');
    setInstaResult(null);
    setInstaProgress(0);
    setInstaProgressMsg('');
    setShowInstaModal(true);
  };

  // Open YouTube modal
  const openYtModal = () => {
    setYtTitle(slides[0]?.title || '카드뉴스');
    setYtDesc(caption || '');
    setYtResult(null);
    setYtProgress(0);
    setYtProgressMsg('');
    setShowYtModal(true);
  };

  // Fetch all card image URLs from the card-image API
  const fetchCardImages = async (): Promise<string[]> => {
    return Promise.all(slides.map(async (slide, i) => {
      const params = new URLSearchParams({
        type: slide.type,
        title: slide.title,
        body: slide.body || '',
        num: String(i + 1),
        total: String(slides.length),
        theme,
        points: JSON.stringify(slide.points || []),
      });
      const res = await fetch(`/api/insta-service/card-image?${params}`);
      if (!res.ok) throw new Error(`카드 이미지 생성 실패 (${i + 1})`);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }));
  };

  // ── Upload to Instagram (carousel or reels) ──
  const uploadToInsta = async () => {
    if (!instaCaption.trim()) { alert('캡션을 입력하세요'); return; }
    setInstaLoading(true);
    setInstaResult(null);
    setInstaProgress(0);

    try {
      if (instaMode === 'carousel') {
        // Carousel: server generates PNGs and posts
        setInstaProgressMsg('카드 이미지 생성 & 발행 중...');
        const res = await fetch('/api/insta-service/publish-cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slides, theme, caption: instaCaption }),
        });
        const data = await res.json();
        setInstaResult(data.success ? { ok: true, url: data.url } : { ok: false, error: data.error });

      } else {
        // Reels: Remotion Player frame-by-frame 캡처 → TTS 음성 포함 영상
        setInstaProgress(5);
        setInstaProgressMsg('TTS 음성 생성 중...');

        let ttsAudios: string[] = [];
        if (ttsEnabled) {
          try {
            ttsAudios = await Promise.all(slides.map(async (slide) => {
              const text = slideToNarration(slide);
              return generateTTSAudio(text, ttsVoice, ttsRate);
            }));
          } catch { ttsAudios = []; }
        }

        setInstaProgress(18);
        const estSecs = Math.round(slides.length * SLIDE_SECS * 1.5);
        setInstaProgressMsg(`Remotion 애니메이션 영상 녹화 중... (약 ${estSecs}초 소요)`);

        const bgmProxyUrl = bgmUrl ? `/api/proxy-audio?url=${encodeURIComponent(bgmUrl)}` : '';
        const videoBlob = await recordFromRemotionPlayer(
          playerRef,
          playerContainerRef,
          totalFrames,
          SLIDE_SECS,
          bgmProxyUrl,
          ttsAudios,
          pct => {
            setInstaProgress(18 + Math.round(pct * 0.52));
            setInstaProgressMsg(`Remotion 녹화 중... ${pct}%`);
          }
        );

        setInstaProgress(72);
        setInstaProgressMsg('영상 업로드 중...');
        const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
        const form = new FormData();
        form.append('file', videoBlob, `cardnews.${ext}`);
        const uploadRes = await fetch('/api/sns/media', { method: 'POST', body: form });
        const uploadData = await uploadRes.json();
        if (!uploadData.url) throw new Error(uploadData.error || '영상 업로드 실패');

        setInstaProgress(85);
        setInstaProgressMsg('Instagram Reels 발행 중...');
        const postRes = await fetch('/api/sns/post-now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: instaCaption, platforms: ['instagram'], media_urls: [uploadData.url] }),
        });
        const postData = await postRes.json();
        const r = postData.results?.find((x: { platform: string }) => x.platform === 'instagram');
        setInstaProgress(100);
        setInstaProgressMsg('완료!');
        setInstaResult(r?.success ? { ok: true, url: r.url } : { ok: false, error: r?.error || '발행 실패' });
      }
    } catch (e) {
      setInstaResult({ ok: false, error: String(e) });
    } finally {
      setInstaLoading(false);
    }
  };

  // ── Record & Upload to YouTube ──
  const uploadToYouTube = async () => {
    if (!ytTitle.trim()) { alert('제목을 입력하세요'); return; }
    setYtLoading(true);
    setYtResult(null);
    setYtProgress(5);
    setYtProgressMsg('카드 이미지 생성 중...');

    try {
      // Step 1: TTS 음성 생성
      setYtProgress(8);
      setYtProgressMsg('TTS 음성 생성 중...');
      let ttsAudios: string[] = [];
      if (ttsEnabled) {
        try {
          ttsAudios = await Promise.all(slides.map(async (slide) => {
            const text = slideToNarration(slide);
            return generateTTSAudio(text, ttsVoice, ttsRate);
          }));
        } catch { ttsAudios = []; }
      }

      // Step 2: Remotion Player frame-by-frame 캡처
      setYtProgress(18);
      const estSecs = Math.round(slides.length * SLIDE_SECS * 1.5);
      setYtProgressMsg(`Remotion 애니메이션 영상 녹화 중... (약 ${estSecs}초 소요)`);
      const bgmProxyUrl = bgmUrl ? `/api/proxy-audio?url=${encodeURIComponent(bgmUrl)}` : '';
      const videoBlob = await recordFromRemotionPlayer(
        playerRef,
        playerContainerRef,
        totalFrames,
        SLIDE_SECS,
        bgmProxyUrl,
        ttsAudios,
        pct => {
          setYtProgress(18 + Math.round(pct * 0.5));
          setYtProgressMsg(`Remotion 녹화 중... ${pct}%`);
        }
      );

      setYtProgress(82);
      setYtProgressMsg('YouTube에 업로드 중...');

      // Step 3: Upload to YouTube
      const form = new FormData();
      form.append('video', videoBlob, 'cardnews.webm');
      form.append('title', ytTitle);
      form.append('description', ytDesc);
      form.append('tags', ytTags);

      const res = await fetch('/api/youtube/upload', { method: 'POST', body: form });
      const data = await res.json();

      if (data.success) {
        setYtProgress(100);
        setYtProgressMsg('완료!');
        setYtResult({ ok: true, url: data.url });
      } else {
        setYtResult({ ok: false, error: data.error });
      }
    } catch (e) {
      setYtResult({ ok: false, error: String(e) });
    } finally {
      setYtLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Hidden canvas for recording */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Upload buttons ── */}
      {slides.length > 0 && (
        <div className="flex gap-3">
          <button onClick={openInstaModal}
            className="flex-1 py-3 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg">
            <span>📱</span> 인스타 업로드
          </button>
          <button onClick={openYtModal}
            className="flex-1 py-3 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg">
            <span>▶</span> 유튜브 숏츠
          </button>
        </div>
      )}

      {/* BGM selector */}
      <div className="bg-gray-900 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-white text-sm font-bold">🎵 배경음악 선택</span>
          {bgm !== 'none' && (
            <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
              {BGM_TRACKS.find(t => t.id === bgm)?.label}
            </span>
          )}
        </div>
        <button onClick={() => onBgmChange('none')}
          className={`mb-3 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${bgm === 'none' ? 'bg-yellow-400 text-gray-900' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          🔇 없음
        </button>
        <div className="space-y-2">
          {GENRE_GROUPS.map(group => (
            <div key={group.label} className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-500 text-xs w-20 shrink-0">{group.label}</span>
              {group.ids.map(id => {
                const track = BGM_TRACKS.find(t => t.id === id);
                if (!track) return null;
                return (
                  <button key={id} onClick={() => onBgmChange(id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${bgm === id ? 'bg-yellow-400 text-gray-900' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
                    {track.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Remotion Player (playerContainerRef: html2canvas 캡처 대상) */}
      <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black" style={{ aspectRatio: '1/1' }}>
        <div ref={playerContainerRef} style={{ width: '100%', height: '100%' }}>
          <Player
            ref={playerRef}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            component={CardNewsScene as any}
            inputProps={{ slides: slides.length > 0 ? slides : undefined, theme, bgmUrl, durationInFrames: totalFrames }}
            durationInFrames={totalFrames}
            fps={30}
            compositionWidth={1080}
            compositionHeight={1080}
            style={{ width: '100%', height: '100%' }}
            controls
            loop
            autoPlay
          />
        </div>
        <div className="absolute top-3 right-3 bg-black/70 text-white text-xs px-2.5 py-1 rounded-full font-medium pointer-events-none">
          {slides.length}장 · {Math.round(totalFrames / 30)}초
        </div>
      </div>

      {/* ── Instagram Modal ── */}
      {showInstaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => { if (e.target === e.currentTarget) setShowInstaModal(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 p-4 flex items-center gap-2">
              <span className="text-white text-lg">📱</span>
              <h3 className="text-white font-bold">Instagram 업로드</h3>
            </div>
            <div className="p-5 space-y-4">
              {/* Mode toggle */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                <button onClick={() => setInstaMode('carousel')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${instaMode === 'carousel' ? 'bg-white shadow text-purple-700' : 'text-gray-500'}`}>
                  🖼️ 이미지 캐러셀
                </button>
                <button onClick={() => setInstaMode('reels')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${instaMode === 'reels' ? 'bg-white shadow text-pink-600' : 'text-gray-500'}`}>
                  🎬 릴스 (영상)
                </button>
              </div>

              {instaMode === 'reels' && (
                <div className="bg-pink-50 border border-pink-200 rounded-xl px-3 py-2 text-xs text-pink-700">
                  슬라이드당 {SLIDE_SECS}초 · 총 {slides.length * SLIDE_SECS}초 영상으로 녹화 후 Reels 발행
                </div>
              )}

              {instaMode === 'reels' && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">🎙️ 음성 나레이션</span>
                    <button onClick={() => setTtsEnabled(v => !v)}
                      className={`w-11 h-6 rounded-full transition-colors relative ${ttsEnabled ? 'bg-purple-500' : 'bg-gray-300'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${ttsEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  {ttsEnabled && (
                    <select value={ttsVoice} onChange={e => setTtsVoice(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-purple-400">
                      <option value="ko-KR-SunHiNeural">선희 (여성·밝고 활기찬)</option>
                      <option value="ko-KR-InJoonNeural">인준 (남성·따뜻하고 친근)</option>
                      <option value="ko-KR-BongJinNeural">봉진 (남성·차분·전문적)</option>
                      <option value="ko-KR-GookMinNeural">국민 (남성·젊고 활기찬)</option>
                      <option value="ko-KR-HyunsuNeural">현수 (남성·내레이션)</option>
                      <option value="ko-KR-JiMinNeural">지민 (여성·부드럽)</option>
                      <option value="ko-KR-YuJinNeural">유진 (여성·감성적)</option>
                    </select>
                  )}
                </div>
              )}

              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">캡션</label>
                <textarea
                  value={instaCaption}
                  onChange={e => setInstaCaption(e.target.value)}
                  rows={5}
                  placeholder="인스타그램 캡션..."
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {instaCaption.length}/2200 · {instaMode === 'carousel' ? `${slides.length}장 캐러셀` : 'Reels 영상'}로 발행
                </p>
              </div>

              {/* Progress (Reels only) */}
              {instaLoading && instaMode === 'reels' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600">{instaProgressMsg}</span>
                    <span className="text-xs font-bold text-pink-600">{instaProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300" style={{ width: `${instaProgress}%` }} />
                  </div>
                </div>
              )}

              {instaResult && (
                <div className={`p-3 rounded-xl text-sm ${instaResult.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {instaResult.ok ? (
                    <div>
                      <p className="font-semibold">✅ 인스타그램 발행 완료!</p>
                      {instaResult.url && <a href={instaResult.url} target="_blank" rel="noopener noreferrer" className="text-xs underline mt-1 block">{instaResult.url}</a>}
                    </div>
                  ) : (
                    <p>❌ {instaResult.error}</p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setShowInstaModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                  닫기
                </button>
                <button onClick={uploadToInsta} disabled={instaLoading || instaResult?.ok}
                  className="flex-1 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {instaLoading ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{instaMode === 'reels' ? '처리 중...' : '발행 중...'}</>
                  ) : instaResult?.ok ? '✅ 완료' : (instaMode === 'reels' ? '🎬 릴스 발행' : '📱 발행하기')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── YouTube Modal ── */}
      {showYtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => { if (e.target === e.currentTarget) setShowYtModal(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-red-500 p-4 flex items-center gap-2">
              <span className="text-white text-lg">▶</span>
              <h3 className="text-white font-bold">YouTube Shorts 업로드</h3>
            </div>
            <div className="p-5 space-y-4">
              {/* Connection status */}
              {ytConnected === null ? (
                <p className="text-sm text-gray-500 text-center py-2">YouTube 연결 확인 중...</p>
              ) : !ytConnected ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                  <p className="text-sm text-yellow-800 font-semibold mb-3">YouTube 채널이 연결되지 않았습니다</p>
                  <a href="/api/youtube/connect"
                    className="inline-block px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700">
                    Google 계정으로 YouTube 연결
                  </a>
                  <button onClick={() => { setYtConnected(null); }}
                    className="block mx-auto mt-2 text-xs text-gray-500 underline">
                    연결 후 새로고침
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2">
                    <span className="text-red-600">▶</span>
                    <span className="text-sm text-red-700 font-semibold">{ytChannel}</span>
                    <span className="text-xs text-gray-400 ml-auto">연결됨</span>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">🎙️ 음성 나레이션</span>
                      <button onClick={() => setTtsEnabled(v => !v)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${ttsEnabled ? 'bg-red-500' : 'bg-gray-300'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${ttsEnabled ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                    {ttsEnabled && (
                      <select value={ttsVoice} onChange={e => setTtsVoice(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-red-400">
                        <option value="ko-KR-SunHiNeural">선희 (여성·밝고 활기찬)</option>
                        <option value="ko-KR-InJoonNeural">인준 (남성·따뜻하고 친근)</option>
                        <option value="ko-KR-BongJinNeural">봉진 (남성·차분·전문적)</option>
                        <option value="ko-KR-GookMinNeural">국민 (남성·젊고 활기찬)</option>
                        <option value="ko-KR-HyunsuNeural">현수 (남성·내레이션)</option>
                        <option value="ko-KR-JiMinNeural">지민 (여성·부드럽)</option>
                        <option value="ko-KR-YuJinNeural">유진 (여성·감성적)</option>
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">제목</label>
                    <input value={ytTitle} onChange={e => setYtTitle(e.target.value)}
                      placeholder="Shorts 제목 (100자 이내)"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">설명</label>
                    <textarea value={ytDesc} onChange={e => setYtDesc(e.target.value)}
                      rows={3} placeholder="Shorts 설명..."
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">태그 (쉼표로 구분)</label>
                    <input value={ytTags} onChange={e => setYtTags(e.target.value)}
                      placeholder="카드뉴스,shorts,정보"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>

                  {/* Progress */}
                  {ytLoading && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600">{ytProgressMsg}</span>
                        <span className="text-xs font-bold text-red-600">{ytProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-red-500 h-2 rounded-full transition-all duration-300" style={{ width: `${ytProgress}%` }} />
                      </div>
                      <p className="text-xs text-gray-400 mt-1 text-center">
                        슬라이드쇼 녹화 중 ({slides.length}장 × {SLIDE_SECS}초 = {slides.length * SLIDE_SECS}초 영상)
                      </p>
                    </div>
                  )}

                  {ytResult && (
                    <div className={`p-3 rounded-xl text-sm ${ytResult.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                      {ytResult.ok ? (
                        <div>
                          <p className="font-semibold">✅ YouTube 업로드 완료!</p>
                          {ytResult.url && <a href={ytResult.url} target="_blank" rel="noopener noreferrer" className="text-xs underline mt-1 block">{ytResult.url}</a>}
                          <p className="text-xs text-gray-500 mt-1">처리 완료까지 몇 분이 소요될 수 있습니다.</p>
                        </div>
                      ) : (
                        <p>❌ {ytResult.error}</p>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2">
                <button onClick={() => setShowYtModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                  닫기
                </button>
                {ytConnected && (
                  <button onClick={uploadToYouTube} disabled={ytLoading || ytResult?.ok}
                    className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {ytLoading ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />업로드 중...</>
                    ) : ytResult?.ok ? '✅ 완료' : '▶ 업로드'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
