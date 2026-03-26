'use client';

import { useState, useEffect, useCallback } from 'react';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface AmebaConnection {
  blog_id: string;
  email: string;
  cookies_updated_at: string | null;
}

interface HistoryItem {
  id: string;
  title: string;
  post_url: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

type Tab = 'publish' | 'settings' | 'history';

// ── 상태 배지 ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-emerald-100 text-emerald-700',
    error: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
  };
  const c = colors[status] || 'bg-gray-100 text-gray-600';
  const labels: Record<string, string> = {
    success: '발행완료',
    error: '실패',
    pending: '대기중',
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${c}`}>
      {labels[status] || status}
    </span>
  );
}

// ── 에이전트 안내 ─────────────────────────────────────────────────────────────

function AgentGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs text-pink-600 hover:text-pink-800 font-medium flex items-center gap-1"
      >
        🤖 에이전트 실행 방법 {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-2 bg-pink-50 border border-pink-200 rounded-xl p-4 text-xs text-pink-900 space-y-2">
          <p className="font-bold text-pink-800">🌸 아메바 에이전트 실행</p>
          <p>발행은 로컬 Mac에서 실행되는 Playwright 에이전트가 처리합니다.</p>
          <div className="bg-pink-100 rounded-lg p-2 font-mono text-[11px]">
            node scripts/ameba-agent.js
          </div>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>node scripts/ameba-agent.js</strong> — 연속 실행 (10초마다 폴링)</li>
            <li><strong>node scripts/ameba-agent.js --once</strong> — 현재 대기 작업만 처리</li>
          </ul>
          <p className="text-pink-700 bg-pink-100 p-2 rounded-lg">
            ⚠️ 에이전트 실행 전 <code className="bg-pink-200 px-1 rounded">.env.local</code>에
            NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 설정되어 있어야 합니다.
          </p>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function AmebaPage() {
  const [tab, setTab] = useState<Tab>('publish');

  // 연결
  const [conn, setConn] = useState<AmebaConnection | null>(null);
  const [connForm, setConnForm] = useState({ email: '', password: '', blog_id: '' });
  const [connMsg, setConnMsg] = useState('');
  const [connSaving, setConnSaving] = useState(false);

  // 발행
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishResult, setPublishResult] = useState<{ postUrl?: string } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState('');

  // 히스토리
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // ── 데이터 로드 ──────────────────────────────────────────────────────────

  const loadConn = useCallback(async () => {
    const r = await fetch('/api/ameba/connect');
    if (r.ok) {
      const d = await r.json() as { connected: boolean; connection: AmebaConnection | null };
      if (d.connected && d.connection) {
        setConn(d.connection);
        setConnForm(prev => ({ ...prev, email: d.connection!.email, blog_id: d.connection!.blog_id }));
      }
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const r = await fetch('/api/ameba/history');
    if (r.ok) {
      const d = await r.json() as { history: HistoryItem[] };
      setHistory(d.history || []);
    }
  }, []);

  useEffect(() => {
    loadConn();
    loadHistory();
  }, [loadConn, loadHistory]);

  // ── 연결 설정 저장 ───────────────────────────────────────────────────────

  const handleSaveConn = async () => {
    setConnSaving(true);
    setConnMsg('');
    const r = await fetch('/api/ameba/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: connForm.email.trim(),
        blog_id: connForm.blog_id.trim(),
        password: connForm.password || undefined,
      }),
    });
    const d = await r.json() as { ok?: boolean; error?: string };
    if (r.ok && d.ok) {
      setConnMsg('✓ 저장 완료');
      setConn({ blog_id: connForm.blog_id, email: connForm.email, cookies_updated_at: null });
    } else {
      setConnMsg(`⚠️ ${d.error || '저장 실패'}`);
    }
    setConnSaving(false);
  };

  const handleDisconnect = async () => {
    if (!confirm('아메바 연결을 해제하시겠습니까?')) return;
    await fetch('/api/ameba/connect', { method: 'DELETE' });
    setConn(null);
    setConnForm({ email: '', password: '', blog_id: '' });
    setConnMsg('연결이 해제되었습니다.');
  };

  // ── 발행 ─────────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!title.trim()) { setPublishError('제목이 필요합니다'); return; }
    if (!content.trim()) { setPublishError('내용이 필요합니다'); return; }
    if (!conn?.blog_id) { setPublishError('아메바 블로그 연결 설정이 필요합니다'); return; }

    setPublishing(true);
    setPublishResult(null);
    setPublishError('');
    setJobId(null);
    setJobStatus('대기열 등록 중...');

    try {
      const res = await fetch('/api/ameba/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content, category: category.trim() }),
      });
      const data = await res.json() as {
        ok?: boolean;
        postUrl?: string;
        pending?: boolean;
        jobId?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setPublishError(data.error || `오류 (${res.status})`);
        setJobStatus('');
        return;
      }

      if (data.pending && data.jobId) {
        // 에이전트가 처리 중 — 폴링
        const newJobId = data.jobId;
        setJobId(newJobId);
        setJobStatus('로컬 에이전트 처리 중...');
        setPublishing(false);

        const poll = setInterval(async () => {
          const r = await fetch(`/api/ameba/publish?job_id=${newJobId}`);
          if (!r.ok) return;
          const j = await r.json() as { status: string; result_url?: string; error?: string };
          if (j.status === 'done') {
            clearInterval(poll);
            setJobStatus('');
            setPublishResult({ postUrl: j.result_url });
            loadHistory();
          } else if (j.status === 'error') {
            clearInterval(poll);
            setJobStatus('');
            setPublishError(j.error || '발행 실패');
          }
        }, 3000);
        // 3분 후 폴링 자동 중단
        setTimeout(() => clearInterval(poll), 180000);
      } else if (data.ok) {
        setPublishResult({ postUrl: data.postUrl });
        setJobStatus('');
        setPublishing(false);
        loadHistory();
      }
    } catch (e) {
      setPublishError('네트워크 오류: ' + String(e));
      setJobStatus('');
      setPublishing(false);
    }
  };

  // ── 렌더 ─────────────────────────────────────────────────────────────────

  const isConnected = !!(conn?.blog_id && conn?.email);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <h1 className="text-lg font-black text-gray-900">🌸 アメブロ 자동 발행</h1>
            <p className="text-xs text-gray-400 mt-0.5">Playwright 로컬 에이전트 방식 (ameba-agent.js)</p>
          </div>
          <div className="flex items-center gap-3">
            {/* 연결 상태 배지 */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {isConnected
                ? `${conn?.blog_id} 연결됨`
                : '미연결'}
            </div>
            {/* 탭 네비게이션 */}
            <nav className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {(
                [
                  ['publish', '✍️', '발행'],
                  ['settings', '🔑', '설정'],
                  ['history', '📋', '이력'],
                ] as [Tab, string, string][]
              ).map(([key, icon, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    tab === key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">

        {/* ══ TAB: 발행 ══ */}
        {tab === 'publish' && (
          <div className="space-y-4">

            {/* 에이전트 경고 */}
            <div className="bg-pink-50 border border-pink-200 rounded-2xl p-4">
              <p className="text-xs font-semibold text-pink-800">
                🤖 아메바 에이전트를 실행해야 합니다:
                <code className="ml-2 bg-pink-100 px-2 py-0.5 rounded font-mono">
                  node scripts/ameba-agent.js
                </code>
              </p>
              <p className="text-xs text-pink-600 mt-1">
                발행 요청은 Supabase 큐에 등록되며, 로컬 Playwright 에이전트가 아메바 블로그에 자동으로 게시합니다.
              </p>
              <AgentGuide />
            </div>

            {/* 미연결 경고 */}
            {!isConnected && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-semibold text-amber-800 mb-1">⚠️ 아메바 블로그 미연결</p>
                <p className="text-xs text-amber-700 mb-2">
                  설정 탭에서 이메일, 비밀번호, 블로그 ID를 입력하세요.
                </p>
                <button
                  onClick={() => setTab('settings')}
                  className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-semibold"
                >
                  설정하기 →
                </button>
              </div>
            )}

            {/* 제목 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="記事タイトル (제목 입력)"
                className="w-full text-xl font-bold text-gray-900 placeholder-gray-300 focus:outline-none"
              />
            </div>

            {/* 카테고리 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">카테고리 (선택)</label>
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="カテゴリー名 (선택사항)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-pink-400"
              />
            </div>

            {/* 본문 에디터 */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
                <span className="text-sm font-semibold text-gray-700">본문 (HTML)</span>
                <button
                  onClick={() => setPreview(v => !v)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    preview
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {preview ? '편집' : '미리보기'}
                </button>
              </div>
              {preview ? (
                <div
                  className="p-5 prose prose-sm max-w-none min-h-[300px] text-gray-800"
                  dangerouslySetInnerHTML={{
                    __html: content || '<p class="text-gray-400">내용을 입력하세요</p>',
                  }}
                />
              ) : (
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="HTML 본문을 입력하세요&#10;&#10;예시:&#10;&lt;p&gt;こんにちは！今日は...&lt;/p&gt;"
                  className="w-full px-5 py-4 text-sm font-mono text-gray-800 focus:outline-none resize-none min-h-[300px]"
                  rows={16}
                />
              )}
            </div>

            {/* 발행 컨트롤 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-sm text-gray-800 mb-3">🌸 アメブロ 발행</h3>

              {publishError && (
                <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-200">
                  <p className="text-xs text-red-700">⚠️ {publishError}</p>
                </div>
              )}

              {publishResult && (
                <div className="mb-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <p className="text-xs font-semibold text-emerald-800">✅ 발행 완료!</p>
                  {publishResult.postUrl && (
                    <a
                      href={publishResult.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-600 hover:text-emerald-800 underline mt-1 block"
                    >
                      {publishResult.postUrl}
                    </a>
                  )}
                </div>
              )}

              {jobStatus && (
                <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <p className="text-xs font-semibold text-blue-800 animate-pulse">⏳ {jobStatus}</p>
                  <p className="text-[10px] text-blue-600 mt-1">
                    로컬 에이전트가 처리 중입니다. Mac에서{' '}
                    <code className="bg-blue-100 px-1 rounded">node scripts/ameba-agent.js</code> 실행 확인
                  </p>
                  {jobId && (
                    <p className="text-[10px] text-blue-500 mt-0.5">Job ID: {jobId}</p>
                  )}
                </div>
              )}

              <button
                onClick={handlePublish}
                disabled={
                  publishing ||
                  !!jobStatus ||
                  !isConnected ||
                  !title.trim() ||
                  !content.trim()
                }
                className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {publishing ? (
                  <><span className="animate-spin">⏳</span> 등록 중...</>
                ) : jobStatus ? (
                  <><span className="animate-spin">⏳</span> {jobStatus}</>
                ) : (
                  <>🌸 アメブロ 발행하기</>
                )}
              </button>
              <p className="text-[10px] text-gray-400 mt-2 text-center">
                발행은 로컬 에이전트(Playwright)가 처리합니다 — 에이전트가 실행 중이어야 합니다
              </p>
            </div>
          </div>
        )}

        {/* ══ TAB: 설정 ══ */}
        {tab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">

            {/* 연결 상태 카드 */}
            {isConnected && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-emerald-800">
                    {conn!.blog_id} 연결됨
                  </p>
                  <p className="text-xs text-emerald-600">
                    계정: {conn!.email}
                  </p>
                  {conn!.blog_id && (
                    <a
                      href={`https://ameblo.jp/${conn!.blog_id}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-600 hover:text-emerald-800 underline"
                    >
                      https://ameblo.jp/{conn!.blog_id}/
                    </a>
                  )}
                  {conn!.cookies_updated_at && (
                    <p className="text-xs text-emerald-500 mt-0.5">
                      쿠키 업데이트: {new Date(conn!.cookies_updated_at).toLocaleString('ko-KR')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 블로그 연결 폼 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-bold text-sm text-gray-900">🌸 アメブロ 계정 연결</h2>
              <p className="text-xs text-gray-500">
                아메바 로그인 정보를 입력하세요. 비밀번호는 에이전트가 자동 로그인에 사용합니다.
              </p>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  이메일 (Ameba 로그인 이메일) <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={connForm.email}
                  onChange={e => setConnForm(p => ({ ...p, email: e.target.value.trim() }))}
                  placeholder="your@email.com"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  비밀번호 <span className="text-gray-400">(에이전트 자동 로그인에 사용)</span>
                </label>
                <input
                  type="password"
                  value={connForm.password}
                  onChange={e => setConnForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Ameba 비밀번호"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-pink-400"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  ⚠️ 비밀번호는 DB에 평문 저장됩니다. RLS 정책으로 본인만 접근 가능합니다.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  블로그 ID <span className="text-red-400">*</span>
                </label>
                <input
                  value={connForm.blog_id}
                  onChange={e => setConnForm(p => ({ ...p, blog_id: e.target.value.trim() }))}
                  placeholder="ameblo.jp/여기에입력한ID"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-400"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  ameblo.jp/<strong>blog-id</strong> 형식의 블로그 주소에서 blog-id 부분
                </p>
                {connForm.blog_id && (
                  <p className="text-[10px] text-pink-500 mt-0.5">
                    → https://ameblo.jp/{connForm.blog_id}/
                  </p>
                )}
              </div>

              {connMsg && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium ${
                    connMsg.startsWith('✓') || connMsg.includes('해제')
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {connMsg}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleSaveConn}
                  disabled={connSaving || !connForm.email || !connForm.blog_id}
                  className="flex-1 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white py-2.5 rounded-xl font-bold text-sm transition-colors"
                >
                  {connSaving ? '저장 중...' : '💾 저장'}
                </button>
                {isConnected && (
                  <button
                    onClick={handleDisconnect}
                    className="px-4 bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 py-2.5 rounded-xl font-semibold text-sm transition-colors border border-gray-200 hover:border-red-200"
                  >
                    연결 해제
                  </button>
                )}
              </div>
            </div>

            {/* 아메바 에이전트 안내 */}
            <div className="bg-pink-50 border border-pink-200 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-pink-900">🤖 로컬 에이전트 실행 방법</h3>
              <ol className="text-xs text-pink-800 space-y-2 list-decimal pl-4">
                <li>
                  프로젝트 루트에서 에이전트 실행:
                  <div className="mt-1 bg-pink-100 rounded-lg p-2 font-mono text-[11px]">
                    node scripts/ameba-agent.js
                  </div>
                </li>
                <li>
                  한 번만 실행 (현재 대기 작업만):
                  <div className="mt-1 bg-pink-100 rounded-lg p-2 font-mono text-[11px]">
                    node scripts/ameba-agent.js --once
                  </div>
                </li>
                <li>
                  필수 환경변수 <code className="bg-pink-100 px-1 rounded">.env.local</code>:
                  <div className="mt-1 bg-pink-100 rounded-lg p-2 font-mono text-[11px] space-y-0.5">
                    <div>NEXT_PUBLIC_SUPABASE_URL=...</div>
                    <div>SUPABASE_SERVICE_ROLE_KEY=...</div>
                  </div>
                </li>
              </ol>
              <p className="text-xs text-pink-700">
                💡 에이전트는 Playwright를 사용하여 실제 Chrome 브라우저로 アメブロ에 로그인하고 게시합니다.
                쿠키가 유효한 경우 자동 로그인되며, 만료 시 이메일/비밀번호로 재로그인합니다.
              </p>
            </div>
          </div>
        )}

        {/* ══ TAB: 이력 ══ */}
        {tab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-gray-800">📋 발행 이력</h2>
              <button
                onClick={loadHistory}
                className="text-xs text-indigo-500 hover:text-indigo-700"
              >
                ↻ 새로고침
              </button>
            </div>

            {history.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <p className="text-gray-400 text-sm">발행 이력이 없습니다</p>
                <p className="text-[11px] text-gray-300 mt-1">발행 탭에서 글을 등록하면 여기에 표시됩니다</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {history.map(h => (
                    <div key={h.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{h.title}</p>
                          {h.post_url && (
                            <a
                              href={h.post_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-pink-600 hover:text-pink-800 truncate block mt-0.5"
                            >
                              {h.post_url}
                            </a>
                          )}
                          {h.error && (
                            <p className="text-[10px] text-red-500 mt-0.5 truncate">⚠️ {h.error}</p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1">
                            {new Date(h.created_at).toLocaleString('ko-KR')}
                          </p>
                        </div>
                        <StatusBadge status={h.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
