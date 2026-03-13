'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';

// ── 타입 ──────────────────────────────────────────────────────────────────────
interface Scene {
  id: number;
  duration: number;
  narration: string;
  subtitle: string;
  image_query: string;
  image_url: string;
}

interface PixabayImage { id: number; url: string; thumb: string; tags: string; author: string }

// ── 상수 ──────────────────────────────────────────────────────────────────────
const TONES = [
  { v: 'info',    label: '정보전달', icon: '📢', desc: '임팩트 있게 핵심 전달' },
  { v: 'fun',     label: '재미·밈',  icon: '😂', desc: '유머·반전·가볍게' },
  { v: 'emotion', label: '감동·공감', icon: '🥹', desc: '따뜻하고 진솔하게' },
  { v: 'edu',     label: '교육·튜토', icon: '🎓', desc: '단계별 쉬운 설명' },
];
const DURATIONS = [15, 30, 60] as const;
const VOICES_KO = ['ko-KR', 'ko-KR-f', 'ko-KR-m'];

// ── 이미지 피커 모달 ──────────────────────────────────────────────────────────
function ImagePickerModal({
  scene, onSelect, onClose,
}: { scene: Scene; onSelect: (url: string) => void; onClose: () => void }) {
  const [images, setImages] = useState<PixabayImage[]>([]);
  const [query, setQuery] = useState(scene.image_query);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/shorts/images?q=${encodeURIComponent(q)}&per_page=9`);
    if (res.ok) setImages((await res.json() as { images: PixabayImage[] }).images);
    setLoading(false);
  }, []);

  useEffect(() => { search(query); }, []); // eslint-disable-line

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <input value={query} onChange={e => {
            setQuery(e.target.value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => search(e.target.value), 500);
          }}
            placeholder="이미지 검색 (영어 추천)"
            className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none"
            onKeyDown={e => e.key === 'Enter' && search(query)}
          />
          <button onClick={() => search(query)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-500">
            검색
          </button>
          <button onClick={onClose} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm gap-2">
              <div className="w-5 h-5 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />불러오는 중...
            </div>
          ) : images.length === 0 ? (
            <div className="text-center text-gray-400 py-16 text-sm">검색 결과 없음</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {images.map(img => (
                <button key={img.id} onClick={() => { onSelect(img.url); onClose(); }}
                  className="group relative rounded-2xl overflow-hidden aspect-[9/16] hover:ring-4 hover:ring-indigo-400 transition-all">
                  <img src={img.thumb} alt={img.tags} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <div className="absolute bottom-1 left-1 right-1 text-[9px] text-white/70 truncate bg-black/30 rounded px-1 py-0.5">
                    © {img.author}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Pixabay 무료 이미지 · 상업적 사용 가능
        </div>
      </div>
    </div>
  );
}

// ── 장면 카드 ──────────────────────────────────────────────────────────────────
function SceneCard({
  scene, index, onUpdate, onPickImage,
}: { scene: Scene; index: number; onUpdate: (s: Scene) => void; onPickImage: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-indigo-200 hover:shadow-md transition-all">
      <div className="flex gap-0">
        {/* 썸네일 */}
        <button onClick={onPickImage}
          className="relative flex-shrink-0 w-24 bg-gray-100 group"
          style={{ aspectRatio: '9/16' }}>
          {scene.image_url ? (
            <img src={scene.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-1">
              <span className="text-2xl">🖼️</span>
              <span className="text-[9px]">클릭해서 선택</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <span className="text-white text-lg opacity-0 group-hover:opacity-100 transition-opacity">🔄</span>
          </div>
          {/* 자막 미리보기 */}
          {scene.subtitle && (
            <div className="absolute bottom-2 left-1 right-1 text-center">
              <span className="text-[9px] font-black text-white bg-black/60 px-1.5 py-0.5 rounded-md leading-tight">
                {scene.subtitle}
              </span>
            </div>
          )}
        </button>

        {/* 편집 */}
        <div className="flex-1 p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-black flex items-center justify-center flex-shrink-0">
              {index + 1}
            </span>
            <input
              value={scene.duration}
              onChange={e => onUpdate({ ...scene, duration: Number(e.target.value) || 5 })}
              type="number" min={2} max={15}
              className="w-14 px-2 py-1 border border-gray-200 rounded-lg text-xs text-center focus:ring-1 focus:ring-indigo-300 focus:outline-none"
            />
            <span className="text-xs text-gray-400">초</span>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 mb-1 block">🎙 나레이션</label>
            <textarea
              value={scene.narration}
              onChange={e => onUpdate({ ...scene, narration: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs resize-none focus:ring-2 focus:ring-indigo-300 focus:outline-none leading-relaxed"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-gray-400 mb-1 block">📝 자막</label>
              <input
                value={scene.subtitle}
                onChange={e => onUpdate({ ...scene, subtitle: e.target.value })}
                maxLength={20}
                placeholder="10자 이내"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-300 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold text-gray-400 mb-1 block">🔍 이미지 검색어</label>
              <input
                value={scene.image_query}
                onChange={e => onUpdate({ ...scene, image_query: e.target.value })}
                placeholder="english"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-300 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 미리보기 패널 ──────────────────────────────────────────────────────────────
function PreviewPanel({ scenes, title }: { scenes: Scene[]; title: string }) {
  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    setPlaying(false);
    setCurrentIdx(0);
    setProgress(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, []);

  const playScene = useCallback((idx: number, sceneList: Scene[]) => {
    if (idx >= sceneList.length) { stop(); return; }
    const scene = sceneList[idx];
    setCurrentIdx(idx);
    setProgress(0);

    // TTS
    if (typeof window !== 'undefined' && scene.narration) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(scene.narration);
      utter.lang = 'ko-KR';
      utter.rate = 1.1;
      utter.pitch = 1;
      synthRef.current = utter;
      window.speechSynthesis.speak(utter);
    }

    // 진행 바
    const total = scene.duration * 1000;
    const step = 50;
    let elapsed = 0;
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      elapsed += step;
      setProgress(Math.min((elapsed / total) * 100, 100));
      if (elapsed >= total) {
        if (progressRef.current) clearInterval(progressRef.current);
      }
    }, step);

    timerRef.current = setTimeout(() => playScene(idx + 1, sceneList), total);
  }, [stop]);

  const play = () => {
    if (scenes.length === 0) return;
    setPlaying(true);
    playScene(0, scenes);
  };

  useEffect(() => () => stop(), [stop]);

  const cur = scenes[currentIdx];
  const totalDuration = scenes.reduce((s, sc) => s + sc.duration, 0);

  return (
    <div className="space-y-4">
      {/* 미리보기 화면 (9:16) */}
      <div className="flex justify-center">
        <div className="relative rounded-3xl overflow-hidden shadow-2xl bg-black"
          style={{ width: 270, height: 480 }}>
          {/* 배경 이미지 */}
          {cur?.image_url ? (
            <img src={cur.image_url} alt="" className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${playing ? 'opacity-100' : 'opacity-60'}`} />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
          )}
          {/* 다크 그라데이션 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />

          {/* 재생 전 오버레이 */}
          {!playing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button onClick={play}
                className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors border border-white/30">
                <span className="text-3xl ml-1">▶️</span>
              </button>
            </div>
          )}

          {/* 자막 */}
          {playing && cur?.subtitle && (
            <div className="absolute bottom-16 left-4 right-4 text-center">
              <span className="text-white font-black text-xl leading-tight drop-shadow-lg"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.6)' }}>
                {cur.subtitle}
              </span>
            </div>
          )}

          {/* 장면 번호 */}
          {playing && (
            <div className="absolute top-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
              {currentIdx + 1}/{scenes.length}
            </div>
          )}

          {/* 진행 바 */}
          {playing && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div className="h-full bg-white transition-none" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center justify-center gap-3">
        {playing ? (
          <button onClick={stop}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-2xl font-bold text-sm transition-colors">
            ⏹ 정지
          </button>
        ) : (
          <button onClick={play} disabled={scenes.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-sm transition-colors disabled:opacity-40">
            ▶ 미리보기
          </button>
        )}
      </div>

      {/* 정보 */}
      <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
        <div className="font-bold text-gray-700 truncate">{title || '(제목 없음)'}</div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>⏱ {totalDuration}초</span>
          <span>🎬 {scenes.length}장면</span>
          <span>📸 이미지 {scenes.filter(s => s.image_url).length}/{scenes.length}</span>
        </div>
      </div>

      {/* 내보내기 안내 */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-700 space-y-1.5">
        <div className="font-bold text-sm mb-2">📤 영상 완성 방법</div>
        <div className="space-y-1">
          <div className="flex gap-2"><span>①</span><span>위 <strong>미리보기</strong>로 내용 확인</span></div>
          <div className="flex gap-2"><span>②</span><span><strong>스크립트 복사</strong>로 나레이션 텍스트 저장</span></div>
          <div className="flex gap-2"><span>③</span><span><strong>이미지 다운로드</strong> 버튼으로 장면별 이미지 저장</span></div>
          <div className="flex gap-2"><span>④</span><span><strong>CapCut / DaVinci Resolve</strong>에서 이미지 + 나레이션 조립</span></div>
        </div>
        <div className="pt-1 text-indigo-500">💡 CapCut 자동 자막 기능 사용 시 퀄리티 ↑</div>
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
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState<15 | 30 | 60>(30);
  const [tone, setTone] = useState('info');
  const [step, setStep] = useState<'setup' | 'script' | 'images' | 'preview'>('setup');

  // 생성 결과
  const [title, setTitle] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  // 이미지 피커
  const [pickerSceneIdx, setPickerSceneIdx] = useState<number | null>(null);

  // 이미지 자동 검색 상태
  const [fetchingImages, setFetchingImages] = useState(false);

  const updateScene = (idx: number, updated: Scene) => {
    setScenes(prev => prev.map((s, i) => i === idx ? updated : s));
  };

  // ── 스크립트 생성 ────────────────────────────────────────────────────────────
  const generateScript = async () => {
    if (!topic.trim()) return;
    setGenerating(true); setGenError('');
    try {
      const res = await fetch('/api/shorts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, duration, tone, provider, apiKey }),
      });
      const data = await res.json() as { title?: string; scenes?: Scene[]; error?: string };
      if (!res.ok || data.error) { setGenError(data.error ?? '생성 실패'); return; }
      setTitle(data.title ?? '');
      setScenes(data.scenes ?? []);
      setStep('script');
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  // ── 이미지 자동 검색 ─────────────────────────────────────────────────────────
  const fetchAllImages = useCallback(async (sceneList: Scene[]) => {
    setFetchingImages(true);
    const updated = [...sceneList];
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].image_url) continue;
      try {
        const res = await fetch(`/api/shorts/images?q=${encodeURIComponent(updated[i].image_query)}&per_page=3`);
        if (res.ok) {
          const d = await res.json() as { images?: PixabayImage[] };
          if (d.images?.[0]) updated[i] = { ...updated[i], image_url: d.images[0].url };
        }
      } catch { /* 이미지 없어도 진행 */ }
    }
    setScenes(updated);
    setFetchingImages(false);
  }, []);

  const goToImages = async () => {
    setStep('images');
    if (scenes.some(s => !s.image_url)) await fetchAllImages(scenes);
  };

  // ── 스크립트 복사 ────────────────────────────────────────────────────────────
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
  ] as const;

  return (
    <div className="min-h-full bg-gray-50">
      {/* 이미지 피커 */}
      {pickerSceneIdx !== null && (
        <ImagePickerModal
          scene={scenes[pickerSceneIdx]}
          onSelect={url => updateScene(pickerSceneIdx, { ...scenes[pickerSceneIdx], image_url: url })}
          onClose={() => setPickerSceneIdx(null)}
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
            <p className="text-xs text-gray-400 mt-0.5">AI 스크립트 · Pixabay 이미지 · Web TTS · 무료 제작</p>
          </div>
          {scenes.length > 0 && (
            <button onClick={copyScript}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-600 transition-colors">
              📋 스크립트 복사
            </button>
          )}
        </div>

        {/* 스텝 */}
        <div className="flex gap-1">
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

        {/* ─── Step 1: 설정 ─── */}
        {step === 'setup' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
              <h2 className="font-black text-gray-900">🎯 숏폼 주제 설정</h2>

              {/* 주제 */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">주제 / 키워드</label>
                <input
                  value={topic} onChange={e => setTopic(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && generateScript()}
                  placeholder="예: 직장인이 절대 모르는 연말정산 꿀팁, 강아지 산책 훈련법, 5분 아침 스트레칭"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-2xl text-sm focus:border-indigo-400 focus:outline-none"
                />
              </div>

              {/* 길이 */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">영상 길이</label>
                <div className="flex gap-2">
                  {DURATIONS.map(d => (
                    <button key={d} onClick={() => setDuration(d)}
                      className={`flex-1 py-3 rounded-2xl text-sm font-bold border-2 transition-all ${
                        duration === d ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {d}초
                      <div className="text-[10px] font-normal mt-0.5 opacity-70">
                        {d === 15 ? '초간단' : d === 30 ? '기본 추천' : '상세'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 톤 */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">콘텐츠 톤</label>
                <div className="grid grid-cols-2 gap-2">
                  {TONES.map(t => (
                    <button key={t.v} onClick={() => setTone(t.v)}
                      className={`flex items-start gap-2.5 p-3 rounded-2xl border-2 text-left transition-all ${
                        tone === t.v ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'
                      }`}>
                      <span className="text-xl flex-shrink-0">{t.icon}</span>
                      <div>
                        <div className={`text-sm font-bold ${tone === t.v ? 'text-indigo-700' : 'text-gray-700'}`}>{t.label}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{t.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {genError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{genError}</div>
              )}

              <button onClick={generateScript} disabled={!topic.trim() || generating}
                className="w-full py-4 rounded-2xl font-black text-white text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>
                {generating ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />AI 스크립트 생성 중...</>
                ) : (
                  '🎬 스크립트 자동 생성'
                )}
              </button>
            </div>

            {/* 파이프라인 안내 */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { icon: '🤖', label: 'AI 스크립트', desc: '토큰 최소 사용' },
                { icon: '📸', label: 'Pixabay 이미지', desc: '무료 · 고화질' },
                { icon: '🔊', label: 'Web TTS', desc: '완전 무료' },
                { icon: '✂️', label: 'CapCut 편집', desc: '무료 · 간편' },
              ].map(item => (
                <div key={item.label} className="bg-white border border-gray-100 rounded-2xl p-3 text-center">
                  <div className="text-2xl mb-1">{item.icon}</div>
                  <div className="text-xs font-bold text-gray-700">{item.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Step 2: 스크립트 ─── */}
        {step === 'script' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="영상 제목"
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
              <button onClick={() => setStep('setup')}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50">
                ↩ 재생성
              </button>
            </div>

            {scenes.map((scene, i) => (
              <SceneCard key={scene.id} scene={scene} index={i}
                onUpdate={updated => updateScene(i, updated)}
                onPickImage={() => setPickerSceneIdx(i)} />
            ))}

            <div className="flex gap-2 pt-2">
              <button onClick={copyScript}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                📋 스크립트 복사
              </button>
              <button onClick={goToImages}
                className="flex-1 py-3 rounded-2xl font-bold text-white text-sm transition-all"
                style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>
                이미지 선택 →
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 3: 이미지 ─── */}
        {step === 'images' && (
          <div className="space-y-4">
            {fetchingImages && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-indigo-700">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                장면별 이미지 자동 검색 중...
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {scenes.map((scene, i) => (
                <button key={scene.id} onClick={() => setPickerSceneIdx(i)}
                  className="group relative rounded-2xl overflow-hidden border-2 border-gray-200 hover:border-indigo-400 transition-all"
                  style={{ aspectRatio: '9/16' }}>
                  {scene.image_url ? (
                    <img src={scene.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center text-gray-400 gap-2">
                      {fetchingImages ? (
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-400 rounded-full animate-spin" />
                      ) : (
                        <><span className="text-3xl">🖼️</span><span className="text-xs">클릭해서 선택</span></>
                      )}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <div className="text-[10px] font-black text-white">{scene.subtitle || `장면 ${i + 1}`}</div>
                    <div className="text-[9px] text-white/60 truncate mt-0.5">{scene.image_query}</div>
                  </div>
                  <div className="absolute top-2 left-2 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center text-white text-[10px] font-black">
                    {i + 1}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-2xl bg-black/40 w-10 h-10 rounded-full flex items-center justify-center">🔄</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep('script')}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                ← 스크립트
              </button>
              <button onClick={() => setStep('preview')}
                className="flex-1 py-3 rounded-2xl font-bold text-white text-sm transition-all"
                style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)' }}>
                미리보기 →
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 4: 미리보기 ─── */}
        {step === 'preview' && (
          <div className="space-y-4">
            <PreviewPanel scenes={scenes} title={title} />
            <div className="flex gap-2">
              <button onClick={() => setStep('images')}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                ← 이미지
              </button>
              <button onClick={() => { setStep('setup'); setScenes([]); setTitle(''); setTopic(''); }}
                className="flex-1 py-3 border border-red-200 rounded-2xl text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors">
                🔄 새로 만들기
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
