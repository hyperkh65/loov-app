'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';

// ── 타입 ──────────────────────────────────────────────────────────────────────
type ImageSource = 'pixabay' | 'pexels' | 'dalle' | 'custom';
type Platform = 'youtube' | 'naver' | 'instagram' | 'tiktok';
type Tone = 'info' | 'fun' | 'emotion' | 'edu' | 'story' | 'trend';

interface Scene {
  id: number;
  duration: number;
  narration: string;
  subtitle: string;
  image_query: string;
  dalle_prompt: string;
  image_url: string;
  image_source: ImageSource;
}
interface PixabayImage { id: number; url: string; thumb: string; tags: string; author: string }

// ── 상수 ──────────────────────────────────────────────────────────────────────
const DURATIONS = [
  { v: 15,  label: '15초', sub: '초간단' },
  { v: 30,  label: '30초', sub: '기본 추천' },
  { v: 60,  label: '1분',  sub: '일반' },
  { v: 120, label: '2분',  sub: '상세' },
  { v: 180, label: '3분',  sub: '심화' },
] as const;

const PLATFORMS: { v: Platform; label: string; icon: string; color: string; desc: string }[] = [
  { v: 'youtube',   label: 'YouTube Shorts', icon: '▶️', color: 'from-red-500 to-red-600',     desc: '9:16 · 최대 3분' },
  { v: 'naver',     label: '네이버 클립',      icon: '🟢', color: 'from-green-500 to-green-600', desc: '9:16 · 검색 최적화' },
  { v: 'instagram', label: 'Instagram Reels', icon: '📸', color: 'from-pink-500 to-purple-600', desc: '9:16 · 감성 비주얼' },
  { v: 'tiktok',    label: 'TikTok',          icon: '🎵', color: 'from-gray-800 to-gray-900',   desc: '9:16 · MZ 감성' },
];

const TONES: { v: Tone; label: string; icon: string; desc: string }[] = [
  { v: 'info',    label: '정보전달', icon: '📢', desc: '핵심만 임팩트 있게' },
  { v: 'fun',     label: '재미·밈',  icon: '😂', desc: '유머·반전·공감' },
  { v: 'emotion', label: '감동·공감', icon: '🥹', desc: '따뜻하고 진솔하게' },
  { v: 'edu',     label: '교육·튜토', icon: '🎓', desc: '단계별 쉬운 설명' },
  { v: 'story',   label: '스토리',   icon: '📖', desc: '기승전결 있는 이야기' },
  { v: 'trend',   label: '트렌드',   icon: '🔥', desc: '핫한 이슈 반응' },
];

const IMG_SOURCES: { v: ImageSource; label: string; icon: string; free: boolean; desc: string }[] = [
  { v: 'pixabay', label: 'Pixabay',  icon: '🖼️', free: true,  desc: '무료 스톡사진' },
  { v: 'pexels',  label: 'Pexels',   icon: '📷', free: true,  desc: '고화질 무료' },
  { v: 'dalle',   label: 'DALL-E 3', icon: '🤖', free: false, desc: 'AI 생성 ($0.08)' },
  { v: 'custom',  label: 'URL 직접', icon: '🔗', free: true,  desc: '내 이미지' },
];

const BGM_LIST = [
  { label: '잔잔한 피아노', url: 'https://pixabay.com/music/search/calm%20piano/', genre: '감성' },
  { label: '업비트 팝', url: 'https://pixabay.com/music/search/upbeat%20pop/', genre: '활기' },
  { label: '에픽 오케스트라', url: 'https://pixabay.com/music/search/epic/', genre: '웅장' },
  { label: 'Lo-fi 힙합', url: 'https://pixabay.com/music/search/lofi/', genre: '집중' },
  { label: '신나는 비트', url: 'https://pixabay.com/music/search/energetic/', genre: '신나는' },
];

// ── 이미지 피커 모달 ──────────────────────────────────────────────────────────
function ImagePickerModal({ scene, onSelect, onClose }: {
  scene: Scene; onSelect: (url: string, source: ImageSource) => void; onClose: () => void;
}) {
  const [activeSource, setActiveSource] = useState<ImageSource>(scene.image_source ?? 'pixabay');
  const [query, setQuery] = useState(scene.image_query);
  const [dallePrompt, setDallePrompt] = useState(scene.dalle_prompt || scene.narration);
  const [customUrl, setCustomUrl] = useState(scene.image_url || '');
  const [images, setImages] = useState<PixabayImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string, src: ImageSource) => {
    if (src === 'custom') return;
    if (!q.trim()) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ q, source: src, per_page: '9' });
      if (src === 'dalle') params.set('dalle_prompt', q);
      const res = await fetch(`/api/shorts/images?${params}`);
      const d = await res.json() as { images?: PixabayImage[]; error?: string };
      if (d.error) setError(d.error);
      else setImages(d.images ?? []);
    } catch (e) { setError(String(e)); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeSource !== 'custom' && activeSource !== 'dalle') search(query, activeSource);
  }, [activeSource]); // eslint-disable-line

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-gray-900">이미지 선택</h3>
            <button onClick={onClose} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">✕</button>
          </div>
          {/* 소스 탭 */}
          <div className="flex gap-1.5 flex-wrap">
            {IMG_SOURCES.map(s => (
              <button key={s.v} onClick={() => setActiveSource(s.v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                  activeSource === s.v ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {s.icon} {s.label}
                {!s.free && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded">유료</span>}
              </button>
            ))}
          </div>
        </div>

        {/* 검색 영역 */}
        <div className="px-5 py-3 border-b border-gray-100">
          {activeSource === 'custom' ? (
            <div className="flex gap-2">
              <input value={customUrl} onChange={e => setCustomUrl(e.target.value)}
                placeholder="이미지 URL 입력 (https://...)"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
              <button onClick={() => { onSelect(customUrl, 'custom'); onClose(); }}
                disabled={!customUrl}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-40">적용</button>
            </div>
          ) : activeSource === 'dalle' ? (
            <div className="space-y-2">
              <textarea value={dallePrompt} onChange={e => setDallePrompt(e.target.value)}
                rows={2} placeholder="이미지 설명 (영어 권장): beautiful Korean city at night, neon lights, cinematic..."
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
              <button onClick={() => search(dallePrompt, 'dalle')}
                disabled={loading || !dallePrompt.trim()}
                className="w-full py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-bold disabled:opacity-40">
                {loading ? '🤖 DALL-E 생성 중... (~15초)' : '🤖 DALL-E 3으로 생성 ($0.08)'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input value={query} onChange={e => {
                setQuery(e.target.value);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => search(e.target.value, activeSource), 600);
              }}
                placeholder={`이미지 검색 (영어 추천)...`}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none"
                onKeyDown={e => e.key === 'Enter' && search(query, activeSource)} />
              <button onClick={() => search(query, activeSource)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold">검색</button>
            </div>
          )}
        </div>

        {/* 이미지 그리드 */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 mb-3">{error}</div>}
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-3">
              <div className="w-8 h-8 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">{activeSource === 'dalle' ? 'DALL-E 이미지 생성 중...' : '이미지 불러오는 중...'}</span>
            </div>
          ) : images.length === 0 && activeSource !== 'custom' ? (
            <div className="text-center text-gray-400 py-12 text-sm">
              {activeSource === 'dalle' ? '위에서 설명 입력 후 생성 버튼을 눌러주세요' : '검색어를 입력하세요'}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images.map(img => (
                <button key={img.id} onClick={() => { onSelect(img.url, activeSource); onClose(); }}
                  className="group relative rounded-2xl overflow-hidden hover:ring-4 hover:ring-indigo-400 transition-all"
                  style={{ aspectRatio: '9/16' }}>
                  <img src={img.thumb} alt={img.tags} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <span className="text-white text-2xl opacity-0 group-hover:opacity-100">✓</span>
                  </div>
                  <div className="absolute bottom-1 left-0 right-0 text-center">
                    <span className="text-[9px] text-white/70 bg-black/30 px-1 rounded">© {img.author}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-2 border-t border-gray-100 text-[10px] text-gray-400 text-center">
          Pixabay · Pexels: 무료 상업적 사용 가능 | DALL-E: OpenAI 이용약관 적용
        </div>
      </div>
    </div>
  );
}

// ── 장면 카드 ──────────────────────────────────────────────────────────────────
function SceneCard({ scene, index, total, onUpdate, onPickImage, onDelete }: {
  scene: Scene; index: number; total: number;
  onUpdate: (s: Scene) => void; onPickImage: () => void; onDelete: () => void;
}) {
  const srcInfo = IMG_SOURCES.find(s => s.v === scene.image_source);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-indigo-200 hover:shadow-md transition-all">
      <div className="flex">
        {/* 썸네일 (9:16 비율 고정) */}
        <button onClick={onPickImage}
          className="relative flex-shrink-0 w-20 group bg-gray-100"
          style={{ aspectRatio: '9/16' }}>
          {scene.image_url ? (
            <img src={scene.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-1 text-center p-1">
              <span className="text-lg">📷</span>
              <span className="text-[8px] leading-tight">클릭해서 이미지 선택</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <span className="text-white text-base opacity-0 group-hover:opacity-100">🔄</span>
          </div>
          {scene.subtitle && (
            <div className="absolute bottom-1 left-0.5 right-0.5 text-center">
              <span className="text-[8px] font-black text-white leading-tight"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>{scene.subtitle}</span>
            </div>
          )}
          {srcInfo && scene.image_url && (
            <div className="absolute top-1 left-1 text-[8px] bg-black/50 text-white px-1 py-0.5 rounded">
              {srcInfo.icon}
            </div>
          )}
        </button>

        {/* 편집 */}
        <div className="flex-1 p-3 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
              {index + 1}
            </span>
            <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-2 py-1">
              <input type="number" value={scene.duration} min={2} max={20}
                onChange={e => onUpdate({ ...scene, duration: Number(e.target.value) || 5 })}
                className="w-10 bg-transparent text-xs text-center focus:outline-none font-bold" />
              <span className="text-[10px] text-gray-400">초</span>
            </div>
            <span className="text-[10px] text-gray-300">/ {total}장면</span>
            <button onClick={onDelete} className="ml-auto text-gray-300 hover:text-red-400 transition-colors text-xs">✕</button>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 mb-0.5 block">🎙 나레이션</label>
            <textarea value={scene.narration} onChange={e => onUpdate({ ...scene, narration: e.target.value })}
              rows={3} placeholder="나레이션 텍스트..."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs resize-none focus:ring-2 focus:ring-indigo-300 focus:outline-none leading-relaxed" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-400 mb-0.5 block">📝 자막 (15자↓)</label>
              <input value={scene.subtitle} onChange={e => onUpdate({ ...scene, subtitle: e.target.value })}
                maxLength={20} placeholder="핵심 단어"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-300 focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 mb-0.5 block">🔍 이미지 검색어</label>
              <input value={scene.image_query} onChange={e => onUpdate({ ...scene, image_query: e.target.value })}
                placeholder="english"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-300 focus:outline-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 미리보기 ───────────────────────────────────────────────────────────────────
function PreviewPanel({ scenes, title, platform }: { scenes: Scene[]; title: string; platform: Platform }) {
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [voiceRate, setVoiceRate] = useState(1.1);
  const [voicePitch, setVoicePitch] = useState(1.0);

  const stopAll = useCallback(() => {
    setPlaying(false); setIdx(0); setProgress(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, []);

  const playScene = useCallback((i: number, list: Scene[]) => {
    if (i >= list.length) { stopAll(); return; }
    const sc = list[i];
    setIdx(i); setProgress(0);

    if (typeof window !== 'undefined' && sc.narration) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(sc.narration);
      u.lang = 'ko-KR'; u.rate = voiceRate; u.pitch = voicePitch;
      // 한국어 보이스 자동 선택
      const voices = window.speechSynthesis.getVoices();
      const koVoice = voices.find(v => v.lang.startsWith('ko'));
      if (koVoice) u.voice = koVoice;
      window.speechSynthesis.speak(u);
    }

    const total = sc.duration * 1000;
    let elapsed = 0;
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      elapsed += 50;
      setProgress(Math.min((elapsed / total) * 100, 100));
      if (elapsed >= total && progressRef.current) clearInterval(progressRef.current);
    }, 50);
    timerRef.current = setTimeout(() => playScene(i + 1, list), total);
  }, [voiceRate, voicePitch, stopAll]);

  const play = () => { if (!scenes.length) return; setPlaying(true); playScene(0, scenes); };
  useEffect(() => () => stopAll(), [stopAll]);

  const cur = scenes[idx];
  const totalSec = scenes.reduce((s, sc) => s + sc.duration, 0);
  const platformInfo = PLATFORMS.find(p => p.v === platform);

  return (
    <div className="space-y-5">
      {/* 폰 목업 */}
      <div className="flex justify-center">
        <div className="relative" style={{ width: 260, height: 520 }}>
          {/* 폰 프레임 */}
          <div className="absolute inset-0 bg-gray-900 rounded-[2.5rem] shadow-2xl border-4 border-gray-800" />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-5 bg-gray-800 rounded-full" />
          {/* 화면 영역 */}
          <div className="absolute top-6 left-2 right-2 bottom-6 rounded-[2rem] overflow-hidden bg-black">
            {/* 배경 */}
            {cur?.image_url
              ? <img src={cur.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              : <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
            }
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />

            {/* 재생 전 */}
            {!playing && (
              <button onClick={play}
                className="absolute inset-0 flex items-center justify-center group">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30 group-hover:bg-white/30 transition-colors">
                  <span className="text-2xl ml-0.5">▶</span>
                </div>
              </button>
            )}

            {playing && (
              <>
                {/* 플랫폼 UI 흉내 - 우측 액션 버튼 */}
                <div className="absolute right-2 bottom-24 flex flex-col gap-3 items-center">
                  {['❤️','💬','↗️','⋮'].map((ic, i) => (
                    <div key={i} className="w-8 h-8 bg-black/40 rounded-full flex items-center justify-center text-sm">{ic}</div>
                  ))}
                </div>
                {/* 자막 */}
                {cur?.subtitle && (
                  <div className="absolute bottom-10 left-3 right-12">
                    <span className="text-white font-black text-lg leading-tight drop-shadow-lg"
                      style={{ textShadow: '0 2px 8px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.8)' }}>
                      {cur.subtitle}
                    </span>
                  </div>
                )}
                {/* 제목 */}
                <div className="absolute top-3 left-3 right-3">
                  <div className="text-white text-[10px] font-bold truncate opacity-80">{title}</div>
                </div>
                {/* 장면 번호 */}
                <div className="absolute top-3 right-3 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                  {idx + 1}/{scenes.length}
                </div>
              </>
            )}

            {/* 진행 바 */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
              <div className="h-full bg-white transition-none" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center justify-center gap-3">
        {playing
          ? <button onClick={stopAll} className="px-5 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-2xl font-bold text-sm">⏹ 정지</button>
          : <button onClick={play} disabled={!scenes.length} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-sm disabled:opacity-40">▶ 미리보기</button>
        }
      </div>

      {/* 음성 조절 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="text-xs font-bold text-gray-500">🔊 TTS 음성 설정 (Web Speech)</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">속도 ({voiceRate}x)</label>
            <input type="range" min="0.7" max="1.5" step="0.1" value={voiceRate}
              onChange={e => setVoiceRate(Number(e.target.value))}
              className="w-full accent-indigo-500" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 mb-1 block">음높이 ({voicePitch})</label>
            <input type="range" min="0.5" max="1.5" step="0.1" value={voicePitch}
              onChange={e => setVoicePitch(Number(e.target.value))}
              className="w-full accent-indigo-500" />
          </div>
        </div>
      </div>

      {/* 영상 정보 */}
      <div className="bg-gray-50 rounded-2xl p-4 text-xs text-gray-600 space-y-1">
        <div className="font-bold text-gray-800 truncate">{title}</div>
        <div className="flex gap-3 text-gray-400">
          <span>⏱ {totalSec}초 ({Math.floor(totalSec / 60)}분 {totalSec % 60}초)</span>
          <span>🎬 {scenes.length}장면</span>
          <span>📸 {scenes.filter(s => s.image_url).length}/{scenes.length}</span>
          <span className="text-indigo-500">{platformInfo?.icon} {platformInfo?.label}</span>
        </div>
      </div>

      {/* BGM 추천 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="text-xs font-bold text-gray-700 mb-3">🎵 무료 BGM 추천 (Pixabay Music)</div>
        <div className="space-y-1.5">
          {BGM_LIST.map(b => (
            <a key={b.label} href={b.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-indigo-50 rounded-xl transition-colors">
              <span className="text-xs font-medium text-gray-700 flex-1">{b.label}</span>
              <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">{b.genre}</span>
              <span className="text-[10px] text-indigo-500">→</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 내보내기 패널 ──────────────────────────────────────────────────────────────
function ExportPanel({ scenes, title, description, hook, platform }: {
  scenes: Scene[]; title: string; description: string; hook: string; platform: Platform;
}) {
  const [copied, setCopied] = useState('');

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const scriptText = `【${title}】\n썸네일: ${hook}\n\n${scenes.map((s, i) =>
    `[장면 ${i + 1}] (${s.duration}초)\n▶ 나레이션: ${s.narration}\n📝 자막: ${s.subtitle}\n`
  ).join('\n')}\n\n📱 설명:\n${description}`;

  const PLATFORM_GUIDE: Record<Platform, { steps: string[]; tips: string[] }> = {
    youtube: {
      steps: ['YouTube Studio → 만들기 → 동영상 업로드', '제목·설명 붙여넣기', '#Shorts 해시태그 포함', '첫 화면을 썸네일로 설정'],
      tips: ['업로드 후 1시간 내 댓글 달기로 알고리즘 활성화', '오전 12-3시 또는 저녁 6-9시 업로드 추천'],
    },
    naver: {
      steps: ['네이버 앱 → 클립 → 업로드', '검색 키워드 중심으로 제목 작성', '관련 블로그·카페에 공유'],
      tips: ['네이버 검색 키워드를 제목에 자연스럽게 포함', '업로드 직후 스스로 조회·좋아요 X (알고리즘 패널티)'],
    },
    instagram: {
      steps: ['Instagram → + → 릴스 선택', '음악 추가 (트렌딩 노래 사용)', '스토리·피드 동시 공유', '해시태그 5-10개'],
      tips: ['첫 1초에 텍스트 훅 배치', '저장하기 유도 멘트로 마무리'],
    },
    tiktok: {
      steps: ['TikTok → + → 업로드', '트렌딩 사운드 사용', '듀엣·스티치 허용으로 확산', '3-5개 핵심 해시태그'],
      tips: ['팔로워 없어도 조회수 나옴 (알고리즘 친화적)', '댓글 질문으로 2편 유도'],
    },
  };

  const guide = PLATFORM_GUIDE[platform];

  return (
    <div className="space-y-4">
      {/* 스크립트 내보내기 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900 text-sm">📋 스크립트</h3>
          <button onClick={() => copy(scriptText, 'script')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              copied === 'script' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {copied === 'script' ? '✓ 복사됨' : '📋 전체 복사'}
          </button>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 max-h-48 overflow-y-auto font-mono whitespace-pre-wrap leading-relaxed">
          {scriptText}
        </div>
      </div>

      {/* 이미지 링크 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-3">🖼️ 장면별 이미지</h3>
        <div className="space-y-2">
          {scenes.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              {s.image_url ? (
                <>
                  <img src={s.image_url} alt="" className="w-8 h-12 object-cover rounded-lg flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-400 truncate">{s.image_url}</div>
                    <div className="text-[10px] text-indigo-500">{IMG_SOURCES.find(x => x.v === s.image_source)?.label}</div>
                  </div>
                  <a href={s.image_url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] border border-gray-200 px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-50">↗</a>
                </>
              ) : (
                <span className="text-xs text-gray-300 italic">이미지 없음</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 플랫폼별 업로드 가이드 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-3">
          {PLATFORMS.find(p => p.v === platform)?.icon} {PLATFORMS.find(p => p.v === platform)?.label} 업로드 방법
        </h3>
        <div className="space-y-1.5 mb-4">
          {guide.steps.map((step, i) => (
            <div key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-indigo-500 font-bold flex-shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
          <div className="text-[10px] font-bold text-amber-700 mb-1">💡 알고리즘 팁</div>
          {guide.tips.map((tip, i) => (
            <div key={i} className="text-xs text-amber-700 flex gap-1.5"><span>•</span><span>{tip}</span></div>
          ))}
        </div>
      </div>

      {/* CapCut 가이드 */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-3">✂️ CapCut으로 완성하기 (무료)</h3>
        <div className="space-y-1.5 text-sm text-gray-700">
          {['CapCut 앱 실행 → 새 프로젝트 → 9:16 비율 선택',
            '장면별 이미지를 순서대로 추가',
            '각 이미지 지속시간 = 나레이션 초 수로 설정',
            '나레이션 텍스트를 "텍스트 읽기(TTS)" 기능으로 추가',
            '자막은 "자동 자막" 기능 활용',
            'BGM 추가 → 볼륨 낮게 조절 (나레이션이 잘 들리게)',
            '내보내기 → 1080×1920 / 30fps'].map((step, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-indigo-400 font-bold flex-shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
export default function ShortsPage() {
  const { companySettings } = useStore();
  const provider = companySettings.globalAIConfig?.provider ?? 'gemini';
  const apiKey = companySettings.globalAIConfig?.apiKey ?? '';

  // 설정
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState<15|30|60|120|180>(30);
  const [tone, setTone] = useState<Tone>('info');
  const [step, setStep] = useState<'setup'|'script'|'images'|'preview'|'export'>('setup');

  // 생성 결과
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hook, setHook] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [generating, setGenerating] = useState(false);
  const [fetchingImages, setFetchingImages] = useState(false);
  const [genError, setGenError] = useState('');

  // 이미지 피커
  const [pickerIdx, setPickerIdx] = useState<number | null>(null);
  const [defaultImgSource, setDefaultImgSource] = useState<ImageSource>('pixabay');

  const updateScene = (i: number, s: Scene) => setScenes(prev => prev.map((x, j) => j === i ? s : x));
  const deleteScene = (i: number) => setScenes(prev => prev.filter((_, j) => j !== i));
  const addScene = () => setScenes(prev => [...prev, {
    id: Date.now(), duration: 5, narration: '', subtitle: '', image_query: '', dalle_prompt: '', image_url: '', image_source: 'pixabay',
  }]);

  // ── 스크립트 생성 ──────────────────────────────────────────────────────────
  const generateScript = async () => {
    if (!topic.trim()) return;
    setGenerating(true); setGenError('');
    try {
      const res = await fetch('/api/shorts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, duration, tone, platform, provider, apiKey }),
      });
      const data = await res.json() as {
        title?: string; description?: string; hook?: string;
        scenes?: Scene[]; error?: string;
      };
      if (!res.ok || data.error) { setGenError(data.error ?? '생성 실패'); return; }
      setTitle(data.title ?? '');
      setDescription(data.description ?? '');
      setHook(data.hook ?? '');
      setScenes((data.scenes ?? []).map(s => ({ ...s, image_source: 'pixabay', image_url: '' })));
      setStep('script');
    } catch (e) { setGenError(String(e)); }
    finally { setGenerating(false); }
  };

  // ── 이미지 자동 검색 ────────────────────────────────────────────────────────
  const fetchAllImages = useCallback(async (sceneList: Scene[], source: ImageSource) => {
    if (source === 'dalle' || source === 'custom') return; // 자동 검색 불가
    setFetchingImages(true);
    const updated = [...sceneList];
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].image_url) continue;
      try {
        const res = await fetch(`/api/shorts/images?q=${encodeURIComponent(updated[i].image_query)}&source=${source}&per_page=3`);
        if (res.ok) {
          const d = await res.json() as { images?: PixabayImage[] };
          if (d.images?.[0]) updated[i] = { ...updated[i], image_url: d.images[0].url, image_source: source };
        }
      } catch { /* 이미지 없어도 계속 */ }
    }
    setScenes(updated);
    setFetchingImages(false);
  }, []);

  const goToImages = async (src?: ImageSource) => {
    const source = src ?? defaultImgSource;
    setStep('images');
    if (scenes.some(s => !s.image_url)) await fetchAllImages(scenes, source);
  };

  const copyScript = () => {
    const text = scenes.map((s, i) =>
      `[장면 ${i + 1}] (${s.duration}초)\n나레이션: ${s.narration}\n자막: ${s.subtitle}\n`
    ).join('\n');
    navigator.clipboard.writeText(`【${title}】\n\n${text}`);
  };

  const STEPS = [
    { key: 'setup',   label: '① 설정' },
    { key: 'script',  label: '② 스크립트' },
    { key: 'images',  label: '③ 이미지' },
    { key: 'preview', label: '④ 미리보기' },
    { key: 'export',  label: '⑤ 내보내기' },
  ] as const;

  return (
    <div className="min-h-full bg-gray-50">
      {/* 이미지 피커 */}
      {pickerIdx !== null && (
        <ImagePickerModal
          scene={scenes[pickerIdx]}
          onSelect={(url, src) => updateScene(pickerIdx, { ...scenes[pickerIdx], image_url: url, image_source: src })}
          onClose={() => setPickerIdx(null)}
        />
      )}

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm"
                style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>🎬</span>
              숏폼 스튜디오
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              AI 스크립트 · Pixabay/Pexels/DALL-E · Web TTS · YouTube·네이버·Instagram·TikTok
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/dashboard/shorts/remove-text"
              className="px-3 py-2 bg-purple-100 hover:bg-purple-200 rounded-xl text-xs font-semibold text-purple-700 transition-colors whitespace-nowrap">
              ✂️ 텍스트 제거
            </a>
            {scenes.length > 0 && (
              <button onClick={copyScript}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-600 transition-colors">
                📋 복사
              </button>
            )}
          </div>
        </div>
        {/* 스텝 탭 */}
        <div className="flex gap-1 flex-wrap">
          {STEPS.map(s => (
            <button key={s.key}
              disabled={s.key !== 'setup' && scenes.length === 0}
              onClick={() => {
                if (s.key === 'images' && scenes.some(sc => !sc.image_url)) goToImages();
                else setStep(s.key);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-30 ${
                step === s.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <div className="p-6 max-w-3xl">

        {/* ══ 1. 설정 ══════════════════════════════════════════════════════════ */}
        {step === 'setup' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
              <h2 className="font-black text-gray-900">🎯 숏폼 설정</h2>

              {/* 플랫폼 */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">플랫폼</label>
                <div className="grid grid-cols-2 gap-2">
                  {PLATFORMS.map(p => (
                    <button key={p.v} onClick={() => setPlatform(p.v)}
                      className={`flex items-center gap-2.5 p-3 rounded-2xl border-2 text-left transition-all ${
                        platform === p.v ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'
                      }`}>
                      <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center text-base flex-shrink-0`}>
                        {p.icon}
                      </div>
                      <div>
                        <div className={`text-xs font-bold ${platform === p.v ? 'text-indigo-700' : 'text-gray-700'}`}>{p.label}</div>
                        <div className="text-[10px] text-gray-400">{p.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 주제 */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">주제 / 키워드</label>
                <input value={topic} onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && generateScript()}
                  placeholder="예: 직장인 연말정산 꿀팁, 강아지 훈련법, 5분 홈트, 재테크 실수 TOP5"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:border-indigo-400 focus:outline-none" />
              </div>

              {/* 길이 */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">영상 길이</label>
                <div className="flex gap-2 flex-wrap">
                  {DURATIONS.map(d => (
                    <button key={d.v} onClick={() => setDuration(d.v)}
                      className={`flex-1 min-w-[60px] py-2.5 rounded-2xl text-sm font-bold border-2 transition-all ${
                        duration === d.v ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {d.label}
                      <div className="text-[9px] font-normal mt-0.5 opacity-70">{d.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 톤 */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">콘텐츠 톤</label>
                <div className="grid grid-cols-3 gap-2">
                  {TONES.map(t => (
                    <button key={t.v} onClick={() => setTone(t.v)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all ${
                        tone === t.v ? 'border-orange-400 bg-orange-50' : 'border-gray-100 hover:border-gray-200'
                      }`}>
                      <span className="text-xl">{t.icon}</span>
                      <span className={`text-xs font-bold ${tone === t.v ? 'text-orange-700' : 'text-gray-700'}`}>{t.label}</span>
                      <span className="text-[9px] text-gray-400 text-center leading-tight">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {genError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{genError}</div>
              )}

              <button onClick={generateScript} disabled={!topic.trim() || generating}
                className="w-full py-4 rounded-2xl font-black text-white text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>
                {generating
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />AI 스크립트 생성 중...</>
                  : <>🎬 스크립트 자동 생성</>
                }
              </button>
            </div>

            {/* 파이프라인 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: '🤖', label: 'AI 스크립트', desc: 'Gemini Flash\n토큰 최소 사용', color: 'from-purple-500 to-indigo-600' },
                { icon: '📸', label: '무료 이미지', desc: 'Pixabay · Pexels\n상업적 사용 OK', color: 'from-blue-500 to-cyan-500' },
                { icon: '🎨', label: 'DALL-E 생성', desc: 'GPT 이미지 생성\n장면별 맞춤 제작', color: 'from-pink-500 to-rose-500' },
                { icon: '🔊', label: '무료 TTS', desc: 'Web Speech API\n완전 무료', color: 'from-green-500 to-emerald-600' },
              ].map(item => (
                <div key={item.label} className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center text-xl mx-auto mb-2`}>{item.icon}</div>
                  <div className="text-xs font-bold text-gray-800">{item.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5 whitespace-pre-line leading-tight">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ 2. 스크립트 ══════════════════════════════════════════════════════ */}
        {step === 'script' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              <div className="flex gap-2">
                <input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="영상 제목"
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                <button onClick={() => { setScenes([]); setTitle(''); setStep('setup'); }}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-400 hover:bg-gray-50 whitespace-nowrap">
                  ↩ 재생성
                </button>
              </div>
              {hook && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <span className="text-sm">🎯</span>
                  <div>
                    <div className="text-[10px] font-bold text-amber-700">썸네일 문구</div>
                    <div className="text-xs text-amber-800">{hook}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500 flex items-center gap-1">
              <span>총 {scenes.length}장면 · {scenes.reduce((s, sc) => s + sc.duration, 0)}초</span>
              <span className="text-gray-300">|</span>
              <span className="text-indigo-500">썸네일 클릭 = 이미지 선택</span>
            </div>

            <div className="space-y-3">
              {scenes.map((sc, i) => (
                <SceneCard key={sc.id} scene={sc} index={i} total={scenes.length}
                  onUpdate={s => updateScene(i, s)}
                  onPickImage={() => setPickerIdx(i)}
                  onDelete={() => deleteScene(i)} />
              ))}
            </div>

            <button onClick={addScene}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-2xl text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors">
              + 장면 추가
            </button>

            {/* 이미지 소스 선택 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="text-xs font-bold text-gray-700 mb-2">이미지 자동 검색 소스</div>
              <div className="flex gap-2 flex-wrap">
                {IMG_SOURCES.filter(s => s.v !== 'dalle' && s.v !== 'custom').map(s => (
                  <button key={s.v} onClick={() => setDefaultImgSource(s.v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                      defaultImgSource === s.v ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500'
                    }`}>
                    {s.icon} {s.label}
                    {s.free && <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1 rounded">무료</span>}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">DALL-E는 장면별로 직접 선택 가능 (썸네일 클릭)</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={copyScript}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                📋 복사
              </button>
              <button onClick={() => goToImages(defaultImgSource)}
                className="flex-1 py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90 transition-all"
                style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>
                이미지 자동 검색 →
              </button>
            </div>
          </div>
        )}

        {/* ══ 3. 이미지 ════════════════════════════════════════════════════════ */}
        {step === 'images' && (
          <div className="space-y-4">
            {fetchingImages && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-indigo-700">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                장면별 이미지 자동 검색 중...
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-gray-700">장면별 이미지 ({scenes.filter(s => s.image_url).length}/{scenes.length})</div>
              <div className="flex gap-1.5">
                {IMG_SOURCES.filter(s => s.v !== 'dalle' && s.v !== 'custom').map(s => (
                  <button key={s.v}
                    onClick={async () => {
                      setDefaultImgSource(s.v);
                      await fetchAllImages(scenes.map(sc => ({ ...sc, image_url: '' })), s.v);
                    }}
                    className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] text-gray-500 hover:bg-gray-50">
                    {s.icon} {s.label} 재검색
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {scenes.map((sc, i) => (
                <button key={sc.id} onClick={() => setPickerIdx(i)}
                  className="group relative rounded-2xl overflow-hidden border-2 border-gray-200 hover:border-indigo-400 transition-all"
                  style={{ aspectRatio: '9/16' }}>
                  {sc.image_url ? (
                    <img src={sc.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center text-gray-400 gap-1">
                      {fetchingImages
                        ? <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-400 rounded-full animate-spin" />
                        : <><span className="text-2xl">📷</span><span className="text-xs">클릭해서 선택</span></>
                      }
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2">
                    <div className="text-[10px] font-black text-white truncate">{sc.subtitle || `장면 ${i + 1}`}</div>
                  </div>
                  <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center text-white text-[10px] font-black">{i + 1}</div>
                  {sc.image_source === 'dalle' && (
                    <div className="absolute top-1.5 right-1.5 bg-purple-600 text-white text-[8px] px-1 rounded">AI</div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-9 h-9 bg-white/80 rounded-full flex items-center justify-center">🔄</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep('script')}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                ← 스크립트
              </button>
              <button onClick={() => setStep('preview')}
                className="flex-1 py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>
                미리보기 →
              </button>
            </div>
          </div>
        )}

        {/* ══ 4. 미리보기 ══════════════════════════════════════════════════════ */}
        {step === 'preview' && (
          <div className="space-y-4">
            <PreviewPanel scenes={scenes} title={title} platform={platform} />
            <div className="flex gap-2">
              <button onClick={() => setStep('images')}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                ← 이미지
              </button>
              <button onClick={() => setStep('export')}
                className="flex-1 py-3 rounded-2xl font-bold text-white text-sm hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>
                내보내기 →
              </button>
            </div>
          </div>
        )}

        {/* ══ 5. 내보내기 ══════════════════════════════════════════════════════ */}
        {step === 'export' && (
          <div className="space-y-4">
            <ExportPanel scenes={scenes} title={title} description={description} hook={hook} platform={platform} />
            <div className="flex gap-2">
              <button onClick={() => setStep('preview')}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                ← 미리보기
              </button>
              <button onClick={() => { setStep('setup'); setScenes([]); setTitle(''); setTopic(''); }}
                className="flex-1 py-3 border border-red-200 rounded-2xl text-sm font-semibold text-red-500 hover:bg-red-50">
                🔄 새로 만들기
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
