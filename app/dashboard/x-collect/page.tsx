'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type Tab = 'collect' | 'publish' | 'nas';

interface Job {
  job_id: string;
  username: string;
  status: 'running' | 'done' | 'error';
  started_at: string;
  logs?: string[];
  uploaded?: number;
  skipped?: number;
}

interface NasVideo {
  username: string;
  filename: string;
  url: string;
  size: number;
  modified: string;
}

interface SnsConnection {
  platform: string;
  platform_display_name: string;
  is_active: boolean;
}

const PLATFORM_ICONS: Record<string, string> = {
  twitter: '𝕏', instagram: '📸', facebook: '📘',
  threads: '🧵', linkedin: '💼', youtube: '▶️',
};

const COUNT_OPTIONS = [
  { label: '50개', value: 50 },
  { label: '100개', value: 100 },
  { label: '500개', value: 500 },
  { label: '전체', value: 0 },
];

const AI_MODELS = [
  { id: 'qwen3', name: 'Qwen 3', emoji: '🔮' },
  { id: 'llama3.3', name: 'Llama 3.3', emoji: '🦙' },
  { id: 'mistral', name: 'Mistral', emoji: '🌪️' },
  { id: 'gemma3', name: 'Gemma 3', emoji: '💎' },
  { id: 'deepseek-r1', name: 'DeepSeek R1', emoji: '🧠' },
];

function fmtSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024).toFixed(0)}KB`;
}

function proxyUrl(url: string) {
  return `/api/x-videos/proxy?url=${encodeURIComponent(url)}`;
}

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

  // ── Tab 2: SNS 발행 ────────────────────────────────────────
  const [allNasVideos, setAllNasVideos] = useState<NasVideo[]>([]);
  const [nasAccounts, setNasAccounts] = useState<string[]>([]);
  const [nasAccount, setNasAccount] = useState('');
  const [nasVideosLoading, setNasVideosLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<NasVideo | null>(null);
  // 클라이언트 필터링 — API 재호출 없음
  const nasVideos = nasAccount ? allNasVideos.filter(v => v.username === nasAccount) : allNasVideos;
  const [aiModel, setAiModel] = useState('qwen3');
  const [aiLoading, setAiLoading] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [connections, setConnections] = useState<SnsConnection[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState('');
  const [ollamaKey, setOllamaKey] = useState('');

  // ── NAS 이동 ──────────────────────────────────────────────
  interface NasStatus { total: number; remaining: number; done: number; }
  interface NasLog { type: string; index?: number; total?: number; file?: string; nasUrl?: string; error?: string; migrated?: number; failed?: number; remaining?: number; }
  const [nasStatus, setNasStatus] = useState<NasStatus | null>(null);
  const [nasRunning, setNasRunning] = useState(false);
  const [nasLogs, setNasLogs] = useState<NasLog[]>([]);
  const [nasBatchSize, setNasBatchSize] = useState(20);

  useEffect(() => {
    setOllamaKey(localStorage.getItem('freeai_ollama_key') || '');
    loadJobs();
    loadConnections();
    loadNasVideos();
    loadNasStatus();
  }, []);

  const loadNasStatus = async () => {
    try {
      const res = await fetch('/api/x-videos/migrate-to-nas');
      if (res.ok) setNasStatus(await res.json());
    } catch {}
  };

  const nasStopRef = useRef(false);

  const startNasMigration = async () => {
    if (nasRunning) { nasStopRef.current = true; return; }
    nasStopRef.current = false;
    setNasRunning(true);
    setNasLogs([]);

    const runBatch = async (): Promise<number> => {
      const res = await fetch('/api/x-videos/migrate-to-nas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: nasBatchSize }),
      });
      if (!res.body) throw new Error('스트림 없음');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let remaining = -1;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const log: NasLog = JSON.parse(line.slice(6));
            setNasLogs(prev => [...prev.slice(-199), log]);
            if (log.type === 'complete') {
              remaining = log.remaining ?? 0;
              setNasStatus(prev => prev
                ? { ...prev, remaining, done: prev.total - remaining }
                : null);
            }
          } catch {}
        }
      }
      return remaining;
    };

    try {
      while (!nasStopRef.current) {
        const remaining = await runBatch();
        if (remaining <= 0) break;
      }
    } catch (e) {
      setNasLogs(prev => [...prev, { type: 'error_one', error: String(e) }]);
    } finally {
      nasStopRef.current = false;
      setNasRunning(false);
      loadNasStatus();
    }
  };

  // ── 수집 작업 ─────────────────────────────────────────────
  const loadJobs = async () => {
    setJobsLoading(true);
    try {
      const res = await fetch('/api/x-collect');
      if (res.ok) setJobs(await res.json());
    } catch {}
    setJobsLoading(false);
  };

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
          // 수집 완료 → SSE 스트림 끝까지 읽고 NAS 영상 목록 갱신
          if (data.status === 'done') {
            (async () => {
              try {
                const res = await fetch('/api/x-videos/migrate-to-nas', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ limit: 200 }),
                });
                const reader = res.body?.getReader();
                const dec = new TextDecoder();
                if (reader) {
                  let buf = '';
                  let done = false;
                  while (!done) {
                    const { done: streamDone, value } = await reader.read();
                    if (streamDone) break;
                    buf += dec.decode(value, { stream: true });
                    const lines = buf.split('\n');
                    buf = lines.pop() || '';
                    for (const line of lines) {
                      if (line.startsWith('data: ')) {
                        try {
                          const parsed = JSON.parse(line.slice(6));
                          if (parsed.type === 'complete') { done = true; break; }
                        } catch {}
                      }
                    }
                  }
                  reader.cancel();
                }
              } catch {}
              loadNasVideos(true);
              loadNasStatus();
            })();
          } else {
            loadNasVideos(true);
          }
        }
      } catch {}
    }, 3000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── SNS 연결 ──────────────────────────────────────────────
  const loadConnections = async () => {
    try {
      const res = await fetch('/api/sns/connections');
      if (res.ok) setConnections(await res.json());
    } catch {}
  };

  // ── NAS 영상 목록 ─────────────────────────────────────────
  const [nasCachedAt, setNasCachedAt] = useState('');
  const [nasScanning, setNasScanning] = useState(false);

  // 전체 목록 한 번만 로드, 필터는 클라이언트에서
  const loadNasVideos = async (refresh = false) => {
    setNasVideosLoading(true);
    try {
      const res = await fetch(`/api/x-videos/nas${refresh ? '?refresh=1' : ''}`);
      if (res.ok) {
        const data = await res.json();
        setAllNasVideos(data.videos || []);
        setNasAccounts(data.accounts || []);
        if (data.cached_at) setNasCachedAt(data.cached_at);
      }
    } catch {}
    setNasVideosLoading(false);
  };

  const triggerNasScan = async () => {
    setNasScanning(true);
    try {
      const res = await fetch('/api/x-videos/nas-scan', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        alert('NAS 스캔 시작됨. 1~2분 후 새로고침하면 최신 목록이 보입니다.');
      } else {
        alert(data.error || '스캔 시작 실패');
      }
    } catch {
      alert('오류 발생');
    }
    setNasScanning(false);
  };


  // ── AI 글 생성 ───────────────────────────────────────────
  const generatePost = useCallback(async () => {
    if (!selectedVideo) return;
    setAiLoading(true);
    setEditedText('');

    const prompt = `다음 X(트위터) 영상 파일명을 참고해 SNS 발행용 글을 한국어로 써줘.

파일명: ${selectedVideo.filename}
계정: @${selectedVideo.username}

조건:
- 자연스러운 한국어, 짧고 임팩트있게
- 해시태그 3~5개
- 이모지 적극 활용
- URL 링크 포함하지 마 (영상이 직접 첨부됨)
- 200자 이내
- 텍스트만 출력`;

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
            if (j.chunk) { full += j.chunk; setEditedText(full); }
          } catch {}
        }
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'AI 오류');
    }
    setAiLoading(false);
  }, [selectedVideo, aiModel, ollamaKey]);

  // ── SNS 발행 (영상 직접 첨부) ─────────────────────────────
  const publish = async () => {
    if (!editedText.trim() || !selectedPlatforms.length || !selectedVideo) return;
    setPublishing(true);
    setPublishResult('');
    try {
      const res = await fetch('/api/sns/post-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editedText,
          platforms: selectedPlatforms,
          media_urls: [selectedVideo.url], // NAS 영상 URL
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const results: { platform: string; success: boolean }[] = data.results || [];
      setPublishResult(results.map(r => `${PLATFORM_ICONS[r.platform] || r.platform} ${r.success ? '✅' : '❌'}`).join('  '));
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
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-black">X 수집 / SNS 발행</h1>
          <p className="text-sm text-slate-400 mt-1">X 영상 수집 → NAS 저장 → SNS 직접 발행</p>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 bg-slate-900 rounded-xl p-1 mb-6 w-fit">
          {(['collect', 'publish', 'nas'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t === 'collect' ? '🐦 X 수집' : t === 'publish' ? '📤 SNS 발행' : `🖥️ NAS 이동${nasStatus?.remaining ? ` (${nasStatus.remaining})` : ''}`}
            </button>
          ))}
        </div>

        {/* ── Tab 1: X 수집 ─────────────────────────────────── */}
        {tab === 'collect' && (
          <div className="space-y-4">
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
              <h2 className="text-base font-bold mb-4">수집 설정</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">X 계정 (@없이)</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && startCollect()}
                    placeholder="예: elonmusk"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-2 block">수집 개수</label>
                  <div className="flex gap-2 flex-wrap">
                    {COUNT_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => setCount(opt.value)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                          count === opt.value ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                        }`}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>
                <button onClick={startCollect} disabled={collecting || !username.trim()}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold transition-all"
                >
                  {collecting ? '수집 중...' : '수집 시작'}
                </button>
              </div>
            </div>

            {/* 진행 중 */}
            {activeJob && (
              <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold">진행 상황</h2>
                  <span className={`text-xs font-bold ${statusColor(activeJob.status)}`}>{statusLabel(activeJob.status)}</span>
                </div>
                <div className="text-sm text-slate-300 mb-2">@{activeJob.username}</div>
                {activeJob.status === 'running' && (
                  <div className="flex items-center gap-2 mb-3">
                    {[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                    <span className="text-xs text-slate-400">수집 중 (완료 후 NAS 자동 이동)...</span>
                  </div>
                )}
                {activeJob.uploaded !== undefined && (
                  <div className="flex gap-4 text-xs mb-3">
                    <span className="text-emerald-400">업로드 {activeJob.uploaded ?? 0}</span>
                    <span className="text-slate-400">스킵 {activeJob.skipped ?? 0}</span>
                  </div>
                )}
                {activeJob.logs && activeJob.logs.length > 0 && (
                  <div className="bg-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300 max-h-48 overflow-y-auto">
                    {activeJob.logs.slice(-20).map((log, i) => <div key={i}>{log}</div>)}
                  </div>
                )}
              </div>
            )}

            {/* 히스토리 */}
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold">작업 내역</h2>
                <button onClick={loadJobs} disabled={jobsLoading} className="text-xs text-slate-400 hover:text-white">
                  {jobsLoading ? '로딩...' : '새로고침'}
                </button>
              </div>
              {jobs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">아직 작업 없음</p>
              ) : (
                <div className="space-y-2">
                  {jobs.map(job => (
                    <div key={job.job_id} className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                      <div>
                        <span className="text-sm font-medium">@{job.username}</span>
                        <span className="text-xs text-slate-500 ml-2">{job.job_id.slice(0, 14)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {job.uploaded !== undefined && <span className="text-xs text-emerald-400">{job.uploaded}개</span>}
                        <span className={`text-xs font-bold ${statusColor(job.status)}`}>{statusLabel(job.status)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 3: NAS 이동 ──────────────────────────────────── */}
        {tab === 'nas' && (
          <div className="space-y-4">
            {/* 현황 카드 */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '전체', value: nasStatus?.total ?? '-', color: 'text-white' },
                { label: 'NAS 이동됨', value: nasStatus?.done ?? '-', color: 'text-emerald-400' },
                { label: '미이동 (NAS 필요)', value: nasStatus?.remaining ?? '-', color: 'text-orange-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-900 rounded-2xl p-4 border border-slate-700/50 text-center">
                  <div className={`text-2xl font-black ${color}`}>{value}</div>
                  <div className="text-xs text-slate-400 mt-1">{label}</div>
                </div>
              ))}
            </div>

            {nasStatus && nasStatus.total > 0 && (
              <div className="bg-slate-900 rounded-xl p-3 border border-slate-700/50">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>NAS 이동 완료</span>
                  <span>{Math.round(((nasStatus.done) / nasStatus.total) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.round((nasStatus.done / nasStatus.total) * 100)}%` }} />
                </div>
              </div>
            )}

            {/* 배치 설정 + 실행 */}
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
              <h2 className="text-base font-bold mb-4">hy64 NAS로 영상 이동</h2>
              <p className="text-xs text-slate-400 mb-4">
                NAS가 Supabase에서 직접 다운로드 → <code className="text-indigo-300">hy64.synology.me/xmedia/</code>에 저장 → Supabase에서 삭제
              </p>

              <div className="mb-4">
                <label className="text-xs text-slate-400 mb-2 block">배치 크기 (한 번에 이동할 개수)</label>
                <div className="flex gap-2">
                  {[10, 20, 50, 100].map(n => (
                    <button key={n} onClick={() => setNasBatchSize(n)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        nasBatchSize === n ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                      }`}
                    >{n}개</button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={startNasMigration} disabled={nasRunning || !nasStatus?.remaining}
                  className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                  {nasRunning
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />이동 중... (클릭하면 중지)</>
                    : nasStatus?.remaining === 0 ? '✅ 이동 완료!' : '🖥️ 전체 자동 이동 시작'}
                </button>
                <button onClick={loadNasStatus} disabled={nasRunning}
                  className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl text-sm font-medium transition-all">
                  🔄
                </button>
              </div>
            </div>

            {/* 진행 로그 */}
            {nasLogs.length > 0 && (
              <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700/50">
                <h3 className="text-sm font-bold mb-3">진행 로그</h3>
                <div className="max-h-64 overflow-y-auto space-y-1 font-mono text-xs">
                  {nasLogs.map((log, i) => (
                    <div key={i} className={
                      log.type === 'done_one' ? 'text-emerald-400' :
                      log.type === 'error_one' ? 'text-red-400' :
                      log.type === 'complete' ? 'text-yellow-300 font-bold' :
                      log.type === 'progress' ? 'text-slate-400' : 'text-slate-300'
                    }>
                      {log.type === 'start' && `▶ 시작 (${log.total}개)`}
                      {log.type === 'progress' && `[${log.index}/${log.total}] ⏳ ${log.file}`}
                      {log.type === 'done_one' && `[${log.index}] ✅ ${log.file}`}
                      {log.type === 'error_one' && `[${log.index}] ❌ ${log.file}: ${log.error}`}
                      {log.type === 'complete' && `🎉 완료 — 성공 ${log.migrated}개 / 실패 ${log.failed}개 / 남은 ${log.remaining}개`}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 2: SNS 발행 ──────────────────────────────────── */}
        {tab === 'publish' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* NAS 영상 목록 */}
            <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-base font-bold flex-1">🖥️ NAS 영상</h2>
                <select
                  value={nasAccount}
                  onChange={e => setNasAccount(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">전체 계정</option>
                  {nasAccounts.map(acc => <option key={acc} value={acc}>@{acc}</option>)}
                </select>
                <button onClick={() => loadNasVideos(true)} disabled={nasVideosLoading}
                  title="NAS 재스캔"
                  className="text-xs text-slate-400 hover:text-white px-2 py-1.5 bg-slate-800 rounded-lg border border-slate-700"
                >
                  {nasVideosLoading ? '...' : '↺'}
                </button>
                <button onClick={triggerNasScan} disabled={nasScanning}
                  title="NAS 전체 재스캔 (백그라운드)"
                  className="text-xs text-slate-400 hover:text-amber-300 px-2 py-1.5 bg-slate-800 rounded-lg border border-slate-700"
                >
                  {nasScanning ? '...' : '🔍'}
                </button>
              </div>
              {nasCachedAt && (
                <p className="text-[10px] text-slate-600 mb-3">캐시: {new Date(nasCachedAt).toLocaleString('ko-KR')}</p>
              )}

              {nasVideosLoading ? (
                <div className="text-center py-8 text-slate-500 text-sm">불러오는 중...</div>
              ) : nasVideos.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-3xl mb-2">🎬</div>
                  <p className="text-sm text-slate-500">NAS에 저장된 영상이 없습니다<br />X 수집 탭에서 먼저 수집하세요</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-3">총 {nasVideos.length}개{nasAccount ? ` (@${nasAccount})` : ''}</p>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {nasVideos.map(video => (
                      <button key={`${video.username}/${video.filename}`}
                        onClick={() => { setSelectedVideo(video); setEditedText(''); setPublishResult(''); }}
                        className={`w-full text-left rounded-xl overflow-hidden transition-all border-2 ${
                          selectedVideo?.filename === video.filename && selectedVideo?.username === video.username
                            ? 'border-indigo-500' : 'border-transparent'
                        }`}
                      >
                        <div className="relative bg-slate-800 rounded-xl h-32 flex items-center justify-center">
                          <div className="text-4xl">🎬</div>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 rounded-b-xl">
                            <div className="text-xs text-slate-200 truncate">{video.filename}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-400">@{video.username}</span>
                              <span className="text-[10px] text-slate-500">{fmtSize(video.size)}</span>
                              <span className="text-[10px] text-slate-500">{video.modified}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 오른쪽: 선택 영상 + AI + 발행 */}
            <div className="space-y-4">
              {!selectedVideo ? (
                <div className="bg-slate-900 rounded-2xl p-8 border border-slate-700/50 flex flex-col items-center justify-center text-center h-48">
                  <div className="text-3xl mb-2">👈</div>
                  <p className="text-sm text-slate-400">왼쪽에서 영상을 선택하세요</p>
                </div>
              ) : (
                <>
                  {/* 선택된 영상 */}
                  <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-700/50">
                    <video src={selectedVideo.url} controls className="w-full max-h-52 object-contain bg-black" />
                    <div className="p-3">
                      <p className="text-xs text-slate-300 font-medium truncate">{selectedVideo.filename}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-400">@{selectedVideo.username}</span>
                        <span className="text-[10px] text-slate-500">{fmtSize(selectedVideo.size)}</span>
                        <a href={selectedVideo.url} target="_blank" rel="noreferrer"
                          className="text-[10px] text-indigo-400 hover:underline ml-auto">NAS 링크 →</a>
                      </div>
                    </div>
                  </div>

                  {/* AI 글 생성 */}
                  <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
                    <h2 className="text-base font-bold mb-3">AI 글 생성</h2>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {AI_MODELS.map(m => (
                        <button key={m.id} onClick={() => setAiModel(m.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                            aiModel === m.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                          }`}
                        >{m.emoji} {m.name}</button>
                      ))}
                    </div>
                    <button onClick={generatePost} disabled={aiLoading}
                      className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm font-bold mb-3 transition-all"
                    >
                      {aiLoading ? 'AI 생성 중...' : 'SNS 글 생성'}
                    </button>
                    {editedText && (
                      <>
                        <textarea value={editedText} onChange={e => setEditedText(e.target.value)} rows={5}
                          className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
                        />
                        <div className="text-xs text-slate-500 text-right mt-1">{editedText.length}자</div>
                      </>
                    )}
                  </div>

                  {/* SNS 발행 */}
                  {editedText && (
                    <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700/50">
                      <h2 className="text-base font-bold mb-3">SNS 발행</h2>
                      <div className="bg-slate-800 rounded-lg px-3 py-2 text-xs text-emerald-400 mb-3">
                        📎 NAS 영상 첨부 ({fmtSize(selectedVideo.size)})
                      </div>
                      {connections.filter(c => c.is_active).length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-2">
                          <a href="/dashboard/sns" className="text-indigo-400 hover:underline">SNS 관리</a>에서 계정 연결
                        </p>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {connections.filter(c => c.is_active).map(conn => (
                              <button key={conn.platform} onClick={() => togglePlatform(conn.platform)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
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
                          <button onClick={publish}
                            disabled={publishing || !selectedPlatforms.length}
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition-all"
                          >
                            {publishing ? '발행 중... (영상 처리 최대 2분)' : `${selectedPlatforms.length ? `${selectedPlatforms.length}개 플랫폼에 ` : '플랫폼 선택 후 '}발행`}
                          </button>
                          {publishResult && (
                            <div className={`mt-2 text-sm text-center font-medium ${publishResult.includes('오류') ? 'text-red-400' : 'text-emerald-400'}`}>
                              {publishResult}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
