'use client';

import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { useStore } from '@/lib/store';
import type { StatItem } from './remotion/templates/StatsScene';

// Remotion Player는 클라이언트에서만 로드
const PlayerComponent = lazy(() => import('./PlayerWrapper'));

// ── 타입 ──────────────────────────────────────────────────────────────────────
type TemplateType = 'title' | 'list' | 'card' | 'code' | 'flow' | 'dialog' | 'stats';
interface WordStamp { word: string; start: number; end: number }

const TEMPLATES: { type: TemplateType; label: string; icon: string; desc: string; color: string }[] = [
  { type: 'title',  label: '타이틀',  icon: '🎬', desc: '임팩트 있는 오프닝·제목 장면',  color: '#6C63FF' },
  { type: 'list',   label: '목록',    icon: '📋', desc: '항목을 순서대로 나타내는 리스트', color: '#00BCD4' },
  { type: 'card',   label: '카드',    icon: '🃏', desc: '이미지+텍스트 카드 레이아웃',     color: '#F59E0B' },
  { type: 'code',   label: '코드',    icon: '💻', desc: '코드 하이라이팅 설명 장면',       color: '#007ACC' },
  { type: 'flow',   label: '흐름도',  icon: '🔄', desc: '단계별 프로세스·워크플로우',     color: '#4CAF50' },
  { type: 'dialog', label: '대화',    icon: '💬', desc: '두 캐릭터 대화 형식',             color: '#E91E63' },
  { type: 'stats',  label: '통계',    icon: '📊', desc: '숫자·KPI 애니메이션 카드',        color: '#FF5722' },
];

const EDGE_VOICES = [
  { id: 'ko-KR-SunHiNeural',    name: '선희 (여성·밝고 활기찬)' },
  { id: 'ko-KR-InJoonNeural',   name: '인준 (남성·따뜻하고 친근)' },
  { id: 'ko-KR-BongJinNeural',  name: '봉진 (남성·차분·전문적)' },
  { id: 'ko-KR-GookMinNeural',  name: '국민 (남성·젊고 활기찬)' },
  { id: 'ko-KR-JiMinNeural',    name: '지민 (여성·부드럽)' },
  { id: 'ko-KR-YuJinNeural',    name: '유진 (여성·감성적)' },
];

const FPS = 30;

function defaultProps(type: TemplateType, durationInFrames: number): Record<string, unknown> {
  const d = durationInFrames;
  switch (type) {
    case 'title':  return { title: '', subtitle: '', emoji: '🎬', bgGradient: ['#1a1a2e','#16213e'], accentColor: '#6C63FF', durationInFrames: d };
    case 'list':   return { title: '', items: [''], numbered: true, bgColor: '#0f0f1a', accentColor: '#6C63FF', durationInFrames: d };
    case 'card':   return { title: '', body: '', tag: '', imageUrl: '', bgColor: '#111827', accentColor: '#F59E0B', durationInFrames: d };
    case 'code':   return { title: '', code: '', language: 'javascript', explanation: '', bgColor: '#1E1E1E', accentColor: '#007ACC', durationInFrames: d };
    case 'flow':   return { title: '', steps: [{ label: '' }], bgColor: '#0d1117', accentColor: '#58A6FF', durationInFrames: d };
    case 'dialog': return { title: '', lines: [{ speaker: 'A', text: '' }], speakerA: { name: '나', emoji: '🙋', color: '#6C63FF' }, speakerB: { name: '상대방', emoji: '🤖', color: '#00BCD4' }, bgColor: '#13111C', durationInFrames: d };
    case 'stats':  return { title: '', stats: [{ label: '', value: '', unit: '', icon: '📈', trend: 'up' }], bgColor: '#0a0a1a', accentColor: '#00D2FF', durationInFrames: d };
  }
}

// ── 프롭 에디터 ───────────────────────────────────────────────────────────────
function PropsEditor({ type, props, onChange }: {
  type: TemplateType;
  props: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const up = (k: string, v: unknown) => onChange({ ...props, [k]: v });
  const inputCls = 'w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const labelCls = 'text-[11px] text-gray-400 mb-1 block font-semibold uppercase tracking-wider';

  return (
    <div className="space-y-4">
      {/* 공통: 제목 */}
      {type !== 'dialog' && (
        <div>
          <label className={labelCls}>제목</label>
          <input value={String(props.title ?? '')} onChange={e => up('title', e.target.value)} placeholder="제목 입력" className={inputCls} />
        </div>
      )}

      {type === 'title' && <>
        <div>
          <label className={labelCls}>부제목</label>
          <input value={String(props.subtitle ?? '')} onChange={e => up('subtitle', e.target.value)} placeholder="부제목" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>이모지</label>
          <input value={String(props.emoji ?? '🎬')} onChange={e => up('emoji', e.target.value)} className={`${inputCls} w-20`} />
        </div>
        <div>
          <label className={labelCls}>배경 색상 (시작)</label>
          <input type="color" value={(props.bgGradient as [string,string])?.[0] ?? '#1a1a2e'}
            onChange={e => up('bgGradient', [e.target.value, (props.bgGradient as [string,string])?.[1] ?? '#16213e'])}
            className="w-10 h-10 rounded-lg cursor-pointer border border-gray-700" />
        </div>
      </>}

      {type === 'list' && (
        <div>
          <label className={labelCls}>목록 항목 (줄바꿈으로 구분)</label>
          <textarea
            value={(props.items as string[])?.join('\n') ?? ''}
            onChange={e => up('items', e.target.value.split('\n').filter(l => l.trim()))}
            rows={6} placeholder="항목 1&#10;항목 2&#10;항목 3"
            className={`${inputCls} resize-none`} />
          <div className="flex gap-2 mt-2">
            <label className={labelCls}>번호 표시</label>
            <button onClick={() => up('numbered', !props.numbered)}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${props.numbered ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
              {props.numbered ? '번호 ON' : '번호 OFF'}
            </button>
          </div>
        </div>
      )}

      {type === 'card' && <>
        <div>
          <label className={labelCls}>본문</label>
          <textarea value={String(props.body ?? '')} onChange={e => up('body', e.target.value)}
            rows={4} placeholder="카드 내용" className={`${inputCls} resize-none`} />
        </div>
        <div>
          <label className={labelCls}>태그</label>
          <input value={String(props.tag ?? '')} onChange={e => up('tag', e.target.value)} placeholder="예: 💡 TIP" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>이미지 URL</label>
          <input value={String(props.imageUrl ?? '')} onChange={e => up('imageUrl', e.target.value)} placeholder="https://..." className={inputCls} />
        </div>
      </>}

      {type === 'code' && <>
        <div>
          <label className={labelCls}>언어</label>
          <select value={String(props.language ?? 'javascript')} onChange={e => up('language', e.target.value)}
            className={inputCls}>
            {['javascript','typescript','python','css','html','bash','json','sql'].map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>코드</label>
          <textarea value={String(props.code ?? '')} onChange={e => up('code', e.target.value)}
            rows={8} placeholder="코드 입력..."
            className={`${inputCls} resize-none font-mono text-xs`} />
        </div>
        <div>
          <label className={labelCls}>설명 텍스트</label>
          <input value={String(props.explanation ?? '')} onChange={e => up('explanation', e.target.value)} placeholder="코드 하단 설명" className={inputCls} />
        </div>
      </>}

      {type === 'flow' && (
        <div>
          <label className={labelCls}>단계 (줄바꿈으로 구분, 설명은 "|"로 구분)</label>
          <textarea
            value={((props.steps as { label: string; desc?: string; icon?: string }[]) ?? []).map(s => s.desc ? `${s.label}|${s.desc}` : s.label).join('\n')}
            onChange={e => up('steps', e.target.value.split('\n').filter(l => l.trim()).map((l, i) => {
              const [label, desc] = l.split('|');
              return { label: label.trim(), desc: desc?.trim(), icon: String(i + 1) };
            }))}
            rows={6} placeholder="1단계 준비|필요한 것을 준비합니다&#10;2단계 실행&#10;3단계 완료"
            className={`${inputCls} resize-none`} />
        </div>
      )}

      {type === 'dialog' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>화자 A</label>
              <input value={(props.speakerA as { name: string; emoji: string; color: string })?.name ?? ''} onChange={e => up('speakerA', { ...(props.speakerA as object), name: e.target.value })} placeholder="이름" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>화자 B</label>
              <input value={(props.speakerB as { name: string; emoji: string; color: string })?.name ?? ''} onChange={e => up('speakerB', { ...(props.speakerB as object), name: e.target.value })} placeholder="이름" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>대화 (A: 또는 B: 로 시작)</label>
            <textarea
              value={((props.lines as { speaker: 'A'|'B'; text: string }[]) ?? []).map(l => `${l.speaker}: ${l.text}`).join('\n')}
              onChange={e => up('lines', e.target.value.split('\n').filter(l => l.trim()).map(l => {
                const match = l.match(/^([AB]):\s*(.+)/i);
                return match ? { speaker: match[1].toUpperCase() as 'A'|'B', text: match[2] } : { speaker: 'A' as const, text: l };
              }))}
              rows={8} placeholder="A: 안녕하세요!&#10;B: 반갑습니다!"
              className={`${inputCls} resize-none`} />
          </div>
        </div>
      )}

      {type === 'stats' && (
        <div>
          <label className={labelCls}>통계 항목 (형식: 레이블|값|단위|이모지|up/down)</label>
          <textarea
            value={((props.stats as StatItem[]) ?? []).map(s => `${s.label}|${s.value}|${s.unit ?? ''}|${s.icon ?? '📈'}|${s.trend ?? 'neutral'}`).join('\n')}
            onChange={e => up('stats', e.target.value.split('\n').filter(l => l.trim()).map(l => {
              const [label, value, unit, icon, trend] = l.split('|');
              return { label: label?.trim(), value: value?.trim(), unit: unit?.trim(), icon: icon?.trim() ?? '📈', trend: (trend?.trim() as 'up'|'down'|'neutral') ?? 'neutral' };
            }))}
            rows={5} placeholder="월 매출|1200|만원|💰|up&#10;신규 고객|350|명|👥|up"
            className={`${inputCls} resize-none`} />
        </div>
      )}

      {/* 공통: 강조색 */}
      <div className="flex items-center gap-3">
        <div>
          <label className={labelCls}>강조 색상</label>
          <input type="color" value={String(props.accentColor ?? '#6C63FF')}
            onChange={e => up('accentColor', e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer border border-gray-700" />
        </div>
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
export default function Shorts2Page() {
  const { companySettings } = useStore();
  const provider = companySettings.globalAIConfig?.provider ?? 'gemini';
  const apiKey   = companySettings.globalAIConfig?.apiKey ?? '';

  const [selectedType, setSelectedType] = useState<TemplateType>('title');
  const [duration, setDuration] = useState(10); // 초
  const [sceneProps, setSceneProps] = useState<Record<string, unknown>>(defaultProps('title', 10 * FPS));

  // TTS
  const [narration, setNarration] = useState('');
  const [voice, setVoice] = useState('ko-KR-SunHiNeural');
  const [ttsRate, setTtsRate] = useState(0);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [audioSrc, setAudioSrc] = useState('');
  const [words, setWords] = useState<WordStamp[]>([]);
  const [ttsError, setTtsError] = useState('');

  // 씬 저장
  const [scenes, setScenes] = useState<Array<{
    id: string; type: TemplateType; durationInFrames: number;
    props: Record<string, unknown>; audioSrc: string; words: WordStamp[];
    narration: string;
  }>>([]);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [previewProps, setPreviewProps] = useState<Record<string, unknown> | null>(null);

  // 씬 타입 변경시 기본 props 초기화
  const handleTypeChange = (t: TemplateType) => {
    setSelectedType(t);
    setSceneProps(defaultProps(t, duration * FPS));
    setAudioSrc(''); setWords([]);
  };

  // 길이 변경
  const handleDurationChange = (sec: number) => {
    setDuration(sec);
    setSceneProps(prev => ({ ...prev, durationInFrames: sec * FPS }));
  };

  // TTS 생성
  const generateTTS = async () => {
    if (!narration.trim()) return;
    setTtsLoading(true); setTtsError('');
    try {
      const res = await fetch('/api/shorts/edge-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: narration, voice, rate: ttsRate }),
      });
      const data = await res.json() as { audio?: string; words?: WordStamp[]; duration?: number; error?: string };
      if (data.error) { setTtsError(data.error); return; }
      setAudioSrc(data.audio ?? '');
      setWords(data.words ?? []);
      // 오디오 길이에 맞게 duration 자동 조정
      if (data.duration) {
        const sec = Math.ceil(data.duration / 1000) + 1;
        handleDurationChange(sec);
      }
    } catch (e) { setTtsError(String(e)); }
    finally { setTtsLoading(false); }
  };

  // 씬에 TTS 반영
  const applyTTS = () => {
    setSceneProps(prev => ({ ...prev, audioSrc, words }));
  };

  // 씬 추가
  const addScene = () => {
    const id = `scene_${Date.now()}`;
    const newScene = {
      id, type: selectedType, durationInFrames: duration * FPS,
      props: { ...sceneProps, audioSrc, words },
      audioSrc, words, narration,
    };
    setScenes(prev => [...prev, newScene]);
    setActiveSceneId(id);
  };

  // 씬 선택해서 편집
  const editScene = (id: string) => {
    const sc = scenes.find(s => s.id === id);
    if (!sc) return;
    setSelectedType(sc.type);
    setDuration(sc.durationInFrames / FPS);
    setSceneProps(sc.props);
    setAudioSrc(sc.audioSrc);
    setWords(sc.words);
    setNarration(sc.narration);
    setActiveSceneId(id);
  };

  const updateScene = () => {
    setScenes(prev => prev.map(s => s.id === activeSceneId
      ? { ...s, type: selectedType, durationInFrames: duration * FPS, props: { ...sceneProps, audioSrc, words }, audioSrc, words, narration }
      : s
    ));
  };

  const deleteScene = (id: string) => {
    setScenes(prev => prev.filter(s => s.id !== id));
    if (activeSceneId === id) { setActiveSceneId(null); }
  };

  const totalDuration = scenes.reduce((a, s) => a + s.durationInFrames / FPS, 0);

  const tmpl = TEMPLATES.find(t => t.type === selectedType)!;

  return (
    <div className="min-h-full bg-gray-950 text-white">
      {/* 헤더 */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-sm">🎞</span>
              숏폼 제작 2 — Remotion
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">Edge-TTS · 단어 단위 자막 · 씬 템플릿 7종 · props 재사용 구조</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/dashboard/shorts" className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-semibold text-gray-300 transition-colors">
              ← 숏폼 제작 1
            </a>
            <div className="text-xs text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg">
              {scenes.length}장면 · {totalDuration.toFixed(1)}초
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">

        {/* ── 왼쪽: 씬 목록 + 템플릿 선택 ── */}
        <div className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
          {/* 템플릿 선택 */}
          <div className="p-3 border-b border-gray-800">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">템플릿 선택</div>
            <div className="grid grid-cols-2 gap-1.5">
              {TEMPLATES.map(t => (
                <button key={t.type} onClick={() => handleTypeChange(t.type)}
                  className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl text-center transition-all ${selectedType === t.type ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  <span className="text-xl">{t.icon}</span>
                  <span className="text-[10px] font-bold">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 씬 목록 */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 border-b border-gray-800 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              씬 타임라인 ({scenes.length})
            </div>
            {scenes.length === 0 && (
              <div className="py-10 text-center text-xs text-gray-600">씬을 추가하세요</div>
            )}
            {scenes.map((sc, i) => {
              const t = TEMPLATES.find(t => t.type === sc.type)!;
              return (
                <div key={sc.id}
                  onClick={() => editScene(sc.id)}
                  className={`flex items-center gap-2 p-3 border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors ${activeSceneId === sc.id ? 'bg-gray-800 border-l-2 border-l-indigo-500' : ''}`}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                    style={{ background: `${t.color}33` }}>
                    {t.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-200 truncate">{String((sc.props as Record<string,unknown>).title ?? t.label)}</div>
                    <div className="text-[10px] text-gray-500">{t.label} · {sc.durationInFrames / FPS}초</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteScene(sc.id); }}
                    className="text-gray-600 hover:text-red-400 text-xs transition-colors">✕</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 가운데: 미리보기 ── */}
        <div className="flex-1 flex flex-col items-center justify-center bg-gray-950 gap-4 overflow-auto py-6">
          <div className="relative" style={{ width: 270, height: 480 }}>
            <div className="absolute inset-0 bg-gray-800 rounded-[2.5rem] border-4 border-gray-700 shadow-2xl" />
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-4 bg-gray-700 rounded-full" />
            <div className="absolute top-6 left-2 right-2 bottom-6 rounded-[2rem] overflow-hidden bg-gray-900">
              <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">로딩 중...</div>}>
                <PlayerComponent
                  type={selectedType}
                  sceneProps={{ ...sceneProps, audioSrc, words, durationInFrames: duration * FPS }}
                  durationInFrames={duration * FPS}
                />
              </Suspense>
            </div>
          </div>

          <div className="text-xs text-gray-500">{duration}초 · {tmpl.icon} {tmpl.label}</div>

          {/* 씬 저장/업데이트 버튼 */}
          <div className="flex gap-2">
            <button onClick={activeSceneId ? updateScene : addScene}
              className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#6C63FF,#9C27B0)' }}>
              {activeSceneId ? '✏️ 씬 업데이트' : '+ 씬 추가'}
            </button>
            {activeSceneId && (
              <button onClick={() => { setActiveSceneId(null); setSceneProps(defaultProps(selectedType, duration * FPS)); setAudioSrc(''); setWords([]); setNarration(''); }}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-xs font-bold transition-colors">
                새 씬
              </button>
            )}
          </div>
        </div>

        {/* ── 오른쪽: 속성 패널 ── */}
        <div className="w-80 flex-shrink-0 bg-gray-900 border-l border-gray-800 overflow-y-auto">
          <div className="p-4 space-y-5">

            {/* 길이 */}
            <div>
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">⏱ 씬 길이</div>
              <div className="flex gap-1.5 flex-wrap">
                {[5,8,10,15,20,30].map(s => (
                  <button key={s} onClick={() => handleDurationChange(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${duration === s ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                    {s}초
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-800" />

            {/* 프롭 에디터 */}
            <div>
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-3">
                {tmpl.icon} {tmpl.label} 설정
              </div>
              <PropsEditor
                type={selectedType}
                props={sceneProps}
                onChange={p => setSceneProps({ ...p, durationInFrames: duration * FPS })}
              />
            </div>

            <div className="border-t border-gray-800" />

            {/* Edge-TTS */}
            <div>
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">🎙 Edge-TTS (MS Neural)</div>
              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] text-gray-400 mb-1 block">음성</label>
                  <select value={voice} onChange={e => setVoice(e.target.value)}
                    className="w-full bg-gray-800 text-white px-2 py-2 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    {EDGE_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 mb-1 block">속도 ({ttsRate >= 0 ? '+' : ''}{ttsRate}%)</label>
                  <input type="range" min="-50" max="100" step="5" value={ttsRate}
                    onChange={e => setTtsRate(Number(e.target.value))}
                    className="w-full accent-indigo-500" />
                </div>
                <textarea value={narration} onChange={e => setNarration(e.target.value)}
                  rows={4} placeholder="나레이션 텍스트 입력..."
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded-xl text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed" />

                {ttsError && <div className="text-red-400 text-xs bg-red-900/30 rounded-lg px-3 py-2">{ttsError}</div>}

                <div className="flex gap-2">
                  <button onClick={generateTTS} disabled={ttsLoading || !narration.trim()}
                    className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
                    {ttsLoading ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />생성 중...</> : '🎙 TTS 생성'}
                  </button>
                  {audioSrc && (
                    <button onClick={applyTTS}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors">
                      ✓ 적용
                    </button>
                  )}
                </div>

                {audioSrc && (
                  <div className="bg-gray-800 rounded-xl p-2">
                    <div className="text-[10px] text-gray-400 mb-1.5">미리듣기</div>
                    <audio src={audioSrc} controls className="w-full h-8" style={{ height: 32 }} />
                    <div className="text-[10px] text-emerald-400 mt-1.5">
                      ✓ {words.length}개 단어 타임스탬프 확보
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* JSON 내보내기 */}
            {scenes.length > 0 && (
              <>
                <div className="border-t border-gray-800" />
                <div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">📦 프로젝트 내보내기</div>
                  <button
                    onClick={() => {
                      const json = JSON.stringify(scenes.map(s => ({ type: s.type, durationInFrames: s.durationInFrames, props: s.props, narration: s.narration })), null, 2);
                      const blob = new Blob([json], { type: 'application/json' });
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                      a.download = `shorts2_${Date.now()}.json`; a.click();
                    }}
                    className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition-colors">
                    ⬇️ JSON 내보내기 (Remotion CLI용)
                  </button>
                  <div className="mt-2 text-[10px] text-gray-600 leading-relaxed">
                    내보낸 JSON을 Remotion CLI로 렌더링하면 고품질 MP4 생성 가능
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
