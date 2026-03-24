'use client';

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
  onBgmChange: (id: string) => void;
}

const SLIDE_FRAMES = 150;
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

export default function CardNewsPlayer({ slides, theme, bgm, onBgmChange }: Props) {
  const bgmUrl = BGM_TRACKS.find(t => t.id === bgm)?.url || '';
  const totalFrames = Math.max(1, slides.length) * SLIDE_FRAMES;

  return (
    <div className="flex flex-col gap-4 w-full">
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
        {/* None button */}
        <button onClick={() => onBgmChange('none')}
          className={`mb-3 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${bgm === 'none' ? 'bg-yellow-400 text-gray-900' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
          🔇 없음
        </button>
        {/* Genre groups */}
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
    </div>
  );
}
