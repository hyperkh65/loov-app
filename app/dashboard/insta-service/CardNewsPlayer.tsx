'use client';

import { useState, useEffect, useRef } from 'react';
// Direct imports — this file is already 'use client', no SSR issue
import { Player } from '@remotion/player';
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

  // Check YouTube connection on modal open
  useEffect(() => {
    if (showYtModal && ytConnected === null) {
      fetch('/api/youtube/status')
        .then(r => r.json())
        .then(d => { setYtConnected(d.connected); setYtChannel(d.channelName || ''); });
    }
  }, [showYtModal, ytConnected]);

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
        // Reels: record slideshow video → upload to storage → post as Reels
        setInstaProgress(5);
        setInstaProgressMsg('카드 이미지 생성 중...');
        const imageUrls = await fetchCardImages();

        setInstaProgress(20);
        setInstaProgressMsg(`슬라이드쇼 녹화 중... (${slides.length * SLIDE_SECS}초)`);
        const videoBlob = await recordSlideshowVideo(imageUrls, SLIDE_SECS, pct => {
          setInstaProgress(20 + Math.round(pct * 0.5));
          setInstaProgressMsg(`녹화 중... ${pct}%`);
        });
        imageUrls.forEach(u => URL.revokeObjectURL(u));

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
      // Step 1: Fetch card images as object URLs
      const imageUrls = await fetchCardImages();
      setYtProgress(20);
      setYtProgressMsg(`슬라이드쇼 녹화 중... (${slides.length * SLIDE_SECS}초)`);

      // Step 2: Record canvas slideshow
      const videoBlob = await recordSlideshowVideo(imageUrls, SLIDE_SECS, pct => {
        setYtProgress(20 + Math.round(pct * 0.6));
        setYtProgressMsg(`녹화 중... ${pct}%`);
      });

      // Revoke object URLs
      imageUrls.forEach(u => URL.revokeObjectURL(u));

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

      {/* Remotion Player */}
      <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black" style={{ aspectRatio: '1/1' }}>
        <Player
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
                  <a href="/api/youtube/connect" target="_blank" rel="noopener noreferrer"
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
