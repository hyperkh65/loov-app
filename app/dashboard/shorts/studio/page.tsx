'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';

// ── 타입 ──────────────────────────────────────────────────────────────────────
type ImageEffect = 'static' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
type Transition  = 'none' | 'fade' | 'slide-up' | 'slide-left' | 'slide-right' | 'zoom' | 'flash' | 'dissolve';
type SubPos      = 'top' | 'middle' | 'bottom';
type SubSize     = 'sm' | 'md' | 'lg' | 'xl';
type LeftTab     = 'blog' | 'scenes';
type Platform    = 'youtube' | 'naver' | 'instagram' | 'tiktok';
type TtsMode     = 'webSpeech' | 'ttsmaker' | 'supertonic';
type CharSize    = 'sm' | 'md' | 'lg';
type SubFont     = 'default' | 'bold' | 'outline' | 'shadow' | 'neon';

interface Scene {
  id: string;
  duration: number;
  narration: string;
  subtitle: string;
  imageUrl: string;
  imageQuery: string;
  dallePrompt: string;
  imageSource: 'pixabay' | 'pexels' | 'dalle' | 'custom';
  imageEffect: ImageEffect;
  transition: Transition;
  characterAppears?: boolean;
}
interface SubtitleStyle {
  position: SubPos; textColor: string; bgColor: string; size: SubSize; bold: boolean;
  font: SubFont; outline: boolean; strokeColor: string; shadow: boolean;
}
interface Settings {
  platform: Platform; voiceRate: number; voicePitch: number; voiceIdx: number;
  bgmUrl: string; bgmVolume: number; ttsVolume: number; subtitleStyle: SubtitleStyle;
}
interface BlogPost {
  id: string; title: string; url: string; image: string;
  excerpt: string; content: string; date: string; categories: string[];
}
interface PixImage { id: number; url: string; thumb: string; author: string }

interface Character {
  enabled: boolean;
  emoji: string;
  name: string;
  position: 'left' | 'right';
  size: CharSize;
  showBubble: boolean;
}

interface BgmPreset {
  id: string;
  genre: string;
  label: string;
  url: string;
}

// ── 상수 ──────────────────────────────────────────────────────────────────────
const IMG_EFFECTS: { v: ImageEffect; label: string; icon: string }[] = [
  { v: 'static',    label: '고정',    icon: '⬜' },
  { v: 'zoom-in',   label: '줌인',    icon: '🔍' },
  { v: 'zoom-out',  label: '줌아웃',  icon: '🔎' },
  { v: 'pan-left',  label: '왼쪽 팬', icon: '⬅️' },
  { v: 'pan-right', label: '오른쪽 팬', icon: '➡️' },
];
const TRANSITIONS: { v: Transition; label: string; icon: string }[] = [
  { v: 'none',        label: '없음',     icon: '—'  },
  { v: 'fade',        label: '페이드',   icon: '◎'  },
  { v: 'slide-up',    label: '위↑',      icon: '⬆'  },
  { v: 'slide-left',  label: '왼←',      icon: '⬅'  },
  { v: 'slide-right', label: '오른→',    icon: '➡'  },
  { v: 'zoom',        label: '줌',       icon: '🔍' },
  { v: 'flash',       label: '플래시',   icon: '⚡'  },
  { v: 'dissolve',    label: '디졸브',   icon: '✦'  },
];

const SUBTITLE_FONTS: { v: SubFont; label: string }[] = [
  { v: 'default', label: '기본' },
  { v: 'bold',    label: '굵게' },
  { v: 'outline', label: '외곽선' },
  { v: 'shadow',  label: '그림자' },
  { v: 'neon',    label: '네온' },
];
const SUB_SIZES: { v: SubSize; label: string; px: number }[] = [
  { v: 'sm', label: 'S', px: 28 }, { v: 'md', label: 'M', px: 40 }, { v: 'lg', label: 'L', px: 52 }, { v: 'xl', label: 'XL', px: 64 },
];
const PLATFORMS: { v: Platform; icon: string; label: string }[] = [
  { v: 'youtube', icon: '▶️', label: 'YouTube' }, { v: 'naver', icon: '🟢', label: '네이버' },
  { v: 'instagram', icon: '📸', label: 'Instagram' }, { v: 'tiktok', icon: '🎵', label: 'TikTok' },
];
const DEFAULT_SETTINGS: Settings = {
  platform: 'youtube', voiceRate: 1.1, voicePitch: 1.0, voiceIdx: 0,
  bgmUrl: '', bgmVolume: 0.2, ttsVolume: 1.0,
  subtitleStyle: { position: 'bottom', textColor: '#ffffff', bgColor: 'rgba(0,0,0,0.6)', size: 'lg', bold: true, font: 'default', outline: false, strokeColor: '#000000', shadow: true },
};
const DEFAULT_CHARACTER: Character = {
  enabled: false,
  emoji: '🐻',
  name: '마스코트',
  position: 'right',
  size: 'md',
  showBubble: true,
};
const DEFAULT_SCENE = (): Scene => ({
  id: `s_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  duration: 5, narration: '', subtitle: '', imageUrl: '', imageQuery: '',
  dallePrompt: '', imageSource: 'pixabay', imageEffect: 'zoom-in', transition: 'fade',
  characterAppears: false,
});

const TTS_VOICES = [
  { id: 'ko-KR-SunHiNeural',    label: '선희 · 여성 · 밝고 친근' },
  { id: 'ko-KR-InJoonNeural',   label: '인준 · 남성 · 따뜻하고 친근' },
  { id: 'ko-KR-JiMinNeural',    label: '지민 · 여성 · 부드럽' },
  { id: 'ko-KR-BongJinNeural',  label: '봉진 · 남성 · 차분·전문적' },
  { id: 'ko-KR-GookMinNeural',  label: '국민 · 남성 · 젊고 활기찬' },
  { id: 'ko-KR-HyunsuNeural',   label: '현수 · 남성 · 내레이션' },
  { id: 'ko-KR-SeoHyeonNeural', label: '서현 · 여성 · 어린이' },
  { id: 'ko-KR-YuJinNeural',    label: '유진 · 여성 · 감성적' },
];
const SUPERTONIC_VOICES = [
  { id: 'F1', label: 'F1 · 여성 · 차분' },
  { id: 'F2', label: 'F2 · 여성 · 밝음' },
  { id: 'F3', label: 'F3 · 여성 · 감성적' },
  { id: 'F4', label: 'F4 · 여성 · 전문적' },
  { id: 'F5', label: 'F5 · 여성 · 활기찬' },
  { id: 'M1', label: 'M1 · 남성 · 차분' },
  { id: 'M2', label: 'M2 · 남성 · 밝음' },
  { id: 'M3', label: 'M3 · 남성 · 내레이션' },
  { id: 'M4', label: 'M4 · 남성 · 전문적' },
  { id: 'M5', label: 'M5 · 남성 · 활기찬' },
];

const CHARACTER_EMOJIS = ['🐻', '🦊', '🤖', '🐱', '🦄', '🐧', '🐼', '🐸', '🦁', '🐯'];

const BGM_PRESETS: BgmPreset[] = [
  { id: 'calm1',   genre: '잔잔',   label: '잔잔한 피아노',    url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3' },
  { id: 'calm2',   genre: '잔잔',   label: '어쿠스틱 기타',    url: 'https://cdn.pixabay.com/download/audio/2022/04/27/audio_67f7e5bf64.mp3' },
  { id: 'upbeat1', genre: '업비트', label: '신나는 팝',        url: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1bbb.mp3' },
  { id: 'upbeat2', genre: '업비트', label: '경쾌한 비트',      url: 'https://cdn.pixabay.com/download/audio/2023/03/09/audio_c76a5f23bb.mp3' },
  { id: 'lofi1',   genre: 'Lo-fi', label: 'Lo-fi 힙합',       url: 'https://cdn.pixabay.com/download/audio/2022/05/17/audio_69a61cd6d6.mp3' },
  { id: 'lofi2',   genre: 'Lo-fi', label: 'Chill 비트',       url: 'https://cdn.pixabay.com/download/audio/2022/08/31/audio_d3fc45e7b1.mp3' },
  { id: 'epic1',   genre: '에픽',   label: '오케스트라 에픽',  url: 'https://cdn.pixabay.com/download/audio/2022/04/27/audio_c9076a9c73.mp3' },
  { id: 'epic2',   genre: '에픽',   label: '시네마틱 드라마',  url: 'https://cdn.pixabay.com/download/audio/2021/11/25/audio_5a853b4e0a.mp3' },
  { id: 'fun1',    genre: '코믹',   label: '귀여운 동요풍',    url: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_270f49c1a7.mp3' },
  { id: 'emo1',    genre: '감동',   label: '감동적인 피아노',  url: 'https://cdn.pixabay.com/download/audio/2022/10/30/audio_b236c5abfa.mp3' },
  { id: 'trend1',  genre: '트렌드', label: '트렌디 팝 비트',   url: 'https://cdn.pixabay.com/download/audio/2023/01/04/audio_74c2a26d8b.mp3' },
  { id: 'trend2',  genre: '트렌드', label: '모던 R&B',         url: 'https://cdn.pixabay.com/download/audio/2023/02/28/audio_bf7a40cc15.mp3' },
];

const GENRE_COLORS: Record<string, string> = {
  '잔잔': 'bg-blue-900/50 text-blue-300',
  '업비트': 'bg-yellow-900/50 text-yellow-300',
  'Lo-fi': 'bg-purple-900/50 text-purple-300',
  '에픽': 'bg-red-900/50 text-red-300',
  '코믹': 'bg-pink-900/50 text-pink-300',
  '감동': 'bg-emerald-900/50 text-emerald-300',
  '트렌드': 'bg-indigo-900/50 text-indigo-300',
};

// ── Canvas 유틸 ───────────────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawKenBurns(ctx: CanvasRenderingContext2D, img: HTMLImageElement, effect: ImageEffect, progress: number, cw: number, ch: number) {
  const ratio = Math.max(cw / img.width, ch / img.height);
  let scale = ratio, tx = 0, ty = 0;

  if (effect === 'zoom-in')   scale = ratio * (1 + progress * 0.12);
  if (effect === 'zoom-out')  scale = ratio * (1.12 - progress * 0.12);
  if (effect === 'pan-left')  { scale = ratio * 1.1; tx = -progress * cw * 0.08; }
  if (effect === 'pan-right') { scale = ratio * 1.1; tx =  progress * cw * 0.08; }

  const dw = img.width * scale, dh = img.height * scale;
  ctx.drawImage(img, tx + (cw - dw) / 2, ty + (ch - dh) / 2, dw, dh);
}

function drawSubtitle(ctx: CanvasRenderingContext2D, text: string, style: SubtitleStyle, cw: number, ch: number) {
  if (!text) return;
  const fSize = SUB_SIZES.find(s => s.v === style.size)?.px ?? 40;
  const fontFamily = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const weight = (style.bold || style.font === 'bold') ? '900' : '700';
  ctx.font = `${weight} ${fSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const maxW = cw * 0.88;
  const chars = text.split('');
  let lines: string[] = [], cur = '';
  for (const ch of chars) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = ch; } else cur = test;
  }
  if (cur) lines.push(cur);

  const lineH = fSize * 1.35;
  const totalH = lines.length * lineH;
  const padX = fSize * 0.5, padY = fSize * 0.3;
  const yBase = style.position === 'top' ? ch * 0.12 : style.position === 'middle' ? (ch - totalH) / 2 + fSize : ch * 0.83;

  lines.forEach((line, i) => {
    const lw = ctx.measureText(line).width;
    const rx = (cw - lw) / 2 - padX;
    const ry = yBase + i * lineH - fSize - padY;
    const textY = yBase + i * lineH;

    // Background box (except neon/outline modes)
    if (style.font !== 'neon' && style.font !== 'outline') {
      roundRect(ctx, rx, ry, lw + padX * 2, lineH + padY, fSize * 0.25);
      ctx.fillStyle = style.bgColor;
      ctx.fill();
    }

    // Shadow
    if (style.shadow || style.font === 'shadow') {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = fSize * 0.35;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = style.textColor;
      ctx.fillText(line, cw / 2, textY);
      ctx.restore();
      return;
    }

    // Neon glow
    if (style.font === 'neon') {
      ctx.save();
      const neonColor = style.textColor === '#ffffff' ? '#00f7ff' : style.textColor;
      // Multiple glow layers
      for (const [blur, alpha] of [[60, 0.3], [30, 0.5], [10, 0.8]] as [number, number][]) {
        ctx.shadowColor = neonColor;
        ctx.shadowBlur = blur;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillText(line, cw / 2, textY);
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, cw / 2, textY);
      ctx.restore();
      return;
    }

    // Outline / stroke
    if (style.outline || style.font === 'outline') {
      ctx.save();
      ctx.strokeStyle = style.strokeColor || '#000000';
      ctx.lineWidth = fSize * 0.12;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, cw / 2, textY);
      ctx.fillStyle = style.textColor;
      ctx.fillText(line, cw / 2, textY);
      ctx.restore();
      return;
    }

    // Default: plain text
    ctx.fillStyle = style.textColor;
    ctx.fillText(line, cw / 2, textY);
  });
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  character: Character,
  sc: Scene,
  cw: number,
  ch: number,
  frameTime: number
) {
  if (!character.enabled) return;
  if (!sc.characterAppears && character.enabled) {
    // always show if enabled and no per-scene toggle set; only skip when sc.characterAppears is explicitly false
    // Actually: show always when enabled (characterAppears is optional per-scene extra control)
  }

  const sizeMap: Record<CharSize, number> = { sm: 0.12, md: 0.18, lg: 0.24 };
  const emojiSize = Math.round(cw * sizeMap[character.size]);

  // Subtle bounce: small amplitude sine wave
  const bounce = Math.sin(frameTime * 3) * (emojiSize * 0.04);

  const margin = cw * 0.04;
  const x = character.position === 'left' ? margin + emojiSize / 2 : cw - margin - emojiSize / 2;
  const baseY = ch * 0.88;
  const y = baseY + bounce;

  ctx.font = `${emojiSize}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(character.emoji, x, y);

  // Speech bubble above character
  if (character.showBubble && sc.subtitle) {
    const bubbleText = sc.subtitle.length > 10 ? sc.subtitle.slice(0, 10) + '…' : sc.subtitle;
    const bubbleFontSize = Math.round(emojiSize * 0.28);
    ctx.font = `bold ${bubbleFontSize}px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textW = ctx.measureText(bubbleText).width;
    const padX = bubbleFontSize * 0.6;
    const padY = bubbleFontSize * 0.4;
    const bw = textW + padX * 2;
    const bh = bubbleFontSize + padY * 2;
    const bx = x - bw / 2;
    const by = y - emojiSize / 2 - bh - bubbleFontSize * 0.5;

    // Bubble body
    roundRect(ctx, bx, by, bw, bh, bubbleFontSize * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Bubble tail
    const tailX = x;
    const tailTipY = y - emojiSize / 2 - bubbleFontSize * 0.3;
    ctx.beginPath();
    ctx.moveTo(tailX - bubbleFontSize * 0.3, by + bh - 1);
    ctx.lineTo(tailX, tailTipY);
    ctx.lineTo(tailX + bubbleFontSize * 0.3, by + bh - 1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();

    // Bubble text
    ctx.fillStyle = '#1a1a2e';
    ctx.fillText(bubbleText, x, by + bh / 2);
  }
}

// ── 이미지 피커 ───────────────────────────────────────────────────────────────
function ImagePicker({ query, dallePrompt, onSelect, onClose }: {
  query: string; dallePrompt: string;
  onSelect: (url: string, src: Scene['imageSource']) => void; onClose: () => void;
}) {
  const [src, setSrc] = useState<'pixabay' | 'pexels' | 'dalle' | 'custom'>('pixabay');
  const [q, setQ] = useState(query);
  const [dp, setDp] = useState(dallePrompt || query);
  const [customUrl, setCustomUrl] = useState('');
  const [images, setImages] = useState<PixImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = async (qVal: string, srcVal: string) => {
    if (srcVal === 'custom') return;
    setLoading(true); setErr('');
    const p = new URLSearchParams({ q: qVal, source: srcVal, per_page: '9' });
    if (srcVal === 'dalle') p.set('dalle_prompt', qVal);
    const res = await fetch(`/api/shorts/images?${p}`);
    const d = await res.json() as { images?: PixImage[]; error?: string };
    if (d.error) setErr(d.error); else setImages(d.images ?? []);
    setLoading(false);
  };

  useEffect(() => { if (src !== 'custom' && src !== 'dalle') search(q, src); }, [src]); // eslint-disable-line

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center gap-2">
          {(['pixabay','pexels','dalle','custom'] as const).map(s => (
            <button key={s} onClick={() => setSrc(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${src === s ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500'}`}>
              {s === 'pixabay' ? '🖼️ Pixabay' : s === 'pexels' ? '📷 Pexels' : s === 'dalle' ? '🤖 DALL-E' : '🔗 URL'}
            </button>
          ))}
          <button onClick={onClose} className="ml-auto w-7 h-7 bg-gray-100 rounded-full text-gray-400 flex items-center justify-center">✕</button>
        </div>
        <div className="px-5 py-3 border-b">
          {src === 'custom' ? (
            <div className="flex gap-2">
              <input value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="https://..." className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
              <button onClick={() => { onSelect(customUrl, 'custom'); onClose(); }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold">적용</button>
            </div>
          ) : src === 'dalle' ? (
            <div className="space-y-2">
              <textarea value={dp} onChange={e => setDp(e.target.value)} rows={2} placeholder="이미지 설명 (영어 권장)..."
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none" />
              <button onClick={() => search(dp, 'dalle')} disabled={loading}
                className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-40">
                {loading ? '🤖 생성 중...' : '🤖 DALL-E 3으로 생성 ($0.08)'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={q} onChange={e => { setQ(e.target.value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => search(e.target.value, src), 500); }}
                onKeyDown={e => e.key === 'Enter' && search(q, src)}
                placeholder="영어 검색어..." className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
              <button onClick={() => search(q, src)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold">검색</button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {err && <div className="text-red-500 text-sm mb-2 bg-red-50 rounded-xl p-3">{err}</div>}
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-gray-400">
              <div className="w-5 h-5 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
              {src === 'dalle' ? 'DALL-E 생성 중 (~15초)...' : '불러오는 중...'}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images.map(img => (
                <button key={img.id} onClick={() => { onSelect(img.url, src); onClose(); }}
                  className="group relative rounded-xl overflow-hidden hover:ring-4 hover:ring-indigo-400 transition-all" style={{ aspectRatio: '9/16' }}>
                  <img src={img.thumb} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <span className="text-white text-2xl bg-black/40 w-10 h-10 rounded-full flex items-center justify-center">✓</span>
                  </div>
                  <div className="absolute bottom-1 right-1 text-[8px] text-white/60 bg-black/30 px-1 rounded">©{img.author}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
export default function StudioPage() {
  const { companySettings } = useStore();
  const provider = companySettings.globalAIConfig?.provider ?? 'gemini';
  const apiKey = companySettings.globalAIConfig?.apiKey ?? '';

  // 씬 + 설정
  const [scenes, setScenes] = useState<Scene[]>([DEFAULT_SCENE()]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selectedId, setSelectedId] = useState<string>(scenes[0]?.id ?? '');
  const [title, setTitle] = useState('새 프로젝트');
  const [leftTab, setLeftTab] = useState<LeftTab>('blog');

  // 캐릭터
  const [character, setCharacter] = useState<Character>(DEFAULT_CHARACTER);

  // TTS 모드
  const [ttsMode, setTtsMode] = useState<TtsMode>('webSpeech');
  const [ttsVoiceId, setTtsVoiceId] = useState('ko-KR-SunHiNeural');
  const [supertonicVoiceId, setSupertonicVoiceId] = useState('F3');
  const [ttsError, setTtsError] = useState('');
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // 블로그
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogSearch, setBlogSearch] = useState('');
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);

  // 생성
  const [generating, setGenerating] = useState(false);
  const [fetchingImages, setFetchingImages] = useState(false);
  const [genError, setGenError] = useState('');

  // 미리보기
  const [playing, setPlaying] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(0);

  // 이미지 피커
  const [pickerSceneId, setPickerSceneId] = useState<string | null>(null);

  // 내보내기
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState('');

  // 배치 자동화
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchLog, setBatchLog] = useState<string[]>([]);

  // 프로젝트 저장/불러오기
  const [savedProjects, setSavedProjects] = useState<{ name: string; ts: number }[]>([]);
  const [showProjectMenu, setShowProjectMenu] = useState(false);

  // BGM 프리셋 미리듣기
  const [bgmPreviewId, setBgmPreviewId] = useState<string | null>(null);
  const bgmPreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  // 미리보기 BGM
  const previewBgmRef = useRef<HTMLAudioElement | null>(null);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const [bgmError, setBgmError] = useState('');

  // 음성 목록
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // 애니메이션 타임스탬프 (캐릭터 bounce용)
  const animTimeRef = useRef<number>(0);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewAnimRef = useRef<number>(0);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedImages = useRef<Map<string, HTMLImageElement>>(new Map());

  const sel = scenes.find(s => s.id === selectedId) ?? scenes[0];
  const totalDuration = scenes.reduce((s, sc) => s + sc.duration, 0);

  // ── 프로젝트 저장/불러오기 ─────────────────────────────────────────────────
  useEffect(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('loov_proj_'));
    setSavedProjects(keys.map(k => {
      try { const d = JSON.parse(localStorage.getItem(k) ?? '{}'); return { name: d.title ?? k, ts: d.ts ?? 0 }; }
      catch { return { name: k, ts: 0 }; }
    }).sort((a, b) => b.ts - a.ts));
  }, [showProjectMenu]);

  const saveProject = () => {
    const data = { title, scenes, settings, character, ts: Date.now() };
    const key = `loov_proj_${Date.now()}`;
    localStorage.setItem(key, JSON.stringify(data));
    alert(`"${title}" 저장 완료`);
    setShowProjectMenu(false);
  };

  const loadProject = (key: string) => {
    try {
      const d = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (d.scenes) { setScenes(d.scenes); setSelectedId(d.scenes[0]?.id ?? ''); }
      if (d.title) setTitle(d.title);
      if (d.settings) setSettings(d.settings);
      if (d.character) setCharacter(d.character);
      setShowProjectMenu(false);
    } catch { alert('불러오기 실패'); }
  };

  const deleteProject = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.removeItem(key);
    setSavedProjects(prev => prev.filter(p => `loov_proj_${p.ts}` !== key));
  };

  // ── 씬 분할 ────────────────────────────────────────────────────────────────
  const splitScene = (id: string) => {
    const sc = scenes.find(s => s.id === id);
    if (!sc || !sc.narration) return;
    const sentences = sc.narration.split(/(?<=[.!?。！？\n])\s+/).filter(s => s.trim());
    if (sentences.length < 2) { alert('분할할 문장이 부족합니다 (마침표/줄바꿈 기준)'); return; }
    const perDur = Math.max(3, Math.round(sc.duration / sentences.length));
    const newScenes = sentences.map((sent, i) => ({
      ...DEFAULT_SCENE(),
      narration: sent.trim(),
      subtitle: sc.subtitle && i === 0 ? sc.subtitle : '',
      imageUrl: i === 0 ? sc.imageUrl : '',
      imageQuery: sc.imageQuery,
      dallePrompt: sc.dallePrompt,
      imageSource: sc.imageSource,
      imageEffect: sc.imageEffect,
      transition: sc.transition,
      duration: perDur,
    }));
    setScenes(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const next = [...prev];
      next.splice(idx, 1, ...newScenes);
      return next;
    });
    setSelectedId(newScenes[0].id);
  };

  // ── 전체 자막 자동 완성 ────────────────────────────────────────────────────
  const autoFillSubtitles = () => {
    setScenes(prev => prev.map(sc => {
      if (sc.subtitle || !sc.narration) return sc;
      const clean = sc.narration.replace(/[^가-힣a-zA-Z0-9\s]/g, '').trim();
      const words = clean.split(/\s+/);
      let sub = '';
      for (const w of words) { if ((sub + w).length <= 12) sub += (sub ? ' ' : '') + w; else break; }
      return { ...sc, subtitle: sub };
    }));
  };

  // ── 배치 자동화 ────────────────────────────────────────────────────────────
  const runBatch = async () => {
    const posts = blogPosts.filter(p => batchSelected.has(p.id));
    if (!posts.length) return;
    setBatchRunning(true); setBatchLog([]);
    for (const post of posts) {
      setBatchLog(prev => [...prev, `⏳ "${post.title}" 처리 중...`]);
      try {
        let content = post.content;
        if (!content) {
          const r = await fetch(`/api/shorts/blog?url=${encodeURIComponent(post.url)}`);
          if (r.ok) content = ((await r.json()) as { content?: string }).content ?? '';
        }
        const topic = `제목: ${post.title}\n카테고리: ${post.categories.join(', ')}\n내용 요약: ${content.slice(0, 500)}`;
        const res = await fetch('/api/shorts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, duration: 60, tone: 'info', platform: settings.platform, provider, apiKey }),
        });
        const data = await res.json() as { title?: string; scenes?: { id: number; duration: number; narration: string; subtitle: string; image_query: string; dalle_prompt: string }[]; error?: string };
        if (data.error) { setBatchLog(prev => [...prev, `❌ 실패: ${data.error}`]); continue; }
        const newScenes = (data.scenes ?? []).map(s => ({ ...DEFAULT_SCENE(), duration: s.duration, narration: s.narration, subtitle: s.subtitle, imageQuery: s.image_query, dallePrompt: s.dalle_prompt ?? '', imageEffect: 'zoom-in' as ImageEffect }));
        const projData = { title: data.title ?? post.title, scenes: newScenes, settings, ts: Date.now() };
        localStorage.setItem(`loov_proj_${Date.now()}`, JSON.stringify(projData));
        setBatchLog(prev => [...prev, `✅ "${post.title}" 저장 완료`]);
      } catch (e) { setBatchLog(prev => [...prev, `❌ 오류: ${String(e)}`]); }
      await new Promise(r => setTimeout(r, 1000));
    }
    setBatchRunning(false);
    setBatchLog(prev => [...prev, `🎉 배치 완료! ${posts.length}개 프로젝트가 저장되었습니다.`]);
  };

  // ── 음성 초기화 ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('ko'));
      if (v.length) setVoices(v);
      else setVoices(window.speechSynthesis.getVoices());
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  // ── 이미지 프리로드 ─────────────────────────────────────────────────────────
  const preloadImage = useCallback((url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      if (loadedImages.current.has(url)) { resolve(loadedImages.current.get(url)!); return; }
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { loadedImages.current.set(url, img); resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }, []);

  // ── 씬 수정 ────────────────────────────────────────────────────────────────
  const updateScene = (id: string, patch: Partial<Scene>) =>
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  const deleteScene = (id: string) => {
    setScenes(prev => { const next = prev.filter(s => s.id !== id); if (next.length === 0) return [DEFAULT_SCENE()]; return next; });
    if (selectedId === id) setSelectedId(scenes[0]?.id ?? '');
  };
  const addScene = () => {
    const ns = DEFAULT_SCENE();
    setScenes(prev => [...prev, ns]);
    setSelectedId(ns.id);
  };

  // ── 드래그 재정렬 ──────────────────────────────────────────────────────────
  const dragIdx = useRef<number | null>(null);
  const onDragStart = (i: number) => { dragIdx.current = i; };
  const onDrop = (i: number) => {
    if (dragIdx.current === null || dragIdx.current === i) return;
    setScenes(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx.current!, 1);
      next.splice(i, 0, moved);
      return next;
    });
    dragIdx.current = null;
  };

  // ── 블로그 로드 ────────────────────────────────────────────────────────────
  const loadBlog = useCallback(async () => {
    setBlogLoading(true);
    const res = await fetch('/api/shorts/blog');
    if (res.ok) setBlogPosts((await res.json() as { posts: BlogPost[] }).posts);
    setBlogLoading(false);
  }, []);

  useEffect(() => { loadBlog(); }, [loadBlog]);

  // ── 블로그 → 스크립트 생성 ─────────────────────────────────────────────────
  const generateFromPost = async (post: BlogPost) => {
    setSelectedPost(post);
    setGenerating(true); setGenError('');
    try {
      let content = post.content;
      if (!content) {
        const cRes = await fetch(`/api/shorts/blog?url=${encodeURIComponent(post.url)}`);
        if (cRes.ok) content = ((await cRes.json()) as { content?: string }).content ?? '';
      }
      const topic = `제목: ${post.title}\n카테고리: ${post.categories.join(', ')}\n내용 요약: ${content.slice(0, 500)}`;

      const res = await fetch('/api/shorts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, duration: 60, tone: 'info', platform: settings.platform, provider, apiKey }),
      });
      const data = await res.json() as { title?: string; scenes?: { id: number; duration: number; narration: string; subtitle: string; image_query: string; dalle_prompt: string }[]; error?: string };
      if (data.error) { setGenError(data.error); return; }
      setTitle(data.title ?? post.title);
      const newScenes = (data.scenes ?? []).map(s => ({
        ...DEFAULT_SCENE(),
        duration: s.duration, narration: s.narration, subtitle: s.subtitle,
        imageQuery: s.image_query, dallePrompt: s.dalle_prompt ?? '',
        imageEffect: 'zoom-in' as ImageEffect,
      }));
      setScenes(newScenes);
      setSelectedId(newScenes[0]?.id ?? '');
      setLeftTab('scenes');
      setTimeout(() => autoFetchImages(newScenes), 500);
    } catch (e) { setGenError(String(e)); }
    finally { setGenerating(false); }
  };

  // ── 이미지 자동 검색 ────────────────────────────────────────────────────────
  const autoFetchImages = useCallback(async (sceneList: Scene[]) => {
    setFetchingImages(true);
    const updated = [...sceneList];
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].imageUrl || !updated[i].imageQuery) continue;
      try {
        const res = await fetch(`/api/shorts/images?q=${encodeURIComponent(updated[i].imageQuery)}&source=pixabay&per_page=3`);
        if (res.ok) {
          const d = await res.json() as { images?: PixImage[] };
          if (d.images?.[0]) {
            updated[i] = { ...updated[i], imageUrl: d.images[0].url };
            await preloadImage(d.images[0].url).catch(() => {});
          }
        }
      } catch { /* continue */ }
    }
    setScenes([...updated]);
    setFetchingImages(false);
  }, [preloadImage]);

  // ── Edge-TTS (Microsoft Neural, 무료) ─────────────────────────────────────
  const playTtsMaker = useCallback(async (text: string, voiceId: string, rate: number): Promise<HTMLAudioElement | null> => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    setTtsError('');
    try {
      const res = await fetch('/api/shorts/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: voiceId, speed: rate }),
      });
      const data = await res.json() as { audio?: string; error?: string };
      if (!res.ok || data.error) {
        setTtsError(data.error ?? `TTS 오류 (${res.status})`);
        return null;
      }
      if (!data.audio) return null;
      const audio = new Audio(data.audio);
      audio.volume = settingsRef.current.ttsVolume ?? 1.0;
      ttsAudioRef.current = audio;
      audio.play().catch((e) => setTtsError('오디오 재생 실패: ' + String(e)));
      return audio;
    } catch (e) {
      setTtsError('Edge-TTS 연결 실패: ' + String(e));
      return null;
    }
  }, []);

  // ── Supertonic TTS (고품질 On-device, NAS Docker) ──────────────────────────
  const playSupertonic = useCallback(async (text: string, voiceId: string, speed: number): Promise<HTMLAudioElement | null> => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    setTtsError('');
    try {
      const res = await fetch('/api/shorts/supertonic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: voiceId, speed, lang: 'ko' }),
      });
      const data = await res.json() as { audio?: string; error?: string };
      if (!res.ok || data.error) {
        setTtsError(data.error ?? `Supertonic 오류 (${res.status})`);
        return null;
      }
      if (!data.audio) return null;
      const audio = new Audio(data.audio);
      audio.volume = settingsRef.current.ttsVolume ?? 1.0;
      ttsAudioRef.current = audio;
      audio.play().catch((e) => setTtsError('오디오 재생 실패: ' + String(e)));
      return audio;
    } catch (e) {
      setTtsError('Supertonic 연결 실패: ' + String(e));
      return null;
    }
  }, []);

  // ── 프리뷰 렌더 ────────────────────────────────────────────────────────────
  const stopPreview = useCallback(() => {
    setPlaying(false); setPreviewIdx(0);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    cancelAnimationFrame(previewAnimRef.current);
    window.speechSynthesis?.cancel();
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    // BGM 정지
    if (previewBgmRef.current) {
      previewBgmRef.current.pause();
      previewBgmRef.current = null;
    }
    setBgmPlaying(false);
    setBgmError('');
  }, []);

  // Ref to always have latest character state in rAF loop
  const characterRef = useRef<Character>(character);
  useEffect(() => { characterRef.current = character; }, [character]);

  const settingsRef = useRef<Settings>(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // BGM 볼륨 실시간 반영
  useEffect(() => {
    if (previewBgmRef.current) {
      previewBgmRef.current.volume = settings.bgmVolume;
    }
  }, [settings.bgmVolume]);

  const renderPreviewFrame = useCallback((sceneList: Scene[], idx: number, startTime: number) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const cw = canvas.width, ch = canvas.height;
    const sc = sceneList[idx];
    if (!sc) return;

    const elapsed = (Date.now() - startTime) / 1000;
    const progress = Math.min(elapsed / sc.duration, 1);
    const currentSettings = settingsRef.current;
    const currentCharacter = characterRef.current;

    // 배경
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, cw, ch);

    // Transition: slide offset / flash calculation
    let slideOffsetX = 0, slideOffsetY = 0;
    const transProgress = Math.min(progress / 0.25, 1); // 0→1 in first 25%

    if (sc.transition === 'slide-up' && progress < 0.25) {
      slideOffsetY = ch * 0.12 * (1 - transProgress);
    } else if (sc.transition === 'slide-left' && progress < 0.25) {
      slideOffsetX = cw * 0.2 * (1 - transProgress);
    } else if (sc.transition === 'slide-right' && progress < 0.25) {
      slideOffsetX = -cw * 0.2 * (1 - transProgress);
    }

    if (slideOffsetX !== 0 || slideOffsetY !== 0) {
      ctx.save();
      ctx.translate(slideOffsetX, -slideOffsetY);
    }

    // 이미지 + Ken Burns
    const img = sc.imageUrl ? loadedImages.current.get(sc.imageUrl) : null;
    if (img) {
      drawKenBurns(ctx, img, sc.imageEffect, progress, cw, ch);
    } else if (sc.imageUrl) {
      preloadImage(sc.imageUrl).catch(() => {});
    }

    // 그라데이션 오버레이
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, 'rgba(0,0,0,0.25)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    // 자막
    drawSubtitle(ctx, sc.subtitle, currentSettings.subtitleStyle, cw, ch);

    // 캐릭터
    animTimeRef.current += 0.016;
    drawCharacter(ctx, currentCharacter, sc, cw, ch, animTimeRef.current);

    if (slideOffsetX !== 0 || slideOffsetY !== 0) {
      ctx.restore();
    }

    // Overlay transitions (drawn on top)
    if (sc.transition === 'fade' && progress < 0.25) {
      const alpha = 1 - transProgress;
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(0, 0, cw, ch);
    } else if (sc.transition === 'zoom' && progress < 0.3) {
      const zoomProgress = Math.min(progress / 0.3, 1);
      const scale = 1 + (1 - zoomProgress) * 0.4;
      ctx.save();
      ctx.globalAlpha = zoomProgress;
      ctx.translate(cw / 2, ch / 2);
      ctx.scale(scale, scale);
      ctx.translate(-cw / 2, -ch / 2);
      ctx.restore();
      ctx.fillStyle = `rgba(0,0,0,${1 - zoomProgress})`;
      ctx.fillRect(0, 0, cw, ch);
    } else if (sc.transition === 'flash' && progress < 0.15) {
      const flashAlpha = 1 - (progress / 0.15);
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.9})`;
      ctx.fillRect(0, 0, cw, ch);
    } else if (sc.transition === 'dissolve' && progress < 0.25) {
      const alpha = 1 - transProgress;
      ctx.fillStyle = `rgba(20,20,40,${alpha})`;
      ctx.fillRect(0, 0, cw, ch);
      // pixel dissolve approximation: draw noisy overlay
      ctx.globalAlpha = alpha * 0.7;
      for (let px = 0; px < 40; px++) {
        const rx = Math.random() * cw, ry = Math.random() * ch;
        ctx.fillStyle = `rgba(${Math.random()*80},${Math.random()*80},${Math.random()*120},0.5)`;
        ctx.fillRect(rx, ry, cw / 30, ch / 50);
      }
      ctx.globalAlpha = 1;
    }

    // 진행 바
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, ch - 3, cw, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(0, ch - 3, cw * progress, 3);

    previewAnimRef.current = requestAnimationFrame(() => renderPreviewFrame(sceneList, idx, startTime));
  }, [preloadImage]);

  const playPreviewScene = useCallback(async (idx: number, sceneList: Scene[]) => {
    if (idx >= sceneList.length) { stopPreview(); return; }
    const sc = sceneList[idx];
    setPreviewIdx(idx);
    cancelAnimationFrame(previewAnimRef.current);
    renderPreviewFrame(sceneList, idx, Date.now());

    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    let sceneDurationMs = sc.duration * 1000;

    if (sc.narration) {
      const currentSettings = settingsRef.current;
      const waitForAudio = async (audio: HTMLAudioElement | null) => {
        if (!audio) return;
        await new Promise<void>(resolve => {
          const onMeta = () => {
            if (audio.duration && !isNaN(audio.duration)) {
              sceneDurationMs = Math.max(sceneDurationMs, audio.duration * 1000 + 300);
            }
            resolve();
          };
          if (audio.readyState >= 1) { onMeta(); }
          else { audio.addEventListener('loadedmetadata', onMeta, { once: true }); setTimeout(resolve, 500); }
        });
      };
      if (ttsMode === 'ttsmaker') {
        const audio = await playTtsMaker(sc.narration, ttsVoiceId, currentSettings.voiceRate);
        await waitForAudio(audio);
      } else if (ttsMode === 'supertonic') {
        const audio = await playSupertonic(sc.narration, supertonicVoiceId, currentSettings.voiceRate);
        await waitForAudio(audio);
      } else {
        const u = new SpeechSynthesisUtterance(sc.narration);
        u.lang = 'ko-KR'; u.rate = currentSettings.voiceRate; u.pitch = currentSettings.voicePitch;
        u.volume = currentSettings.ttsVolume ?? 1.0;
        const koVoices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('ko'));
        if (koVoices[currentSettings.voiceIdx]) u.voice = koVoices[currentSettings.voiceIdx];
        window.speechSynthesis.speak(u);
      }
    }

    previewTimerRef.current = setTimeout(() => playPreviewScene(idx + 1, sceneList), sceneDurationMs);
  }, [renderPreviewFrame, stopPreview, ttsMode, ttsVoiceId, supertonicVoiceId, playTtsMaker, playSupertonic]);

  const startPreview = () => {
    if (!scenes.length) return;
    setPlaying(true);
    scenes.forEach(s => { if (s.imageUrl) preloadImage(s.imageUrl).catch(() => {}); });
    // 미리보기 BGM 시작
    setBgmError('');
    setBgmPlaying(false);
    if (previewBgmRef.current) {
      previewBgmRef.current.pause();
      previewBgmRef.current = null;
    }
    if (settings.bgmUrl) {
      // /api/proxy-audio 를 통해 프록시로 로드 (CDN CORS/Referrer 문제 우회)
      const proxyUrl = `/api/proxy-audio?url=${encodeURIComponent(settings.bgmUrl)}`;
      const bgm = new Audio(proxyUrl);
      bgm.loop = true;
      bgm.volume = Math.min(1, Math.max(0, settings.bgmVolume));
      bgm.onerror = () => setBgmError('BGM 로드 실패 — URL을 확인하거나 다른 음악을 선택하세요');
      bgm.onplaying = () => setBgmPlaying(true);
      bgm.onpause = () => setBgmPlaying(false);
      previewBgmRef.current = bgm;
      bgm.play().catch(e => setBgmError('BGM 재생 실패: ' + String(e)));
    }
    playPreviewScene(0, scenes);
  };

  useEffect(() => () => {
    stopPreview();
    cancelAnimationFrame(previewAnimRef.current);
    bgmPreviewAudioRef.current?.pause();
  }, [stopPreview]);

  // ── BGM 미리듣기 ──────────────────────────────────────────────────────────
  const toggleBgmPreview = (preset: BgmPreset) => {
    if (bgmPreviewId === preset.id) {
      bgmPreviewAudioRef.current?.pause();
      bgmPreviewAudioRef.current = null;
      setBgmPreviewId(null);
    } else {
      bgmPreviewAudioRef.current?.pause();
      const audio = new Audio(preset.url);
      audio.volume = 0.4;
      audio.play().catch(() => {});
      audio.onended = () => { setBgmPreviewId(null); bgmPreviewAudioRef.current = null; };
      bgmPreviewAudioRef.current = audio;
      setBgmPreviewId(preset.id);
    }
  };

  // ── Canvas 영상 내보내기 ────────────────────────────────────────────────────
  const exportVideo = useCallback(async () => {
    const canvas = exportCanvasRef.current;
    if (!canvas || !scenes.length) return;
    setExporting(true); setExportProgress(0); setDownloadUrl('');

    const cw = 1080, ch = 1920;
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d')!;

    for (const sc of scenes) {
      if (sc.imageUrl) await preloadImage(sc.imageUrl).catch(() => {});
    }

    let bgmAudio: HTMLAudioElement | null = null;
    const canvasStream = canvas.captureStream(30);
    if (settings.bgmUrl) {
      try {
        const audioCtx = new AudioContext();
        bgmAudio = new Audio(settings.bgmUrl);
        bgmAudio.crossOrigin = 'anonymous';
        bgmAudio.loop = true;
        bgmAudio.volume = settings.bgmVolume;
        const src = audioCtx.createMediaElementSource(bgmAudio);
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        canvasStream.addTrack(dest.stream.getAudioTracks()[0]);
        bgmAudio.play();
      } catch { /* BGM 없어도 진행 */ }
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 10_000_000 });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    const done = new Promise<void>(res => { recorder.onstop = () => res(); });
    recorder.start(200);

    const FPS = 30;
    let totalRendered = 0;
    const totalFrames = scenes.reduce((s, sc) => s + sc.duration * FPS, 0);
    let exportAnimTime = 0;

    for (const sc of scenes) {
      const img = sc.imageUrl ? loadedImages.current.get(sc.imageUrl) : null;
      const scFrames = sc.duration * FPS;
      const TRANS_FRAMES = sc.transition !== 'none' ? Math.min(FPS * 0.4, scFrames * 0.2) : 0;

      for (let f = 0; f < scFrames; f++) {
        const progress = f / scFrames;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cw, ch);

        // Slide transition
        let slideOffX = 0, slideOffY = 0;
        const tp = Math.min(f / Math.max(TRANS_FRAMES, 1), 1);
        if (sc.transition === 'slide-up' && f < TRANS_FRAMES)    slideOffY = ch * 0.12 * (1 - tp);
        if (sc.transition === 'slide-left' && f < TRANS_FRAMES)   slideOffX = cw * 0.2 * (1 - tp);
        if (sc.transition === 'slide-right' && f < TRANS_FRAMES)  slideOffX = -cw * 0.2 * (1 - tp);

        if (slideOffX !== 0 || slideOffY !== 0) { ctx.save(); ctx.translate(slideOffX, -slideOffY); }

        if (img) drawKenBurns(ctx, img, sc.imageEffect, progress, cw, ch);

        const grad = ctx.createLinearGradient(0, 0, 0, ch);
        grad.addColorStop(0, 'rgba(0,0,0,0.3)'); grad.addColorStop(0.6, 'rgba(0,0,0,0.05)'); grad.addColorStop(1, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, cw, ch);

        drawSubtitle(ctx, sc.subtitle, settings.subtitleStyle, cw, ch);
        exportAnimTime += 1 / FPS;
        drawCharacter(ctx, character, sc, cw, ch, exportAnimTime);

        if (slideOffX !== 0 || slideOffY !== 0) ctx.restore();

        // Overlay transitions
        if (sc.transition === 'fade' && f < TRANS_FRAMES) {
          ctx.fillStyle = `rgba(0,0,0,${1 - tp})`;
          ctx.fillRect(0, 0, cw, ch);
        } else if (sc.transition === 'flash' && f < TRANS_FRAMES) {
          ctx.fillStyle = `rgba(255,255,255,${(1 - tp) * 0.9})`;
          ctx.fillRect(0, 0, cw, ch);
        } else if (sc.transition === 'dissolve' && f < TRANS_FRAMES) {
          ctx.fillStyle = `rgba(20,20,40,${1 - tp})`;
          ctx.fillRect(0, 0, cw, ch);
        }

        totalRendered++;
        if (f % FPS === 0) setExportProgress(Math.round((totalRendered / totalFrames) * 100));
        await new Promise(r => setTimeout(r, 1000 / FPS));
      }
    }

    recorder.stop();
    bgmAudio?.pause();
    await done;

    const blob = new Blob(chunks, { type: mimeType });
    setDownloadUrl(URL.createObjectURL(blob));
    setExporting(false);
    setExportProgress(100);
  }, [scenes, settings, character, preloadImage]);

  const filteredPosts = blogPosts.filter(p =>
    !blogSearch || p.title.toLowerCase().includes(blogSearch.toLowerCase()) ||
    p.categories.some(c => c.toLowerCase().includes(blogSearch.toLowerCase()))
  );

  const koVoices = voices.filter(v => v.lang.startsWith('ko'));

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      {/* 이미지 피커 */}
      {pickerSceneId && (
        <ImagePicker
          query={scenes.find(s => s.id === pickerSceneId)?.imageQuery ?? ''}
          dallePrompt={scenes.find(s => s.id === pickerSceneId)?.dallePrompt ?? ''}
          onSelect={(url, src) => updateScene(pickerSceneId, { imageUrl: url, imageSource: src })}
          onClose={() => setPickerSceneId(null)}
        />
      )}
      <canvas ref={exportCanvasRef} className="hidden" />

      {/* ── 상단 툴바 ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <a href="/dashboard/shorts" className="text-gray-400 hover:text-white transition-colors text-sm">←</a>
        <div className="w-px h-4 bg-gray-700" />
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="bg-transparent text-white font-bold text-sm focus:outline-none border-b border-transparent focus:border-gray-500 px-1 min-w-0 max-w-xs" />
        <div className="flex items-center gap-1 ml-2">
          {PLATFORMS.map(p => (
            <button key={p.v} onClick={() => setSettings(s => ({ ...s, platform: p.v }))}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${settings.platform === p.v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">{scenes.length}장면 · {totalDuration}초</span>

          {/* 프로젝트 저장/불러오기 */}
          <div className="relative">
            <button onClick={() => setShowProjectMenu(v => !v)}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs font-bold transition-colors">
              💾 프로젝트
            </button>
            {showProjectMenu && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-2 border-b border-gray-700">
                  <button onClick={saveProject} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold text-white transition-colors">
                    💾 현재 프로젝트 저장
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {savedProjects.length === 0 ? (
                    <div className="py-6 text-center text-xs text-gray-500">저장된 프로젝트 없음</div>
                  ) : savedProjects.map(p => {
                    const key = `loov_proj_${p.ts}`;
                    return (
                      <div key={key} onClick={() => loadProject(key)}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700 cursor-pointer transition-colors border-b border-gray-700/50">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white font-medium truncate">{p.name}</div>
                          <div className="text-[10px] text-gray-500">{new Date(p.ts).toLocaleString('ko-KR')}</div>
                        </div>
                        <button onClick={e => deleteProject(key, e)} className="text-gray-600 hover:text-red-400 text-xs px-1 transition-colors">✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 자막 자동완성 */}
          <button onClick={autoFillSubtitles}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs font-bold transition-colors"
            title="나레이션에서 핵심 단어를 자동으로 자막에 채웁니다">
            📝 자막 자동
          </button>

          <button onClick={addScene}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs font-bold transition-colors">
            + 장면
          </button>
          <button onClick={exporting ? undefined : exportVideo} disabled={exporting}
            className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>
            {exporting ? `⏳ ${exportProgress}%` : '⬇️ 영상 내보내기'}
          </button>
        </div>
      </div>

      {/* ── 메인 3패널 ── */}
      <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-1 min-h-0">

        {/* ── 왼쪽: 블로그 / 씬 리스트 ── */}
        <div className="w-72 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
          {/* 탭 */}
          <div className="flex border-b border-gray-800">
            {[{ k: 'blog', l: '📰 블로그' }, { k: 'scenes', l: `🎬 씬 (${scenes.length})` }].map(t => (
              <button key={t.k} onClick={() => setLeftTab(t.k as LeftTab)}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${leftTab === t.k ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}>
                {t.l}
              </button>
            ))}
          </div>

          {/* 블로그 탭 */}
          {leftTab === 'blog' && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="p-3 border-b border-gray-800 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-bold text-gray-300">2days.kr</div>
                  <button onClick={() => setBatchMode(v => !v)}
                    className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${batchMode ? 'bg-amber-600 text-white' : 'text-gray-500 hover:text-white border border-gray-700'}`}>
                    {batchMode ? '✕ 배치 취소' : '⚡ 배치 선택'}
                  </button>
                  <button onClick={loadBlog} className="text-[10px] text-gray-500 hover:text-white">↻</button>
                </div>
                <input value={blogSearch} onChange={e => setBlogSearch(e.target.value)}
                  placeholder="포스트 검색..." className="w-full bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                {batchMode && batchSelected.size > 0 && !batchRunning && (
                  <button onClick={runBatch}
                    className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[10px] font-bold transition-colors">
                    ⚡ {batchSelected.size}개 자동 생성 (저장)
                  </button>
                )}
              </div>

              {/* 배치 로그 */}
              {batchLog.length > 0 && (
                <div className="p-3 border-b border-gray-800 bg-gray-900/50 max-h-28 overflow-y-auto space-y-0.5">
                  {batchLog.map((l, i) => <div key={i} className="text-[10px] text-gray-300">{l}</div>)}
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {blogLoading ? (
                  <div className="flex items-center justify-center h-32 gap-2 text-gray-500 text-xs">
                    <div className="w-4 h-4 border-2 border-gray-500 border-t-indigo-400 rounded-full animate-spin" />로딩 중...
                  </div>
                ) : filteredPosts.map(post => (
                  <div key={post.id}
                    onClick={batchMode ? () => setBatchSelected(prev => { const n = new Set(prev); n.has(post.id) ? n.delete(post.id) : n.add(post.id); return n; }) : undefined}
                    className={`flex gap-2 p-3 border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors ${selectedPost?.id === post.id ? 'bg-gray-800' : ''} ${batchMode && batchSelected.has(post.id) ? 'bg-amber-900/30 border-l-2 border-l-amber-500' : ''}`}>
                    {batchMode && (
                      <div className={`flex-shrink-0 w-4 h-4 rounded border-2 mt-0.5 flex items-center justify-center text-[8px] font-black transition-colors ${batchSelected.has(post.id) ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-600'}`}>
                        {batchSelected.has(post.id) ? '✓' : ''}
                      </div>
                    )}
                    {post.image && <img src={post.image} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-200 line-clamp-2 leading-snug mb-1">{post.title}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">{post.date}</span>
                        {post.categories[0] && <span className="text-[9px] bg-indigo-900/50 text-indigo-400 px-1.5 py-0.5 rounded">{post.categories[0]}</span>}
                      </div>
                    </div>
                    {!batchMode && (
                      <button onClick={() => generateFromPost(post)} disabled={generating}
                        className="self-center flex-shrink-0 px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold disabled:opacity-40 transition-colors">
                        {generating && selectedPost?.id === post.id ? '...' : '영상'}
                      </button>
                    )}
                  </div>
                ))}
                {!blogLoading && filteredPosts.length === 0 && (
                  <div className="text-center text-gray-600 py-12 text-xs">포스트 없음</div>
                )}
              </div>
              {genError && <div className="p-3 text-xs text-red-400 bg-red-900/30 border-t border-red-800">{genError}</div>}
            </div>
          )}

          {/* 씬 탭 */}
          {leftTab === 'scenes' && (
            <div className="flex-1 overflow-y-auto">
              {fetchingImages && (
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-900/30 text-xs text-indigo-400">
                  <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  이미지 자동 검색 중...
                </div>
              )}
              {scenes.map((sc, i) => (
                <div key={sc.id} draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(i)}
                  onClick={() => setSelectedId(sc.id)}
                  className={`flex gap-2 p-2.5 border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors ${selectedId === sc.id ? 'bg-gray-800 border-l-2 border-l-indigo-500' : ''}`}>
                  {/* 썸네일 */}
                  <div className="relative flex-shrink-0 cursor-pointer" onClick={e => { e.stopPropagation(); setPickerSceneId(sc.id); }}>
                    <div className="w-12 bg-gray-700 rounded-lg overflow-hidden" style={{ aspectRatio: '9/16' }}>
                      {sc.imageUrl ? <img src={sc.imageUrl} alt="" className="w-full h-full object-cover" /> : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">📷</div>
                      )}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 rounded-lg">
                      <span className="text-white text-xs">🔄</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-4 h-4 bg-gray-700 rounded text-[10px] text-gray-400 flex items-center justify-center font-bold">{i+1}</span>
                      <span className="text-[10px] text-gray-500">{sc.duration}초</span>
                      <span className="text-[9px] text-gray-600">{sc.imageEffect}</span>
                      {sc.characterAppears && <span className="text-[9px] text-purple-400">🎭</span>}
                    </div>
                    <div className="text-xs text-gray-300 line-clamp-2 leading-snug">{sc.narration || <span className="text-gray-600 italic">나레이션 없음</span>}</div>
                    {sc.subtitle && <div className="text-[10px] text-indigo-400 mt-0.5 truncate">"{sc.subtitle}"</div>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteScene(sc.id); }}
                    className="text-gray-600 hover:text-red-400 text-xs self-start transition-colors">✕</button>
                </div>
              ))}
              <button onClick={addScene} className="w-full py-3 text-xs text-gray-500 hover:text-white hover:bg-gray-800 transition-colors border-b border-gray-800">
                + 장면 추가
              </button>
            </div>
          )}
        </div>

        {/* ── 가운데: 미리보기 ── */}
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-950 gap-4 overflow-auto py-6">
          {/* 폰 목업 */}
          <div className="relative" style={{ width: 240, height: 480 }}>
            <div className="absolute inset-0 bg-gray-900 rounded-[2.5rem] border-4 border-gray-800 shadow-2xl" />
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-4 bg-gray-800 rounded-full" />
            <div className="absolute top-6 left-2 right-2 bottom-6 rounded-[2rem] overflow-hidden bg-gray-900">
              <canvas ref={previewCanvasRef} width={540} height={960} className="w-full h-full" />
              {!playing && (
                <button onClick={startPreview}
                  className="absolute inset-0 flex items-center justify-center group">
                  <div className="w-14 h-14 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20 transition-colors group-hover:scale-105">
                    <span className="text-2xl ml-1">▶</span>
                  </div>
                </button>
              )}
              {playing && (
                <div className="absolute top-3 right-3 text-[10px] text-white/70 bg-black/40 px-2 py-0.5 rounded-full">
                  {previewIdx + 1}/{scenes.length}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {playing
              ? <button onClick={stopPreview} className="px-5 py-2 bg-red-600 hover:bg-red-500 rounded-xl text-xs font-bold transition-colors">⏹ 정지</button>
              : <button onClick={startPreview} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold transition-colors">▶ 미리보기</button>
            }
          </div>

          {/* 내보내기 진행 / 다운로드 */}
          {exporting && (
            <div className="w-60 space-y-2">
              <div className="text-xs text-gray-400 text-center">영상 렌더링 중... {exportProgress}%</div>
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${exportProgress}%` }} />
              </div>
            </div>
          )}
          {downloadUrl && (
            <a href={downloadUrl} download={`${title}_${Date.now()}.webm`}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5">
              ⬇️ WebM 다운로드
            </a>
          )}
        </div>

        {/* ── 오른쪽: 속성 패널 ── */}
        <div className="w-72 flex-shrink-0 bg-gray-900 border-l border-gray-800 overflow-y-auto">
          {sel && (
            <div className="p-4 space-y-5">

              {/* 씬 정보 */}
              <div>
                <div className="flex items-center mb-2">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">장면 {scenes.findIndex(s => s.id === sel.id) + 1}</div>
                  <button onClick={() => splitScene(sel.id)}
                    title="나레이션을 문장 기준으로 여러 장면으로 분할"
                    className="ml-auto px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded text-[9px] font-bold transition-colors">
                    ✂️ 씬 분할
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-gray-400">길이</span>
                  <input type="number" value={sel.duration} min={1} max={30}
                    onChange={e => updateScene(sel.id, { duration: Number(e.target.value) })}
                    className="w-16 bg-gray-800 text-white px-2 py-1 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  <span className="text-xs text-gray-500">초</span>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">🎙 나레이션</label>
                    <textarea value={sel.narration} onChange={e => updateScene(sel.id, { narration: e.target.value })}
                      rows={4} placeholder="나레이션 텍스트..."
                      className="w-full bg-gray-800 text-white px-3 py-2 rounded-xl text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">📝 자막</label>
                    <input value={sel.subtitle} onChange={e => updateScene(sel.id, { subtitle: e.target.value })}
                      maxLength={20} placeholder="15자 이내"
                      className="w-full bg-gray-800 text-white px-3 py-1.5 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-800" />

              {/* 이미지 효과 */}
              <div>
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">🎨 이미지 효과</div>
                <div className="grid grid-cols-5 gap-1">
                  {IMG_EFFECTS.map(ef => (
                    <button key={ef.v} onClick={() => updateScene(sel.id, { imageEffect: ef.v })}
                      className={`flex flex-col items-center gap-0.5 py-2 rounded-lg text-center transition-all ${
                        sel.imageEffect === ef.v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}>
                      <span className="text-base">{ef.icon}</span>
                      <span className="text-[9px] font-bold leading-tight">{ef.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 트랜지션 */}
              <div>
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">✨ 전환 효과</div>
                <div className="grid grid-cols-4 gap-1">
                  {TRANSITIONS.map(t => (
                    <button key={t.v} onClick={() => updateScene(sel.id, { transition: t.v })}
                      className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-center transition-all ${sel.transition === t.v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                      <span className="text-sm">{t.icon}</span>
                      <span className="text-[9px] font-bold">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-800" />

              {/* 캐릭터 마스코트 */}
              <div>
                <div className="flex items-center mb-2.5">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">🎭 캐릭터</div>
                  <button
                    onClick={() => setCharacter(c => ({ ...c, enabled: !c.enabled }))}
                    className={`ml-auto px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${character.enabled ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {character.enabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {character.enabled && (
                  <div className="space-y-3">
                    {/* 이모지 선택 */}
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1.5">이모지 선택</div>
                      <div className="grid grid-cols-5 gap-1">
                        {CHARACTER_EMOJIS.map(emoji => (
                          <button key={emoji}
                            onClick={() => setCharacter(c => ({ ...c, emoji }))}
                            className={`h-8 rounded-lg text-lg flex items-center justify-center transition-all ${character.emoji === emoji ? 'bg-purple-600 ring-2 ring-purple-400' : 'bg-gray-800 hover:bg-gray-700'}`}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 이름 */}
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">캐릭터 이름</label>
                      <input value={character.name}
                        onChange={e => setCharacter(c => ({ ...c, name: e.target.value }))}
                        placeholder="마스코트 이름"
                        className="w-full bg-gray-800 text-white px-3 py-1.5 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-purple-500" />
                    </div>

                    {/* 위치 */}
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1.5">위치</div>
                      <div className="flex gap-1.5">
                        {(['left', 'right'] as const).map(pos => (
                          <button key={pos}
                            onClick={() => setCharacter(c => ({ ...c, position: pos }))}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${character.position === pos ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                            {pos === 'left' ? '← 왼쪽' : '오른쪽 →'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 크기 */}
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1.5">크기</div>
                      <div className="flex gap-1.5">
                        {([['sm', 'S'], ['md', 'M'], ['lg', 'L']] as [CharSize, string][]).map(([sz, label]) => (
                          <button key={sz}
                            onClick={() => setCharacter(c => ({ ...c, size: sz }))}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${character.size === sz ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 말풍선 */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">자막 말풍선 표시</span>
                      <button
                        onClick={() => setCharacter(c => ({ ...c, showBubble: !c.showBubble }))}
                        className={`w-9 h-5 rounded-full transition-all relative ${character.showBubble ? 'bg-purple-600' : 'bg-gray-700'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${character.showBubble ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>

                    {/* 이 장면에 캐릭터 등장 */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-800">
                      <span className="text-[10px] text-gray-400">이 장면에 캐릭터 등장</span>
                      <button
                        onClick={() => updateScene(sel.id, { characterAppears: !sel.characterAppears })}
                        className={`w-9 h-5 rounded-full transition-all relative ${sel.characterAppears ? 'bg-purple-600' : 'bg-gray-700'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${sel.characterAppears ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-800" />

              {/* 자막 스타일 */}
              <div>
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">💬 자막 스타일</div>
                <div className="space-y-2.5">
                  {/* 위치 */}
                  <div className="flex gap-1">
                    {(['top','middle','bottom'] as SubPos[]).map(p => (
                      <button key={p} onClick={() => setSettings(s => ({ ...s, subtitleStyle: { ...s.subtitleStyle, position: p } }))}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${settings.subtitleStyle.position === p ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                        {p === 'top' ? '상단' : p === 'middle' ? '중앙' : '하단'}
                      </button>
                    ))}
                  </div>
                  {/* 크기 */}
                  <div className="flex gap-1">
                    {SUB_SIZES.map(sz => (
                      <button key={sz.v} onClick={() => setSettings(s => ({ ...s, subtitleStyle: { ...s.subtitleStyle, size: sz.v } }))}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${settings.subtitleStyle.size === sz.v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                        {sz.label}
                      </button>
                    ))}
                  </div>
                  {/* 텍스트 스타일 */}
                  <div>
                    <div className="text-[10px] text-gray-600 mb-1">텍스트 스타일</div>
                    <div className="grid grid-cols-5 gap-1">
                      {SUBTITLE_FONTS.map(f => (
                        <button key={f.v} onClick={() => setSettings(s => ({ ...s, subtitleStyle: { ...s.subtitleStyle, font: f.v } }))}
                          className={`py-1.5 rounded-lg text-[9px] font-bold transition-all ${settings.subtitleStyle.font === f.v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 색상 */}
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-[10px] text-gray-500">글자색</span>
                    <input type="color" value={settings.subtitleStyle.textColor}
                      onChange={e => setSettings(s => ({ ...s, subtitleStyle: { ...s.subtitleStyle, textColor: e.target.value } }))}
                      className="w-7 h-7 rounded-lg border border-gray-700 cursor-pointer" />
                    <span className="text-[10px] text-gray-500">외곽색</span>
                    <input type="color" value={settings.subtitleStyle.strokeColor || '#000000'}
                      onChange={e => setSettings(s => ({ ...s, subtitleStyle: { ...s.subtitleStyle, strokeColor: e.target.value } }))}
                      className="w-7 h-7 rounded-lg border border-gray-700 cursor-pointer" />
                    <button onClick={() => setSettings(s => ({ ...s, subtitleStyle: { ...s.subtitleStyle, bold: !s.subtitleStyle.bold } }))}
                      className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all ${settings.subtitleStyle.bold ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                      B
                    </button>
                    <button onClick={() => setSettings(s => ({ ...s, subtitleStyle: { ...s.subtitleStyle, shadow: !s.subtitleStyle.shadow } }))}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${settings.subtitleStyle.shadow ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                      title="그림자">
                      S↓
                    </button>
                    <button onClick={() => setSettings(s => ({ ...s, subtitleStyle: { ...s.subtitleStyle, outline: !s.subtitleStyle.outline } }))}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${settings.subtitleStyle.outline ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                      title="외곽선">
                      O
                    </button>
                  </div>
                  {/* 자동 자막 채우기 */}
                  <button
                    onClick={autoFillSubtitles}
                    className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-[10px] font-bold text-gray-300 transition-colors">
                    📝 나레이션에서 자막 자동 채우기
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-800" />

              {/* TTS 설정 */}
              <div>
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">🔊 TTS 음성</div>
                <div className="space-y-2.5">
                  {/* TTS 모드 선택 */}
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => setTtsMode('webSpeech')}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${ttsMode === 'webSpeech' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                      웹 음성
                    </button>
                    <button
                      onClick={() => setTtsMode('ttsmaker')}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${ttsMode === 'ttsmaker' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                      Edge-TTS
                    </button>
                    <button
                      onClick={() => setTtsMode('supertonic')}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${ttsMode === 'supertonic' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                      Supertonic
                    </button>
                  </div>

                  {/* 웹 음성 설정 */}
                  {ttsMode === 'webSpeech' && (
                    <>
                      {koVoices.length > 0 && (
                        <select value={settings.voiceIdx}
                          onChange={e => setSettings(s => ({ ...s, voiceIdx: Number(e.target.value) }))}
                          className="w-full bg-gray-800 text-white px-2 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500">
                          {koVoices.map((v, i) => <option key={i} value={i}>{v.name}</option>)}
                        </select>
                      )}
                    </>
                  )}

                  {/* Edge-TTS 음성 선택 */}
                  {ttsMode === 'ttsmaker' && (
                    <div className="space-y-1">
                      {TTS_VOICES.map(v => (
                        <button key={v.id}
                          onClick={() => setTtsVoiceId(v.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] transition-all ${ttsVoiceId === v.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                          {ttsVoiceId === v.id && '▶ '}{v.label}
                        </button>
                      ))}
                      {ttsError && (
                        <div className="mt-1.5 px-2.5 py-2 bg-red-900/40 border border-red-700/50 rounded-lg text-[10px] text-red-300 break-all">
                          ⚠️ {ttsError}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Supertonic 음성 선택 */}
                  {ttsMode === 'supertonic' && (
                    <div className="space-y-1">
                      <div className="px-2 py-1.5 bg-purple-900/30 border border-purple-700/40 rounded-lg text-[9px] text-purple-300">
                        🎙️ Supertonic · 고품질 AI TTS · NAS Docker
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {SUPERTONIC_VOICES.map(v => (
                          <button key={v.id}
                            onClick={() => setSupertonicVoiceId(v.id)}
                            className={`text-left px-2 py-1.5 rounded-lg text-[10px] transition-all ${supertonicVoiceId === v.id ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                            {supertonicVoiceId === v.id && '▶ '}{v.label}
                          </button>
                        ))}
                      </div>
                      {ttsError && (
                        <div className="mt-1.5 px-2.5 py-2 bg-red-900/40 border border-red-700/50 rounded-lg text-[10px] text-red-300 break-all">
                          ⚠️ {ttsError}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 공통: 속도 */}
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">속도 {settings.voiceRate.toFixed(1)}x</label>
                    <input type="range" min="0.6" max="1.8" step="0.1" value={settings.voiceRate}
                      onChange={e => setSettings(s => ({ ...s, voiceRate: Number(e.target.value) }))}
                      className="w-full accent-indigo-500" />
                  </div>

                  {/* 웹 음성 전용: 음높이 */}
                  {ttsMode === 'webSpeech' && (
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">음높이 {settings.voicePitch.toFixed(1)}</label>
                      <input type="range" min="0.5" max="1.8" step="0.1" value={settings.voicePitch}
                        onChange={e => setSettings(s => ({ ...s, voicePitch: Number(e.target.value) }))}
                        className="w-full accent-indigo-500" />
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-800" />

              {/* BGM */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">🎵 배경음악 (BGM)</div>
                  <div className="flex items-center gap-1.5">
                    {bgmPlaying && <span className="flex items-center gap-1 text-[9px] text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />재생중</span>}
                    {bgmError && <span className="text-[9px] text-red-400" title={bgmError}>⚠️ 오류</span>}
                    {!settings.bgmUrl && <span className="text-[9px] text-gray-600">미선택</span>}
                  </div>
                </div>
                {bgmError && <div className="mb-2 px-2 py-1.5 bg-red-900/30 border border-red-700/40 rounded-lg text-[9px] text-red-300">{bgmError}</div>}

                {/* BGM 프리셋 카드 */}
                <div className="space-y-1.5 mb-3">
                  {BGM_PRESETS.map(preset => {
                    const isActive = settings.bgmUrl === preset.url;
                    const isPreviewing = bgmPreviewId === preset.id;
                    return (
                      <div key={preset.id}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all border ${
                          isActive
                            ? 'bg-indigo-900/40 border-indigo-500/60'
                            : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                        }`}
                        onClick={() => setSettings(s => ({ ...s, bgmUrl: preset.url }))}>
                        {/* 장르 뱃지 */}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${GENRE_COLORS[preset.genre] ?? 'bg-gray-700 text-gray-300'}`}>
                          {preset.genre}
                        </span>
                        {/* 라벨 */}
                        <span className="flex-1 text-[11px] text-gray-200 truncate">{preset.label}</span>
                        {/* 선택 표시 */}
                        {isActive && <span className="text-indigo-400 text-[10px] font-bold flex-shrink-0">✓</span>}
                        {/* 미리듣기 버튼 */}
                        <button
                          onClick={e => { e.stopPropagation(); toggleBgmPreview(preset); }}
                          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-all ${
                            isPreviewing ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                          }`}>
                          {isPreviewing ? '⏹' : '▶'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* 직접 URL 입력 */}
                <div className="mb-2">
                  <label className="text-[10px] text-gray-500 mb-1 block">직접 URL 입력</label>
                  <input value={settings.bgmUrl} onChange={e => setSettings(s => ({ ...s, bgmUrl: e.target.value }))}
                    placeholder="MP3 URL..."
                    className="w-full bg-gray-800 text-white px-3 py-1.5 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>

                {/* BGM 볼륨 */}
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">🎵 BGM 볼륨 {Math.round(settings.bgmVolume * 100)}%</label>
                  <input type="range" min="0" max="1" step="0.05" value={settings.bgmVolume}
                    onChange={e => setSettings(s => ({ ...s, bgmVolume: Number(e.target.value) }))}
                    className="w-full accent-indigo-500" />
                </div>

                {/* TTS 볼륨 */}
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">🎙️ TTS 볼륨 {Math.round(settings.ttsVolume * 100)}%</label>
                  <input type="range" min="0" max="1" step="0.05" value={settings.ttsVolume}
                    onChange={e => setSettings(s => ({ ...s, ttsVolume: Number(e.target.value) }))}
                    className="w-full accent-purple-500" />
                </div>

                <a href="https://pixabay.com/music/" target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-indigo-400 hover:underline mt-1.5 block">
                  🎵 Pixabay 무료 음악 →
                </a>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── 하단 타임라인 ── */}
      <div className="h-24 flex-shrink-0 bg-gray-900 border-t border-gray-800 flex items-center gap-0 overflow-x-auto px-3 py-2">
        <div className="flex items-center gap-1.5 h-full">
          {scenes.map((sc, i) => {
            const widthPx = Math.max(48, Math.min(120, sc.duration * 8));
            return (
              <div
                key={sc.id}
                onClick={() => { setSelectedId(sc.id); setLeftTab('scenes'); }}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => onDrop(i)}
                className={`flex-shrink-0 relative h-16 rounded-lg overflow-hidden cursor-pointer border-2 transition-all hover:scale-105 ${
                  selectedId === sc.id ? 'border-indigo-500 ring-1 ring-indigo-400' : 'border-gray-700 hover:border-gray-500'
                } ${previewIdx === i && playing ? 'border-green-500' : ''}`}
                style={{ width: widthPx }}>
                {sc.imageUrl
                  ? <img src={sc.imageUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-600 text-lg">📷</div>
                }
                <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white text-center py-0.5">
                  {i+1} · {sc.duration}s
                </div>
                {previewIdx === i && playing && (
                  <div className="absolute inset-0 border-2 border-green-400 animate-pulse rounded-lg" />
                )}
              </div>
            );
          })}
          <button onClick={addScene}
            className="flex-shrink-0 w-12 h-16 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center text-gray-500 hover:text-white text-xl transition-colors border-2 border-dashed border-gray-700">
            +
          </button>
        </div>
        <div className="ml-auto flex-shrink-0 flex items-center gap-2 pl-3">
          <span className="text-[10px] text-gray-500 whitespace-nowrap">총 {totalDuration}초</span>
          {downloadUrl && (
            <a href={downloadUrl} download={`${title}_${Date.now()}.webm`}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[10px] font-bold transition-colors whitespace-nowrap flex items-center gap-1">
              ⬇ 다운로드
            </a>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
