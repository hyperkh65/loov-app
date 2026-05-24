'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface WpSite {
  id: string;
  site_name: string;
  site_url: string;
}

interface WpPost {
  id: number;
  title: string;
  excerpt: string;
  date: string;
  link: string;
  status: string;
  featured_image: string | null;
  featured_image_thumb: string | null;
}

interface SnsConn {
  platform: string;
  platform_username: string;
  platform_display_name: string;
  is_active: boolean;
}

interface PublishResult {
  postTitle: string;
  platform: string;
  success: boolean;
  error?: string;
}

interface AutoJob {
  id: string;
  status: 'running' | 'stopped' | 'completed';
  current_page: number;
  current_post_index: number;
  total_done: number;
  total_success: number;
  total_failed: number;
  page_from: number;
  page_to: number;
  interval_seconds: number;
  next_run_at: string;
  created_at: string;
}

interface JobLog {
  id: string;
  post_title: string;
  post_url: string;
  platform: string;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

const PLATFORM_ICONS: Record<string, string> = {
  twitter: '🐦', threads: '🧵', facebook: '📘', instagram: '📸', linkedin: '💼',
};
const PLATFORM_NAMES: Record<string, string> = {
  twitter: 'X (Twitter)', threads: 'Threads', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn',
};

const INTERVAL_OPTIONS = [
  { label: '10초', value: 10 }, { label: '30초', value: 30 },
  { label: '1분', value: 60 }, { label: '2분', value: 120 },
  { label: '5분', value: 300 }, { label: '10분', value: 600 },
  { label: '30분', value: 1800 }, { label: '1시간', value: 3600 },
];

function buildMessage(post: WpPost): string {
  const excerpt = post.excerpt.trim();
  const short = excerpt.length > 150 ? excerpt.slice(0, 150) + '...' : excerpt;
  return [post.title, short].filter(Boolean).join('\n\n');
}

function stripLink(text: string, link: string): string {
  return text.replace(link, '').replace(/🔗\s*/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function WpToSnsPage() {
  const [tab, setTab] = useState<'manual' | 'auto'>('manual');

  // ── 공통 ────────────────────────────────────────
  const [sites, setSites] = useState<WpSite[]>([]);
  const [siteId, setSiteId] = useState('');
  const [snsConns, setSnsConns] = useState<SnsConn[]>([]);

  // ── 글 목록 ────────────────────────────────────
  const [posts, setPosts] = useState<WpPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('publish');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [pageInput, setPageInput] = useState('1');

  // ── 수동 발행 ────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [useAI, setUseAI] = useState(true);
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [generating, setGenerating] = useState<Set<number>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<PublishResult[]>([]);
  const [done, setDone] = useState(false);

  // ── 자동 발행 설정 ────────────────────────────────────
  const [autoSNS, setAutoSNS] = useState<Set<string>>(new Set());
  const [autoUseAI, setAutoUseAI] = useState(true);
  const [autoOrder, setAutoOrder] = useState<'desc' | 'asc'>('desc');
  const [autoPageFrom, setAutoPageFrom] = useState(1);
  const [autoPageTo, setAutoPageTo] = useState(1);
  const [autoInterval, setAutoInterval] = useState(60);
  const [autoPageToInitialized, setAutoPageToInitialized] = useState(false);

  // ── 자동 발행 서버 작업 상태 ──────────────────────
  const [jobId, setJobId] = useState<string | null>(null);
  const [autoJob, setAutoJob] = useState<AutoJob | null>(null);
  const [jobLogs, setJobLogs] = useState<JobLog[]>([]);
  const [showAutoLog, setShowAutoLog] = useState(false);
  const [autoStarting, setAutoStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 초기 로드 ─────────────────────────────────────
  useEffect(() => {
    fetch('/api/wordpress/sites').then(r => r.json()).then(data => {
      if (Array.isArray(data) && data.length) { setSites(data); setSiteId(data[0].id); }
    });
    fetch('/api/sns/connections').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        const active = data.filter((c: SnsConn) => c.is_active);
        setSnsConns(active);
        setSelectedPlatforms(new Set(active.map((c: SnsConn) => c.platform)));
        setAutoSNS(new Set(active.map((c: SnsConn) => c.platform)));
      }
    });
  }, []);

  // ── 사이트 변경 시 끝 페이지 초기화 ──────────────
  useEffect(() => { setAutoPageToInitialized(false); }, [siteId]);

  // ── totalPages 첫 로드 시에만 autoPageTo 설정 ──────
  useEffect(() => {
    if (totalPages > 0 && !autoPageToInitialized) {
      setAutoPageTo(totalPages);
      setAutoPageToInitialized(true);
    }
  }, [totalPages, autoPageToInitialized]);

  // ── 기존 실행 중인 작업 복구 ──────────────────────
  useEffect(() => {
    if (!siteId) return;
    fetch(`/api/sns-auto-job/status?site_id=${siteId}`)
      .then(r => r.json())
      .then(data => {
        if (data.job && data.job.status === 'running') {
          setJobId(data.job.id);
          setAutoJob(data.job);
          setJobLogs(data.logs || []);
          setShowAutoLog(true);
        }
      });
  }, [siteId]);

  // ── 폴링: 작업 실행 중일 때 3초마다 상태 갱신 ────
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!jobId || !autoJob || autoJob.status !== 'running') return;

    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/sns-auto-job/status?job_id=${jobId}`);
      const data = await res.json();
      if (data.job) setAutoJob(data.job);
      if (data.logs) setJobLogs(data.logs);
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId, autoJob?.status]);

  // ── 글 목록 로드 ──────────────────────────────────
  const loadPosts = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ site_id: siteId, per_page: '12', page: String(page), status: statusFilter, order });
      if (search) p.set('search', search);
      const res = await fetch(`/api/wordpress/fetch-posts?${p}`);
      const data = await res.json();
      if (data.posts) {
        setPosts(data.posts); setTotal(data.total);
        setTotalPages(data.totalPages); setPageInput(String(page));
      }
    } finally { setLoading(false); }
  }, [siteId, page, search, statusFilter, order]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // ── 수동 선택 ─────────────────────────────────────
  const togglePost = (id: number) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelectedIds(selectedIds.size === posts.length ? new Set() : new Set(posts.map(p => p.id)));
  };

  // ── AI 후킹 문구 생성 ─────────────────────────────
  const generateHook = async (post: WpPost) => {
    setGenerating(prev => new Set(prev).add(post.id));
    try {
      const res = await fetch('/api/wordpress/generate-sns-hook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: post.title, excerpt: post.excerpt }),
      });
      const data = await res.json();
      if (data.hook) setMessages(prev => ({ ...prev, [post.id]: data.hook }));
    } finally {
      setGenerating(prev => { const n = new Set(prev); n.delete(post.id); return n; });
    }
  };

  // ── 수동 모달 오픈 ────────────────────────────────
  const openModal = async () => {
    const sel = posts.filter(p => selectedIds.has(p.id));
    const initMsgs: Record<number, string> = {};
    sel.forEach(p => { initMsgs[p.id] = buildMessage(p); });
    setMessages(initMsgs); setSelectedPlatforms(new Set(snsConns.map(c => c.platform)));
    setResults([]); setDone(false); setShowModal(true);
    if (useAI) {
      setGenerating(new Set(sel.map(p => p.id)));
      await Promise.all(sel.map(post => generateHook(post)));
    }
  };

  // ── SNS 발행 공통 함수 ────────────────────────────
  const publishPostToSNS = async (post: WpPost, message: string, platforms: string[]): Promise<PublishResult[]> => {
    const hook = stripLink(message.trim(), post.link);
    const mediaUrls = post.featured_image ? [post.featured_image] : undefined;
    const out: PublishResult[] = [];
    const threadsSelected = platforms.includes('threads');
    const others = platforms.filter(p => p !== 'threads');

    if (threadsSelected) {
      try {
        const body: Record<string, unknown> = {
          content: hook, platforms: ['threads'],
          thread_items: [{ content: `🔗 ${post.link}` }],
        };
        if (mediaUrls) body.media_urls = mediaUrls;
        const res = await fetch('/api/sns/post-now', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (Array.isArray(data.results)) {
          data.results.forEach((r: { platform: string; success: boolean; error?: string }) => {
            out.push({ postTitle: post.title, platform: r.platform, success: r.success, error: r.error });
          });
        } else out.push({ postTitle: post.title, platform: 'threads', success: false, error: data.error || '오류' });
      } catch (e) { out.push({ postTitle: post.title, platform: 'threads', success: false, error: String(e) }); }
    }
    if (others.length) {
      try {
        const body: Record<string, unknown> = { content: `${hook}\n\n🔗 ${post.link}`, platforms: others };
        if (mediaUrls) body.media_urls = mediaUrls;
        const res = await fetch('/api/sns/post-now', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (Array.isArray(data.results)) {
          data.results.forEach((r: { platform: string; success: boolean; error?: string }) => {
            out.push({ postTitle: post.title, platform: r.platform, success: r.success, error: r.error });
          });
        } else others.forEach(pl => out.push({ postTitle: post.title, platform: pl, success: false, error: data.error || '오류' }));
      } catch (e) { others.forEach(pl => out.push({ postTitle: post.title, platform: pl, success: false, error: String(e) })); }
    }
    return out;
  };

  // ── 수동 발행 ─────────────────────────────────────
  const handlePublish = async () => {
    const sel = posts.filter(p => selectedIds.has(p.id));
    const platforms = Array.from(selectedPlatforms);
    if (!platforms.length) { alert('SNS 계정을 1개 이상 선택해주세요'); return; }
    setPublishing(true);
    const allResults: PublishResult[] = [];
    for (const post of sel) {
      const msg = (messages[post.id] || buildMessage(post)).trim();
      allResults.push(...await publishPostToSNS(post, msg, platforms));
    }
    setResults(allResults); setPublishing(false); setDone(true);
  };

  // ── 자동 발행 시작 (서버에 작업 생성) ─────────────
  const startAutoRun = async () => {
    if (!siteId || autoSNS.size === 0) { alert('사이트와 SNS 계정을 선택해주세요'); return; }
    if (autoPageFrom > autoPageTo) { alert('시작 페이지가 끝 페이지보다 클 수 없습니다'); return; }

    setAutoStarting(true);
    try {
      const res = await fetch('/api/sns-auto-job/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          sns_platforms: Array.from(autoSNS),
          use_ai: autoUseAI,
          post_order: autoOrder,
          page_from: autoPageFrom,
          page_to: autoPageTo,
          interval_seconds: autoInterval,
        }),
      });
      const data = await res.json();
      if (data.job_id) {
        setJobId(data.job_id);
        setAutoJob({
          id: data.job_id, status: 'running',
          current_page: autoPageFrom, current_post_index: 0,
          total_done: 0, total_success: 0, total_failed: 0,
          page_from: autoPageFrom, page_to: autoPageTo,
          interval_seconds: autoInterval,
          next_run_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
        setJobLogs([]);
        setShowAutoLog(true);
      } else {
        alert(data.error || '작업 생성 실패');
      }
    } finally {
      setAutoStarting(false);
    }
  };

  // ── 자동 발행 중지 ────────────────────────────────
  const stopAutoRun = async () => {
    if (!jobId) return;
    await fetch('/api/sns-auto-job/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    });
    setAutoJob(prev => prev ? { ...prev, status: 'stopped' } : prev);
  };

  const isAutoRunning = autoJob?.status === 'running';
  const selectedPosts = posts.filter(p => selectedIds.has(p.id));

  // 예상 다음 발행 시간
  const nextRunSec = autoJob?.next_run_at
    ? Math.max(0, Math.round((new Date(autoJob.next_run_at).getTime() - Date.now()) / 1000))
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4 md:p-6">

        {/* Header */}
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">WordPress 글 → SNS 발행</h1>
            <p className="text-sm text-gray-400 mt-0.5">등록된 사이트의 글을 SNS에 공유하세요</p>
          </div>
          <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-1 shadow-sm">
            <button
              onClick={() => setTab('manual')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'manual' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
            >
              ✋ 수동 발행
            </button>
            <button
              onClick={() => setTab('auto')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'auto' ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
            >
              🤖 자동 발행
              {isAutoRunning && <span className="ml-1.5 w-2 h-2 bg-green-400 rounded-full inline-block animate-pulse" />}
            </button>
          </div>
        </div>

        {sites.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center">
            <p className="text-gray-400 mb-3">등록된 WordPress 사이트가 없습니다</p>
            <a href="/dashboard/wordpress" className="text-blue-500 underline text-sm">사이트 등록하러 가기 →</a>
          </div>
        ) : (
          <>
            {/* Site selector */}
            <div className="flex flex-wrap gap-2 mb-4">
              {sites.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSiteId(s.id); setPage(1); setSelectedIds(new Set()); }}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                    siteId === s.id ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  🌐 {s.site_name}
                </button>
              ))}
              <span className="flex items-center text-xs text-gray-400 ml-1">
                총 {total.toLocaleString()}개 · {totalPages}페이지
              </span>
            </div>

            {/* ═══ 자동 발행 탭 ═══ */}
            {tab === 'auto' && (
              <div className="space-y-4">
                {/* 설정 카드 */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-lg">⚙️</span>
                    <h2 className="font-bold text-gray-800">자동 발행 설정</h2>
                    <span className="ml-auto text-xs text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-full font-medium">
                      브라우저 종료 후에도 서버에서 계속 실행
                    </span>
                  </div>
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* SNS 선택 */}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                        📱 발행할 SNS
                      </label>
                      {snsConns.length === 0 ? (
                        <p className="text-sm text-gray-400">
                          연결된 계정 없음 · <a href="/dashboard/sns" className="text-blue-500 underline">연결하기 →</a>
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {snsConns.map(conn => (
                            <label key={conn.platform} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={autoSNS.has(conn.platform)}
                                onChange={e => {
                                  setAutoSNS(prev => { const n = new Set(prev); e.target.checked ? n.add(conn.platform) : n.delete(conn.platform); return n; });
                                }}
                                className="w-4 h-4 rounded text-indigo-600"
                                disabled={isAutoRunning}
                              />
                              <span className="text-lg">{PLATFORM_ICONS[conn.platform] || '📱'}</span>
                              <div>
                                <p className="text-sm font-medium text-gray-800">{PLATFORM_NAMES[conn.platform]}</p>
                                <p className="text-xs text-gray-400">@{conn.platform_username || conn.platform_display_name || '-'}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-5">
                      {/* AI 요약 */}
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                          ✨ AI 요약 문구
                        </label>
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                          <button
                            onClick={() => setAutoUseAI(!autoUseAI)}
                            disabled={isAutoRunning}
                            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${autoUseAI ? 'bg-indigo-500' : 'bg-gray-300'} disabled:opacity-50`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoUseAI ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                          <div>
                            <p className="text-sm font-medium text-gray-700">{autoUseAI ? 'AI 요약 사용' : '원문 요약 사용'}</p>
                            <p className="text-xs text-gray-400">{autoUseAI ? 'AI가 SNS용 후킹 문구 자동 생성' : '글 제목 + 발췌문 그대로 사용'}</p>
                          </div>
                        </div>
                      </div>

                      {/* 발행 순서 */}
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                          📋 발행 순서
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {([['desc', '최신글부터', '↓'], ['asc', '오래된글부터', '↑']] as const).map(([val, label, icon]) => (
                            <button
                              key={val}
                              onClick={() => setAutoOrder(val)}
                              disabled={isAutoRunning}
                              className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all disabled:opacity-50 ${autoOrder === val ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                            >
                              {icon} {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 페이지 범위 */}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                        📄 페이지 범위 <span className="text-gray-400 font-normal normal-case">(총 {totalPages}페이지 · {total.toLocaleString()}개 글)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-gray-400 mb-1">시작 페이지</p>
                          <input
                            type="number" min={1} max={totalPages} value={autoPageFrom}
                            onChange={e => setAutoPageFrom(Math.max(1, Math.min(totalPages, parseInt(e.target.value) || 1)))}
                            disabled={isAutoRunning}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 disabled:bg-gray-50"
                          />
                        </div>
                        <span className="text-gray-400 mt-5">~</span>
                        <div className="flex-1">
                          <p className="text-xs text-gray-400 mb-1">끝 페이지</p>
                          <input
                            type="number" min={1} max={totalPages} value={autoPageTo}
                            onChange={e => setAutoPageTo(Math.max(1, Math.min(totalPages, parseInt(e.target.value) || 1)))}
                            disabled={isAutoRunning}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 disabled:bg-gray-50"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-indigo-500 mt-1.5">
                        약 {Math.max(0, autoPageTo - autoPageFrom + 1) * 12}개 글 처리 예정
                      </p>
                    </div>

                    {/* 발행 간격 */}
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                        ⏱️ 발행 간격
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {INTERVAL_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setAutoInterval(opt.value)}
                            disabled={isAutoRunning}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border disabled:opacity-50 ${autoInterval === opt.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">글 1개 발행 후 {INTERVAL_OPTIONS.find(o => o.value === autoInterval)?.label} 대기</p>
                    </div>
                  </div>

                  {/* 시작/중지 버튼 */}
                  <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                    {!isAutoRunning ? (
                      <button
                        onClick={startAutoRun}
                        disabled={autoSNS.size === 0 || autoPageFrom > autoPageTo || autoStarting}
                        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        {autoStarting ? (
                          <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />작업 생성 중...</>
                        ) : (
                          <>🚀 자동 발행 시작 <span className="text-indigo-200 font-normal">(p.{autoPageFrom}~{autoPageTo} · {INTERVAL_OPTIONS.find(o => o.value === autoInterval)?.label} 간격)</span></>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={stopAutoRun}
                        className="w-full py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition flex items-center justify-center gap-2"
                      >
                        ⏹ 자동 발행 중지
                      </button>
                    )}
                  </div>
                </div>

                {/* 진행 현황 */}
                {autoJob && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isAutoRunning && <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />}
                        <h3 className="font-bold text-gray-800">
                          {autoJob.status === 'completed' ? '✅ 발행 완료' : isAutoRunning ? '발행 진행 중...' : '⏹ 발행 중지됨'}
                        </h3>
                        <span className="text-xs text-gray-400">p.{autoJob.current_page} / {autoJob.page_to}</span>
                      </div>
                      <button onClick={() => setShowAutoLog(!showAutoLog)} className="text-xs text-gray-400 hover:text-gray-600">
                        {showAutoLog ? '로그 숨기기' : '로그 보기'}
                      </button>
                    </div>
                    <div className="p-5 space-y-4">
                      {/* 진행바 */}
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-sm font-semibold text-gray-700">{autoJob.total_done}개 발행 완료</span>
                          {isAutoRunning && nextRunSec > 0 && (
                            <span className="text-xs text-indigo-500 font-semibold">다음 발행까지 {nextRunSec}초</span>
                          )}
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transition-all duration-500"
                            style={{
                              width: autoJob.page_to > autoJob.page_from
                                ? `${Math.min(100, ((autoJob.current_page - autoJob.page_from) / (autoJob.page_to - autoJob.page_from + 1)) * 100)}%`
                                : autoJob.status === 'completed' ? '100%' : '5%'
                            }}
                          />
                        </div>
                      </div>

                      {/* 통계 */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-black text-indigo-600">{autoJob.total_done}</div>
                          <div className="text-xs text-gray-400 mt-0.5">총 발행</div>
                        </div>
                        <div className="bg-green-50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-black text-green-600">{autoJob.total_success}</div>
                          <div className="text-xs text-gray-400 mt-0.5">성공</div>
                        </div>
                        <div className="bg-red-50 rounded-xl p-3 text-center">
                          <div className="text-2xl font-black text-red-500">{autoJob.total_failed}</div>
                          <div className="text-xs text-gray-400 mt-0.5">실패</div>
                        </div>
                      </div>

                      {/* 결과 로그 */}
                      {showAutoLog && jobLogs.length > 0 && (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto">
                          {jobLogs.map((r) => (
                            <div key={r.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl text-xs ${r.success ? 'bg-green-50' : 'bg-red-50'}`}>
                              <span className="shrink-0 mt-0.5">{r.success ? '✅' : '❌'}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold">{PLATFORM_ICONS[r.platform]} {PLATFORM_NAMES[r.platform] || r.platform}</span>
                                  <span className="text-gray-500 truncate">{r.post_title}</span>
                                  <span className="text-gray-300 ml-auto shrink-0">{fmtTime(r.created_at)}</span>
                                </div>
                                {r.error_message && <p className="text-red-500 mt-0.5 break-words">{r.error_message}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ 수동 발행 탭 ═══ */}
            {tab === 'manual' && (
              <>
                <div className="flex flex-wrap gap-2 mb-4">
                  <input
                    type="text" placeholder="글 검색..." value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
                    className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    <option value="publish">발행됨</option>
                    <option value="draft">임시저장</option>
                    <option value="any">전체</option>
                  </select>
                  <select value={order} onChange={e => { setOrder(e.target.value as 'desc' | 'asc'); setPage(1); }}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    <option value="desc">최신순</option>
                    <option value="asc">오래된순</option>
                  </select>
                  <button onClick={() => { setSearch(searchInput); setPage(1); }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                    🔍
                  </button>
                  <button onClick={loadPosts} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">↻</button>
                </div>

                {!loading && posts.length > 0 && (
                  <div className="flex items-center gap-4 mb-3">
                    <button onClick={toggleAll} className="text-sm text-blue-600 hover:underline">
                      {selectedIds.size === posts.length ? '전체 해제' : '전체 선택'}
                    </button>
                    <span className="text-sm text-gray-400">이 페이지 {posts.length}개</span>
                  </div>
                )}

                {loading ? (
                  <div className="flex justify-center py-24">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : posts.length === 0 ? (
                  <div className="bg-white rounded-xl py-16 text-center text-gray-400">글이 없습니다</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-28">
                    {posts.map(post => {
                      const selected = selectedIds.has(post.id);
                      return (
                        <div key={post.id} onClick={() => togglePost(post.id)}
                          className={`bg-white rounded-xl overflow-hidden border-2 cursor-pointer transition-all select-none ${
                            selected ? 'border-blue-500 shadow-md ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300 hover:shadow'
                          }`}
                        >
                          <div className="relative h-44 bg-gray-100">
                            {post.featured_image_thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={post.featured_image_thumb} alt={post.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300 text-5xl">📝</div>
                            )}
                            <div className={`absolute top-2 right-2 w-7 h-7 rounded-full border-2 flex items-center justify-center shadow transition ${selected ? 'bg-blue-500 border-blue-500' : 'bg-white/90 border-gray-300'}`}>
                              {selected && <span className="text-white text-sm font-bold">✓</span>}
                            </div>
                            {post.status !== 'publish' && (
                              <span className="absolute top-2 left-2 bg-amber-400 text-amber-900 text-xs font-medium px-2 py-0.5 rounded-full">임시저장</span>
                            )}
                          </div>
                          <div className="p-4">
                            <p className="font-semibold text-gray-800 text-sm leading-snug line-clamp-2 mb-1">{post.title}</p>
                            <p className="text-xs text-gray-400 mb-2">{fmtDate(post.date)}</p>
                            {post.excerpt && <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{post.excerpt}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mb-6 flex-wrap">
                    <button onClick={() => setPage(1)} disabled={page === 1} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">««</button>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">← 이전</button>
                    <form onSubmit={e => { e.preventDefault(); const n = parseInt(pageInput); if (!isNaN(n)) setPage(Math.max(1, Math.min(totalPages, n))); }} className="flex items-center gap-1">
                      <input type="number" min={1} max={totalPages} value={pageInput} onChange={e => setPageInput(e.target.value)}
                        className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none" />
                      <span className="text-sm text-gray-400">/ {totalPages}</span>
                      <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">이동</button>
                    </form>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">다음 →</button>
                    <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50">»»</button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── 수동 발행 floating bar ─────────────────── */}
      {tab === 'manual' && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl px-4 py-3 z-40">
          <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{selectedIds.size}개 선택됨</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">선택 해제</button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUseAI(!useAI)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${useAI ? 'bg-purple-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useAI ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="text-xs text-gray-500">{useAI ? '✨ AI 요약 ON' : 'AI 요약 OFF'}</span>
              </div>
            </div>
            <button onClick={openModal} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition shadow-sm">
              SNS 발행하기 →
            </button>
          </div>
        </div>
      )}

      {/* ── 수동 발행 모달 ─────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-bold text-gray-800">{done ? '발행 결과' : 'SNS 발행 설정'}</h2>
              <button onClick={() => { setShowModal(false); setDone(false); }} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto flex-1 p-6">
              {done ? (
                <div>
                  <div className="space-y-2 mb-6">
                    {results.map((r, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${r.success ? 'bg-green-50' : 'bg-red-50'}`}>
                        <span className="text-xl shrink-0">{r.success ? '✅' : '❌'}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{PLATFORM_ICONS[r.platform] || '📱'} {PLATFORM_NAMES[r.platform] || r.platform}</p>
                          <p className="text-xs text-gray-500 truncate">{r.postTitle}</p>
                          {r.error && <p className="text-xs text-red-500 mt-0.5 break-words">{r.error}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => { setShowModal(false); setDone(false); setSelectedIds(new Set()); }}
                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">완료</button>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">선택된 글 ({selectedPosts.length}개)</h3>
                      {useAI && <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full">✨ AI 후킹 문구 자동 생성</span>}
                    </div>
                    <div className="space-y-4">
                      {selectedPosts.map(post => {
                        const isGenerating = generating.has(post.id);
                        return (
                          <div key={post.id} className="border border-gray-200 rounded-xl overflow-hidden">
                            <div className="flex gap-3 p-3 bg-gray-50 border-b border-gray-100">
                              {post.featured_image_thumb && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={post.featured_image_thumb} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 line-clamp-2">{post.title}</p>
                                <a href={post.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                  className="text-xs text-blue-500 hover:underline truncate block mt-0.5">{post.link}</a>
                                {!post.featured_image && <span className="text-xs text-amber-500 mt-0.5 block">⚠️ 대표이미지 없음</span>}
                              </div>
                            </div>
                            <div className="p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="text-xs text-gray-400">후킹 문구 (수정 가능)</label>
                                {useAI && (
                                  <button onClick={() => generateHook(post)} disabled={isGenerating}
                                    className="text-xs text-purple-600 hover:text-purple-800 disabled:opacity-40 flex items-center gap-1">
                                    {isGenerating ? <><span className="w-3 h-3 border border-purple-500 border-t-transparent rounded-full animate-spin inline-block" /> 생성 중...</> : '↺ AI 재생성'}
                                  </button>
                                )}
                              </div>
                              <div className="relative">
                                <textarea
                                  value={messages[post.id] || ''}
                                  onChange={e => setMessages(prev => ({ ...prev, [post.id]: e.target.value }))}
                                  rows={5} disabled={isGenerating}
                                  className={`w-full text-sm border rounded-lg p-2.5 resize-y focus:outline-none focus:ring-2 focus:ring-purple-200 transition ${isGenerating ? 'border-purple-200 bg-purple-50 text-gray-400' : 'border-gray-200'}`}
                                />
                                {isGenerating && (
                                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-purple-100 text-purple-600 text-xs px-2 py-1 rounded-full">
                                    <span className="w-3 h-3 border border-purple-500 border-t-transparent rounded-full animate-spin" />AI 생성 중
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">발행할 SNS 계정</h3>
                    {snsConns.length === 0 ? (
                      <div className="text-center py-6 bg-gray-50 rounded-xl">
                        <p className="text-sm text-gray-400 mb-2">연결된 SNS 계정이 없습니다</p>
                        <a href="/dashboard/sns" className="text-sm text-blue-500 underline">SNS 연결하러 가기 →</a>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {snsConns.map(conn => (
                          <label key={conn.platform} className="flex items-center gap-3 p-3.5 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition">
                            <input type="checkbox" checked={selectedPlatforms.has(conn.platform)}
                              onChange={e => { setSelectedPlatforms(prev => { const n = new Set(prev); e.target.checked ? n.add(conn.platform) : n.delete(conn.platform); return n; }); }}
                              className="w-4 h-4 rounded text-blue-600" />
                            <span className="text-xl">{PLATFORM_ICONS[conn.platform] || '📱'}</span>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{PLATFORM_NAMES[conn.platform] || conn.platform}</p>
                              <p className="text-xs text-gray-400">@{conn.platform_username || conn.platform_display_name || '-'}{conn.platform === 'threads' && <span className="ml-1 text-purple-400">· 링크는 댓글로</span>}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={handlePublish} disabled={publishing || selectedPlatforms.size === 0}
                    className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2">
                    {publishing ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />발행 중...</> : `${selectedPosts.length}개 글 SNS 발행하기`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
