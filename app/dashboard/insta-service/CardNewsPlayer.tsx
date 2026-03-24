'use client';

import dynamic from 'next/dynamic';
import type { CardSlide } from './types';

const Player = dynamic(() => import('@remotion/player').then(m => m.Player), { ssr: false });
const CardNewsScene = dynamic(
  () => import('../shorts2/remotion/templates/CardNewsScene').then(m => m.CardNewsScene),
  { ssr: false }
);

const BGM_TRACKS = [
  { id: 'none',       label: '🔇 없음',         url: '' },
  { id: 'lofi',       label: '🎵 Chill Lofi',    url: 'https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3' },
  { id: 'upbeat',     label: '🎶 Upbeat Pop',    url: 'https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a73467.mp3' },
  { id: 'cinematic',  label: '🎼 Cinematic',     url: 'https://cdn.pixabay.com/audio/2022/01/18/audio_d0c6ff1c23.mp3' },
  { id: 'acoustic',   label: '🎸 Acoustic',      url: 'https://cdn.pixabay.com/audio/2021/12/13/audio_cb4e49b448.mp3' },
  { id: 'electronic', label: '⚡ Electronic',    url: 'https://cdn.pixabay.com/audio/2022/08/04/audio_2dde668d05.mp3' },
  { id: 'jazz',       label: '🎷 Jazz Cafe',     url: 'https://cdn.pixabay.com/audio/2022/10/25/audio_946e3e9040.mp3' },
];

type CardTheme = 'blue' | 'dark' | 'warm' | 'green' | 'purple';

interface Props {
  slides: CardSlide[];
  theme: CardTheme;
  bgm: string;
  onBgmChange: (id: string) => void;
}

const SLIDE_FRAMES = 150; // 5s @ 30fps

export default function CardNewsPlayer({ slides, theme, bgm, onBgmChange }: Props) {
  const bgmUrl = BGM_TRACKS.find(t => t.id === bgm)?.url || '';
  const totalFrames = slides.length * SLIDE_FRAMES;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* BGM selector */}
      <div className="flex items-center gap-3 bg-gray-900/60 rounded-xl p-3">
        <span className="text-white text-sm font-semibold shrink-0">🎵 배경음악</span>
        <div className="flex gap-1.5 flex-wrap flex-1">
          {BGM_TRACKS.map(t => (
            <button key={t.id} onClick={() => onBgmChange(t.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${bgm === t.id ? 'bg-yellow-400 text-gray-900' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Remotion Player */}
      {slides.length > 0 && Player && CardNewsScene ? (
        <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10" style={{ aspectRatio: '1/1', background: '#000' }}>
          <Player
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            component={CardNewsScene as any}
            inputProps={{ slides, theme, bgmUrl, durationInFrames: totalFrames }}
            durationInFrames={Math.max(1, totalFrames)}
            fps={30}
            compositionWidth={1080}
            compositionHeight={1080}
            style={{ width: '100%', height: '100%' }}
            controls
            loop
            autoPlay
          />
          <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
            {slides.length}장 · {Math.round(totalFrames / 30)}초
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-gray-900 flex items-center justify-center text-gray-500 text-sm" style={{ aspectRatio: '1/1' }}>
          슬라이드를 생성하면 영상 미리보기가 표시됩니다
        </div>
      )}
    </div>
  );
}
