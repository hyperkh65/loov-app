'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface Clip {
  id: string;
  text: string;
  videoUrl: string;
  thumbnailUrl: string;
  show: string;
  platform: 'yarn';
}

interface EditClip extends Clip {
  startAt: number;
  speed: number;
  enText: string;
  koText: string;
  showSubtitle: boolean;
  subtitleStyle: 'white' | 'yellow' | 'neon';
  note: string;
}

const SUB_STYLES = {
  white:  { color: '#ffffff', bg: 'rgba(0,0,0,0.65)', shadow: '1px 1px 3px rgba(0,0,0,0.9)' },
  yellow: { color: '#ffef00', bg: 'rgba(0,0,0,0.7)',  shadow: '1px 1px 4px rgba(0,0,0,1)' },
  neon:   { color: '#00fff7', bg: 'rgba(0,0,40,0.8)', shadow: '0 0 10px #00fff7, 1px 1px 3px #000' },
};

export default function EnglishShortsPage() {
  const [query, setQuery] = useState('');
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [editList, setEditList] = useState<EditClip[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [previewClip, setPreviewClip] = useState<Clip | null>(null);

  const [translating, setTranslating] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportingCard, setExportingCard] = useState(false);
  const [tab, setTab] = useState<'search' | 'list'>('search');

  const videoRef = useRef<HTMLVideoElement>(null);
  const dragIdx = useRef<number | null>(null);

  const displayClip = activeIdx !== null ? editList[activeIdx] : previewClip;

  // ── 검색 ──────────────────────────────────────────────────────────────────
  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true); setError(''); setClips([]);
    try {
      const res = await fetch(`/api/shorts/yarn?q=${encodeURIComponent(q)}`);
      const data = await res.json() as { clips?: Clip[]; error?: string; source?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? '검색 실패');
      const found = data.clips ?? [];
      setClips(found);
      if (!found.length) setError('검색 결과가 없습니다. yarn.co 아카이브에 해당 표현이 없거나 샘플링에서 누락됐을 수 있습니다. 다시 검색하면 다른 클립이 나올 수 있습니다.');
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  // ── 편집 목록 ──────────────────────────────────────────────────────────────
  const addToEdit = (clip: Clip) => {
    if (editList.some(e => e.id === clip.id)) return;
    setEditList(prev => [...prev, { ...clip, startAt: 0, speed: 1, enText: clip.text, koText: '', showSubtitle: true, subtitleStyle: 'white', note: '' }]);
  };

  const removeFromEdit = (id: string) => {
    setEditList(prev => prev.filter(e => e.id !== id));
    setActiveIdx(prev => {
      if (prev === null) return null;
      const idx = editList.findIndex(e => e.id === id);
      if (idx === prev) return null;
      return idx < prev ? prev - 1 : prev;
    });
  };

  const updateClip = (idx: number, patch: Partial<EditClip>) =>
    setEditList(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));

  // ── 재생 ──────────────────────────────────────────────────────────────────
  const loadVideo = useCallback((clip: Clip | EditClip, startAt = 0, speed = 1) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.src = clip.videoUrl;
    vid.playbackRate = speed;
    vid.load();
    vid.onloadedmetadata = () => {
      setDuration(vid.duration);
      if (startAt > 0) vid.currentTime = startAt;
      vid.play().catch(() => {});
    };
  }, []);

  const playFromGrid = (clip: Clip) => {
    setPreviewClip(clip); setActiveIdx(null);
    loadVideo(clip);
  };

  const playEditItem = (idx: number) => {
    const ec = editList[idx];
    if (!ec) return;
    setActiveIdx(idx); setPreviewClip(null);
    loadVideo(ec, ec.startAt, ec.speed);
  };

  // 비디오 이벤트
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => setCurrentTime(vid.currentTime);
    const onDur = () => setDuration(vid.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    vid.addEventListener('timeupdate', onTime);
    vid.addEventListener('loadedmetadata', onDur);
    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    return () => {
      vid.removeEventListener('timeupdate', onTime);
      vid.removeEventListener('loadedmetadata', onDur);
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
    };
  }, []);

  // ── AI 번역 ───────────────────────────────────────────────────────────────
  const translateKo = async (idx: number) => {
    const ec = editList[idx];
    if (!ec?.enText || translating !== null) return;
    setTranslating(idx);
    try {
      const res = await fetch(`/api/shorts/yarn?action=translate&text=${encodeURIComponent(ec.enText)}`);
      const data = await res.json() as { ko?: string };
      if (data.ko) updateClip(idx, { koText: data.ko });
    } catch { /* ignore */ }
    setTranslating(null);
  };

  const translateAll = async () => {
    for (let i = 0; i < editList.length; i++) {
      if (!editList[i].koText && editList[i].enText) await translateKo(i);
    }
  };

  // ── 학습 카드 내보내기 ────────────────────────────────────────────────────
  const exportCard = async (idx: number) => {
    const ec = editList[idx];
    if (!ec) return;
    setExportingCard(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080; canvas.height = 1080;
      const ctx = canvas.getContext('2d')!;

      // 배경
      const grad = ctx.createLinearGradient(0, 0, 0, 1080);
      grad.addColorStop(0, '#0f172a'); grad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);

      // 장식선
      ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(80, 490); ctx.lineTo(1000, 490); ctx.stroke();

      // 태그
      ctx.font = 'bold 26px Arial'; ctx.fillStyle = '#818cf8';
      ctx.textAlign = 'left'; ctx.fillText('🇺🇸 yarn.co 영어 표현', 80, 60);

      // 영어 텍스트
      ctx.font = 'bold 56px Arial'; ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 10;
      wrapText(ctx, `"${ec.enText}"`, 540, 540, 900, 68);

      // 한국어 번역
      if (ec.koText) {
        ctx.font = '44px Arial'; ctx.fillStyle = '#fbbf24';
        wrapText(ctx, ec.koText, 540, 720, 900, 56);
      }

      // 메모
      if (ec.note) {
        ctx.font = '30px Arial'; ctx.fillStyle = '#94a3b8'; ctx.shadowBlur = 0;
        wrapText(ctx, ec.note, 540, 880, 900, 40);
      }

      // 출처
      ctx.font = '26px Arial'; ctx.fillStyle = '#64748b'; ctx.shadowBlur = 0;
      ctx.textAlign = 'right';
      ctx.fillText((ec.show || 'yarn.co') + ' · loov.co.kr', 1000, 1045);

      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `yarn_card_${ec.id.slice(0, 8)}.png`;
        a.click(); URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (e) { alert('카드 생성 실패: ' + String(e)); }
    setExportingCard(false);
  };

  function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
    const words = text.split(' ');
    let line = '', curY = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, curY); line = word; curY += lineH;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, curY);
  }

  // ── 드래그 재정렬 ─────────────────────────────────────────────────────────
  const onDragStart = (i: number) => { dragIdx.current = i; };
  const onDrop = (i: number) => {
    if (dragIdx.current === null || dragIdx.current === i) return;
    setEditList(prev => {
      const next = [...prev];
      const [item] = next.splice(dragIdx.current!, 1);
      next.splice(i, 0, item); return next;
    });
    dragIdx.current = null;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  const activeClip = activeIdx !== null ? editList[activeIdx] : null;

  const EXAMPLES = [
    "I love you", "what are you doing", "I'll be back", "why so serious",
    "you're fired", "I don't know", "are you kidding me", "oh my god",
    "thank you", "I'm sorry", "shut up", "come on",
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">

      {/* ── 헤더 ── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 shrink-0">
        <span className="text-xl">🎬</span>
        <h1 className="text-base font-bold whitespace-nowrap">영어 표현 (yarn.co)</h1>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="I love you · what are you doing · I'll be back"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 min-w-0"
          />
          <button onClick={search} disabled={loading}
            className="shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
            {loading ? '검색 중...' : '🔍 검색'}
          </button>
        </div>
        <div className="flex md:hidden gap-1 shrink-0">
          <button onClick={() => setTab('search')} className={`px-3 py-1 rounded-lg text-xs font-bold ${tab === 'search' ? 'bg-indigo-600' : 'bg-gray-800'}`}>검색</button>
          <button onClick={() => setTab('list')} className={`px-3 py-1 rounded-lg text-xs font-bold ${tab === 'list' ? 'bg-indigo-600' : 'bg-gray-800'}`}>
            편집{editList.length > 0 ? ` (${editList.length})` : ''}
          </button>
        </div>
      </div>

      {/* ── 본문 ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 왼쪽: 검색 결과 ── */}
        <div className={`flex-1 overflow-y-auto p-4 min-w-0 ${tab === 'list' ? 'hidden md:block' : ''}`}>
          {error && (
            <div className="mb-4 p-3 bg-orange-950/40 border border-orange-900/40 rounded-xl text-sm text-orange-300">{error}</div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center h-60 gap-3">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">yarn.co 아카이브에서 클립 검색 중...</p>
              <p className="text-gray-600 text-xs">Wayback Machine 통해 실제 영화·드라마 대사 클립 불러오는 중 (15~30초 소요)</p>
            </div>
          )}

          {!loading && clips.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center h-60 gap-4 text-gray-500">
              <span className="text-5xl">🎬</span>
              <p className="text-sm">영어 표현을 검색하면 실제 영화·드라마 클립이 나타납니다</p>
              <p className="text-xs text-gray-600">yarn.co 아카이브 기반 · 실제 자막 포함 영상</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
                {EXAMPLES.map(q => (
                  <button key={q} onClick={() => { setQuery(q); }}
                    className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-full text-gray-300 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {clips.length > 0 && (
            <p className="text-xs text-gray-500 mb-3">
              {clips.length}개 클립 · yarn.co (Wayback Machine 아카이브)
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {clips.map(clip => {
              const inEdit = editList.some(e => e.id === clip.id);
              const isActive = previewClip?.id === clip.id || (activeIdx !== null && editList[activeIdx]?.id === clip.id);
              return (
                <div key={clip.id}
                  className={`bg-gray-900 rounded-xl overflow-hidden border transition-all group ${isActive ? 'border-indigo-500 shadow-lg shadow-indigo-900/30' : inEdit ? 'border-green-700' : 'border-gray-800 hover:border-gray-600'}`}>
                  <div className="relative cursor-pointer bg-gray-800 aspect-video" onClick={() => playFromGrid(clip)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={clip.thumbnailUrl} alt={clip.text}
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
                      <div className="w-12 h-12 bg-indigo-600/80 rounded-full flex items-center justify-center">
                        <span className="text-xl ml-0.5">▶</span>
                      </div>
                    </div>
                    <div className="absolute bottom-1 left-1 bg-indigo-900/80 rounded px-1.5 py-0.5 text-[9px] font-bold text-indigo-300">yarn.co</div>
                    {inEdit && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-green-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                        {editList.findIndex(e => e.id === clip.id) + 1}
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] text-gray-200 line-clamp-2 leading-relaxed mb-1 italic">&ldquo;{clip.text}&rdquo;</p>
                    {clip.show && <p className="text-[10px] text-gray-500 mb-1.5 truncate">{clip.show}</p>}
                    <button onClick={() => addToEdit(clip)} disabled={inEdit}
                      className="w-full py-1 rounded-lg text-[10px] font-bold transition-colors bg-indigo-600/20 hover:bg-indigo-600/50 text-indigo-300 disabled:opacity-40 disabled:cursor-default">
                      {inEdit ? '✓ 추가됨' : '+ 편집 추가'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 오른쪽: 플레이어 + 편집 ── */}
        <div className={`w-full md:w-[420px] shrink-0 flex flex-col border-l border-gray-800 bg-gray-900/60 overflow-hidden ${tab === 'search' ? 'hidden md:flex' : ''}`}>

          {/* 비디오 플레이어 + 자막 오버레이 */}
          <div className="p-3 border-b border-gray-800 shrink-0">
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className="w-full h-full" playsInline controls />

              {/* 자막 CSS 오버레이 */}
              {displayClip && (activeClip?.showSubtitle ?? true) && (
                <div className="absolute inset-x-0 bottom-10 px-3 pointer-events-none flex flex-col items-center gap-1 z-10">
                  {(activeClip?.enText ?? displayClip.text) && (
                    <div className="text-center px-3 py-1 rounded-lg max-w-full"
                      style={{ backgroundColor: SUB_STYLES[activeClip?.subtitleStyle ?? 'white'].bg }}>
                      <p className="text-sm md:text-base font-bold leading-snug"
                        style={{ color: SUB_STYLES[activeClip?.subtitleStyle ?? 'white'].color, textShadow: SUB_STYLES[activeClip?.subtitleStyle ?? 'white'].shadow }}>
                        {activeClip?.enText ?? displayClip.text}
                      </p>
                    </div>
                  )}
                  {activeClip?.koText && (
                    <div className="text-center px-3 py-0.5 rounded-lg max-w-full bg-black/60">
                      <p className="text-xs md:text-sm font-medium text-yellow-300" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.9)' }}>
                        {activeClip.koText}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!displayClip && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 gap-2">
                  <span className="text-3xl">🎬</span>
                  <p className="text-xs">클립을 클릭하면 여기서 재생됩니다</p>
                </div>
              )}
            </div>

            {displayClip && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-8 shrink-0">{fmt(currentTime)}</span>
                  <input type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
                    onChange={e => { const t = +e.target.value; if (videoRef.current) videoRef.current.currentTime = t; setCurrentTime(t); }}
                    className="flex-1 h-1 accent-indigo-500" />
                  <span className="text-[10px] text-gray-500 w-8 shrink-0 text-right">{fmt(duration)}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play().catch(() => {})}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold">
                    {isPlaying ? '⏸ 일시정지' : '▶ 재생'}
                  </button>
                  {activeClip && (
                    <button
                      onClick={() => { const t = Math.floor(videoRef.current?.currentTime ?? 0); updateClip(activeIdx!, { startAt: t }); }}
                      className="px-2.5 py-1 bg-purple-700/40 text-purple-300 hover:bg-purple-700/60 rounded-lg text-xs">
                      ✂ 시작점 ({fmt(currentTime)})
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const vid = videoRef.current;
                      if (!vid || !displayClip) return;
                      const a = document.createElement('a');
                      a.href = displayClip.videoUrl;
                      a.download = `yarn_${displayClip.id.slice(0, 8)}.mp4`;
                      a.click();
                    }}
                    className="ml-auto px-2.5 py-1 bg-green-700/40 text-green-300 hover:bg-green-700/60 rounded-lg text-xs">
                    ⬇ 다운
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 italic line-clamp-1">&ldquo;{displayClip.text}&rdquo; {displayClip.show && `— ${displayClip.show}`}</p>
              </div>
            )}
          </div>

          {/* 클립 편집 패널 */}
          {activeClip && (
            <div className="p-3 border-b border-gray-800 space-y-2.5 shrink-0 overflow-y-auto max-h-[300px]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-300">클립 #{activeIdx! + 1} 편집</p>
                <button onClick={() => exportCard(activeIdx!)} disabled={exportingCard}
                  className="px-2.5 py-1 bg-green-700/40 text-green-300 hover:bg-green-700/60 rounded-lg text-[10px] font-bold disabled:opacity-40">
                  {exportingCard ? '생성 중...' : '🃏 카드 저장'}
                </button>
              </div>

              {/* 속도 */}
              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                  <span>속도</span><span className="text-indigo-400 font-bold">{activeClip.speed}x</span>
                </div>
                <div className="flex gap-1">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                    <button key={s} onClick={() => { updateClip(activeIdx!, { speed: s }); if (videoRef.current) videoRef.current.playbackRate = s; }}
                      className={`flex-1 py-0.5 rounded text-[10px] font-bold border ${activeClip.speed === s ? 'border-indigo-500 bg-indigo-900/50 text-indigo-300' : 'border-gray-700 bg-gray-800 text-gray-400'}`}>
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* 자막 스타일 */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 shrink-0">자막</span>
                <div className="flex gap-1 flex-1">
                  {(Object.keys(SUB_STYLES) as Array<keyof typeof SUB_STYLES>).map(s => (
                    <button key={s} onClick={() => updateClip(activeIdx!, { subtitleStyle: s })}
                      className={`flex-1 py-0.5 rounded text-[10px] font-bold border ${activeClip.subtitleStyle === s ? 'border-indigo-500 bg-indigo-900/40' : 'border-gray-700 bg-gray-800'}`}
                      style={{ color: SUB_STYLES[s].color }}>{s}</button>
                  ))}
                </div>
                <label className="flex items-center gap-1 cursor-pointer shrink-0">
                  <input type="checkbox" checked={activeClip.showSubtitle}
                    onChange={e => updateClip(activeIdx!, { showSubtitle: e.target.checked })}
                    className="w-3 h-3 accent-indigo-500" />
                  <span className="text-[10px] text-gray-400">표시</span>
                </label>
              </div>

              {/* 영어 */}
              <div className="bg-gray-800/80 rounded-lg p-2">
                <div className="text-[9px] text-blue-400 font-bold mb-1">🇺🇸 영어 자막</div>
                <textarea value={activeClip.enText} rows={2}
                  onChange={e => updateClip(activeIdx!, { enText: e.target.value })}
                  className="w-full text-xs text-white bg-transparent resize-none focus:outline-none" />
              </div>

              {/* 한국어 */}
              <div className="bg-gray-800/80 rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-yellow-400 font-bold">🇰🇷 한국어 번역</span>
                  <button onClick={() => translateKo(activeIdx!)} disabled={translating !== null}
                    className="text-[9px] text-indigo-400 hover:text-indigo-300 disabled:opacity-40">
                    {translating === activeIdx ? '번역 중...' : 'AI 번역'}
                  </button>
                </div>
                <textarea value={activeClip.koText} rows={2}
                  onChange={e => updateClip(activeIdx!, { koText: e.target.value })}
                  placeholder="한국어 번역 또는 메모"
                  className="w-full text-xs text-white bg-transparent resize-none focus:outline-none placeholder:text-gray-600" />
              </div>

              {/* 메모 */}
              <div className="bg-gray-800/80 rounded-lg p-2">
                <div className="text-[9px] text-gray-400 font-bold mb-1">📝 학습 메모</div>
                <textarea value={activeClip.note} rows={1}
                  onChange={e => updateClip(activeIdx!, { note: e.target.value })}
                  placeholder="사용 상황, 뉘앙스 등..."
                  className="w-full text-xs text-white bg-transparent resize-none focus:outline-none placeholder:text-gray-600" />
              </div>
            </div>
          )}

          {/* 편집 목록 */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400">편집 목록{editList.length > 0 ? ` (${editList.length})` : ''}</span>
              <div className="flex gap-2">
                {editList.length > 1 && (
                  <button onClick={translateAll} disabled={translating !== null}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 disabled:opacity-40">전체 번역</button>
                )}
                {editList.length > 0 && (
                  <button onClick={() => { setEditList([]); setActiveIdx(null); }}
                    className="text-[10px] text-red-400 hover:text-red-300">전체 삭제</button>
                )}
              </div>
            </div>

            {editList.length === 0 && (
              <div className="px-3 py-8 text-center text-xs text-gray-600">
                검색 결과에서 + 버튼으로 클립을 추가하세요
              </div>
            )}

            <div className="px-3 space-y-1.5 pb-3">
              {editList.map((ec, i) => (
                <div key={ec.id} draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(i)}
                  onClick={() => playEditItem(i)}
                  className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-colors select-none border ${activeIdx === i ? 'bg-indigo-900/40 border-indigo-700' : 'bg-gray-800/60 hover:bg-gray-800 border-transparent'}`}>
                  <span className="text-[10px] text-gray-600 shrink-0 cursor-grab">≡</span>
                  <span className="text-[10px] text-gray-500 w-3 shrink-0">{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ec.thumbnailUrl} alt={ec.text}
                    className="w-14 h-8 rounded object-cover bg-gray-700 shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white line-clamp-1 italic">&ldquo;{ec.enText || ec.text}&rdquo;</p>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {ec.koText && <span className="text-[9px] text-yellow-400 truncate max-w-[90px]">{ec.koText}</span>}
                      {ec.speed !== 1 && <span className="text-[9px] text-indigo-400">{ec.speed}x</span>}
                      {ec.startAt > 0 && <span className="text-[9px] text-purple-400">✂{fmt(ec.startAt)}</span>}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); exportCard(i); }}
                    className="shrink-0 text-[10px] text-green-400 hover:text-green-300 p-1" title="카드 저장">🃏</button>
                  <button onClick={e => { e.stopPropagation(); removeFromEdit(ec.id); }}
                    className="shrink-0 text-[10px] text-gray-500 hover:text-red-400 p-1">✕</button>
                </div>
              ))}
            </div>
          </div>

          {editList.length > 1 && (
            <div className="p-3 border-t border-gray-800 shrink-0 flex gap-2">
              <button onClick={() => { setActiveIdx(0); playEditItem(0); }}
                className="flex-1 py-2 bg-indigo-700 hover:bg-indigo-600 rounded-xl text-xs font-bold">
                ▶ 처음부터 재생
              </button>
              <button onClick={() => editList.forEach((ec, i) => setTimeout(() => {
                const a = document.createElement('a'); a.href = ec.videoUrl;
                a.download = `yarn_${ec.id.slice(0, 8)}.mp4`; a.click();
              }, i * 1000))}
                className="px-3 py-2 bg-green-700/40 text-green-300 hover:bg-green-700/60 rounded-xl text-xs font-bold">
                ⬇ 전체 다운
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
