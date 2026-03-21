'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type Tab = 'collect' | 'notion-sns';

interface Job {
  job_id: string;
  username: string;
  status: 'running' | 'done' | 'error';
  started_at: string;
  logs?: string[];
  uploaded?: number;
  skipped?: number;
  failed?: number;
}

interface NotionPage {
  id: string;
  title: string;
  url: string;
  coverUrl?: string;
  created_time?: string;
  properties?: Record<string, unknown>;
}

interface SnsConnection {
  platform: string;
  platform_display_name: string;
  platform_avatar: string | null;
  is_active: boolean;
}

const PLATFORM_ICONS: Record<string, string> = {
  twitter: '𝕏',
  instagram: '📸',
  facebook: '📘',
  threads: '🧵',
  linkedin: '💼',
  youtube: '▶️',
};

const COUNT_OPTIONS = [
  { label: '50개', value: 50 },
  { label: '100개', value: 100 },
  { label: '500개', value: 500 },
  { label: '전체', value: 0 },
];

const OLLAMA_MODELS = [
  { id: 'qwen3', name: 'Qwen 3', emoji: '🔮' },
  { id: 'llama3.3', name: 'Llama 3.3', emoji: '🦙' },
  { id: 'mistral', name: 'Mistral', emoji: '🌪️' },
  { id: 'gemma3', name: 'Gemma 3', emoji: '💎' },
  { id: 'deepseek-r1', name: 'DeepSeek R1', emoji: '🧠' },
];

export default function XCollectPage() {
  const [tab, setTab] = useState<Tab>('collect');

  // ── Tab 1: X 수집 ──────────────────────────────────────────
  const [username, setUsername] = useState('');
  const [count, setCount] = useState(0);
  const [collecting, setCollecting] = useState(false);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Tab 2: Notion → SNS ────────────────────────────────────
  const [dbId, setDbId] = useState('3291f4ff9a0e8083ba68c8df43fd72ed');
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<NotionPage | null>(null);
  const [aiModel, setAiModel] = useState('qwen3');
  const [aiLoading, setAiLoading] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const [editedText, setEditedText] = useState('');
  const [connections, setConnections] = useState<SnsConnection[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string>('');
  const [ollamaKey, setOllamaKey] = useState('');

  useEffect(() => {
    setOllamaKey(localStorage.getItem('freeai_ollama_key') || '');
    loadJobs();
    loadConnections();
  }, []);

  // ── 작업 목록 ───────────────────────────────────────────────
  const loadJobs = async () => {
    setJobsLoading(true);
    try {
      const res = await fetch('/api/x-collect');
      if (res.ok) setJobs(await res.json());
    } catch {}
    setJobsLoading(false);
  };

  // ── 수집 시작 ────────────────────────────────────────────────
  const startCollect = async () => {
    if (!username.trim()) return;
    setCollecting(true);
    setActiveJob(null);
    try {
      const res = await fetch('/api/x-collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '수집 시작 실패');
      const job: Job = { job_id: data.job_id, username: username.trim(), status: 'running', started_at: new Date().toISOString() };
      setActiveJob(job);
      startPolling(data.job_id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '오류 발생');
      setCollecting(false);
    }
  };

  const startPolling = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/x-collect/status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setActiveJob(prev => prev ? { ...prev, ...data } : data);
        if (data.status === 'done' || data.status === 'error') {
          clearInterval(pollRef.current!);
          setCollecting(false);
          loadJobs();
        }
      } catch {}
    }, 3000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── SNS 연결 목록 ────────────────────────────────────────────
  const loadConnections = async () => {
    try {
      const res = await fetch('/api/sns/connections');
      if (res.ok) setConnections(await res.json());
    } catch {}
  };

  // ── Notion 페이지 가져오기 ───────────────────────────────────
  const loadPages = async () => {
    if (!dbId.trim()) return;
    setPagesLoading(true);
    setPages([]);
    setSelectedPage(null);
    try {
      const res = await fetch(`/api/notion/database-items?dbId=${dbId.trim()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setPages(data.items || data);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Notion 조회 실패');
    }
    setPagesLoading(false);
  };

  // ── AI 글 생성 ──────────────────────────────────────────────
  const generatePost = useCallback(async () => {
    if (!selectedPage) return;
    setAiLoading(true);
    setGeneratedText('');
    setEditedText('');

    const prompt = `다음 X(트위터) 게시물 내용을 SNS 발행용으로 번역/재작성해줘.
원문 제목: ${selectedPage.title}
원본 URL: ${selectedPage.url}

조건:
- 한국어로 자연스럽게 번역
- SNS 특성에 맞게 짧고 임팩트있게
- 해시태그 3~5개 추가
- 원본 URL 맨 마지막에 추가
- 이모지 활용해서 시각적으로 매력있게`;

    try {
      const res = await fetch('/api/free-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aiModel,
          clientOllamaKey: ollamaKey,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.body) throw new Error('스트림 없음');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const j = JSON.parse(line.slice(6));
            if (j.chunk) { full += j.chunk; setGeneratedText(full); }
          } catch {}
        }
      }
      setEditedText(full);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'AI 오류');
    }
    setAiLoading(false);
  }, [selectedPage, aiModel, ollamaKey]);

  // ── SNS 발행 ─────────────────────────────────────────────────
  const publish = async () => {
    if (!editedText.trim() || !selectedPlatforms.length) return;
    setPublishing(true);
    setPublishResult('');
    try {
      const res = await fetch('/api/sns/post-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedText, platforms: selectedPlatforms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const results: { platform: string; success: boolean }[] = data.results || [];
      setPublishResult(results.map((r) => `${r.platform}: ${r.success ? '성공' : '실패'}`).join(' | '));
    } catch (e: unknown) {
      setPublishResult(`오류: ${e instanceof Error ? e.message : '알 수 없음'}`);
    }
    setPublishing(false);
  };

  const togglePlatform = (p: string) =>
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const statusColor = (s: string) =>
    s === 'running' ? 'text-amber-400' : s === 'done' ? 'text-emerald-400' : 'text-red-400';
  const statusLabel = (s: string) =>
    s === 'running' ? '수집 중' : s === 'done' ? '완료' : '오류';

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">X 수집 / SNS 발행</h1>
          <p className="text-sm text-slate-400 mt-1">X(트위터) 영상 수집 → Notion → AI 번역 → SNS 자동 발행</p>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 bg-slate-900 rounded-xl p-1 mb-6 w-fit">
          {(['collect', 'notion-sns'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t === 'collect' ? '🐦 X 수집' : '📤 Notion → SNS'}
            </button>
          ))}
        </div>

        {/* ── Tab 1: X 수집 ─────────────────────────────────────── */}
        {tab === 'collect' && (
          <div className="space-y-4">
            {/* 수집 폼 */}
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
              <h2 className="text-base font-bold mb-4">수집 설정</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">X 계정 (@없이)</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && startCollect()}
                    placeholder="예: elonmusk"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-2 block">수집 개수</label>
                  <div className="flex gap-2 flex-wrap">
                    {COUNT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setCount(opt.value)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                          count === opt.value
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={startCollect}
                  disabled={collecting || !username.trim()}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold transition-all"
                >
                  {collecting ? '수집 중...' : '수집 시작'}
                </button>
              </div>
            </div>

            {/* 진행 중인 작업 */}
            {activeJob && (
              <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold">진행 상황</h2>
                  <span className={`text-xs font-bold ${statusColor(activeJob.status)}`}>
                    {statusLabel(activeJob.status)}
                  </span>
                </div>
                <div className="text-sm text-slate-300 mb-2">@{activeJob.username}</div>
                {activeJob.status === 'running' && (
                  <div className="flex gap-1 mb-3">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                    <span className="text-xs text-slate-400 ml-2">수집 중...</span>
                  </div>
                )}
                {(activeJob.uploaded !== undefined || activeJob.skipped !== undefined) && (
                  <div className="flex gap-4 text-xs text-slate-400 mb-3">
                    <span className="text-emerald-400">업로드 {activeJob.uploaded ?? 0}</span>
                    <span>스킵 {activeJob.skipped ?? 0}</span>
                    <span className="text-red-400">실패 {activeJob.failed ?? 0}</span>
                  </div>
                )}
                {activeJob.logs && activeJob.logs.length > 0 && (
                  <div className="bg-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300 max-h-48 overflow-y-auto">
                    {activeJob.logs.slice(-20).map((log, i) => (
                      <div key={i} className="leading-relaxed">{log}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 작업 히스토리 */}
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold">작업 내역</h2>
                <button
                  onClick={loadJobs}
                  disabled={jobsLoading}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  {jobsLoading ? '로딩...' : '새로고침'}
                </button>
              </div>
              {jobs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">아직 작업이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {jobs.map((job) => (
                    <div
                      key={job.job_id}
                      className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3"
                    >
                      <div>
                        <span className="text-sm font-medium">@{job.username}</span>
                        <span className="text-xs text-slate-500 ml-2">{job.job_id.slice(0, 14)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {job.uploaded !== undefined && (
                          <span className="text-xs text-emerald-400">{job.uploaded}개 업로드</span>
                        )}
                        <span className={`text-xs font-bold ${statusColor(job.status)}`}>
                          {statusLabel(job.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 2: Notion → SNS ───────────────────────────────── */}
        {tab === 'notion-sns' && (
          <div className="space-y-4">
            {/* Notion DB 설정 */}
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
              <h2 className="text-base font-bold mb-4">Notion DB 연결</h2>
              <div className="flex gap-2">
                <input
                  value={dbId}
                  onChange={(e) => setDbId(e.target.value)}
                  placeholder="Notion DB ID"
                  className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
                <button
                  onClick={loadPages}
                  disabled={pagesLoading || !dbId.trim()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
                >
                  {pagesLoading ? '로딩...' : '불러오기'}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Notion 설정에서 API 키를 등록해야 합니다 (/dashboard/notion-mirror)
              </p>
            </div>

            {/* 페이지 목록 */}
            {pages.length > 0 && (
              <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
                <h2 className="text-base font-bold mb-4">수집된 게시물 ({pages.length}개)</h2>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {pages.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => { setSelectedPage(page); setGeneratedText(''); setEditedText(''); setPublishResult(''); }}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                        selectedPage?.id === page.id
                          ? 'bg-indigo-600/30 border border-indigo-500/50'
                          : 'bg-slate-800 hover:bg-slate-700'
                      }`}
                    >
                      {page.coverUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={page.coverUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{page.title || '제목 없음'}</div>
                        {page.url && <div className="text-xs text-slate-500 truncate">{page.url}</div>}
                      </div>
                      {selectedPage?.id === page.id && (
                        <span className="text-indigo-400 text-xs flex-shrink-0">선택됨</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* AI 번역/생성 */}
            {selectedPage && (
              <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
                <h2 className="text-base font-bold mb-4">AI SNS 글 생성</h2>

                <div className="mb-4">
                  <div className="text-xs text-slate-400 mb-1">선택된 게시물</div>
                  <div className="bg-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-300 truncate">
                    {selectedPage.title}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-2 block">AI 모델</label>
                  <div className="flex flex-wrap gap-2">
                    {OLLAMA_MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setAiModel(m.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          aiModel === m.id
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                        }`}
                      >
                        {m.emoji} {m.name}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={generatePost}
                  disabled={aiLoading}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm font-bold transition-all mb-4"
                >
                  {aiLoading ? 'AI 생성 중...' : 'SNS 글 생성'}
                </button>

                {(generatedText || editedText) && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">생성된 글 (편집 가능)</label>
                    <textarea
                      value={editedText || generatedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      rows={8}
                      className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                    <div className="text-xs text-slate-500 text-right mt-1">
                      {(editedText || generatedText).length}자
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SNS 발행 */}
            {(editedText || generatedText) && (
              <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
                <h2 className="text-base font-bold mb-4">SNS 발행</h2>

                {connections.filter((c) => c.is_active).length === 0 ? (
                  <div className="text-sm text-slate-400 text-center py-4">
                    연결된 SNS 계정이 없습니다.{' '}
                    <a href="/dashboard/sns" className="text-indigo-400 hover:underline">SNS 관리</a>에서 연결하세요.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {connections.filter((c) => c.is_active).map((conn) => (
                        <button
                          key={conn.platform}
                          onClick={() => togglePlatform(conn.platform)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                            selectedPlatforms.includes(conn.platform)
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                          }`}
                        >
                          <span>{PLATFORM_ICONS[conn.platform] || '🌐'}</span>
                          <span>{conn.platform_display_name || conn.platform}</span>
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={publish}
                      disabled={publishing || !selectedPlatforms.length || !(editedText || generatedText).trim()}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition-all"
                    >
                      {publishing ? '발행 중...' : `${selectedPlatforms.length}개 플랫폼에 발행`}
                    </button>

                    {publishResult && (
                      <div className={`mt-3 text-sm text-center font-medium ${
                        publishResult.includes('오류') ? 'text-red-400' : 'text-emerald-400'
                      }`}>
                        {publishResult}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
