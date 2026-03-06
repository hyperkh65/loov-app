'use client';

import { useState, useEffect, useCallback } from 'react';

// ── 타입 ──────────────────────────────────────────────────────────────────────

interface NaverConnection {
  blog_id: string;
  blog_name: string;
  nid_aut: string;
  nid_ses: string;
  categories: NaverCategory[];
  last_tested_at: string | null;
}
interface NaverCategory { no: number; name: string; }
interface NotionArticle { id: string; title: string; status: string; lastEdited: string; }
interface PublishResult { postId?: string; postUrl?: string; error?: string; errorCode?: string; }
interface HistoryItem { id: string; title: string; post_url: string; status: string; created_at: string; }

type Tab = 'publish' | 'settings' | 'history';

// ── 상태 배지 ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  '완료': 'bg-emerald-100 text-emerald-700', '발행완료': 'bg-emerald-100 text-emerald-700',
  'Done': 'bg-emerald-100 text-emerald-700', '작성중': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-blue-100 text-blue-700', '대기': 'bg-amber-100 text-amber-700',
  'Not Started': 'bg-gray-100 text-gray-600',
};
function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || 'bg-gray-100 text-gray-600';
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${c}`}>{status || '—'}</span>;
}

// ── 쿠키 가이드 컴포넌트 ──────────────────────────────────────────────────────

function CookieGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button onClick={() => setOpen((v) => !v)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
        📖 쿠키 추출 방법 {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-2">
          <p className="font-bold text-amber-800">🍪 네이버 쿠키 추출 방법 (Chrome 기준)</p>
          <ol className="list-decimal pl-4 space-y-1.5">
            <li><strong>네이버에 로그인</strong>한 후 <a href="https://www.naver.com" target="_blank" rel="noopener" className="text-blue-600 underline">naver.com</a>에 접속</li>
            <li><strong>F12</strong> → 개발자 도구 열기</li>
            <li><strong>Application</strong> 탭 클릭</li>
            <li>왼쪽 <strong>Cookies → https://www.naver.com</strong> 클릭</li>
            <li>목록에서 <code className="bg-amber-100 px-1 rounded">NID_AUT</code> 찾아서 Value 복사 → NID_AUT 칸에 붙여넣기</li>
            <li>목록에서 <code className="bg-amber-100 px-1 rounded">NID_SES</code> 찾아서 Value 복사 → NID_SES 칸에 붙여넣기</li>
          </ol>
          <p className="text-amber-700 bg-amber-100 p-2 rounded-lg">
            ⚠️ 쿠키는 보통 <strong>14~30일</strong>마다 만료됩니다. 만료되면 재입력이 필요합니다.
          </p>
          <p className="text-amber-700">
            💡 보안 강화: 네이버 계정 설정 → 보안 → "PC방문 시 자동로그인 허용" 체크 해제 상태에서는 쿠키 유효기간이 짧을 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function NaverPage() {
  const [tab, setTab] = useState<Tab>('publish');

  // 연결
  const [conn, setConn] = useState<NaverConnection | null>(null);
  const [connForm, setConnForm] = useState({ blog_id: '', blog_name: '', nid_aut: '', nid_ses: '' });
  const [connMsg, setConnMsg] = useState('');
  const [connSaving, setConnSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; blogName?: string; categories?: NaverCategory[]; error?: string } | null>(null);

  // 노션
  const [articles, setArticles] = useState<NotionArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NotionArticle | null>(null);
  const [notionConnected, setNotionConnected] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);

  // 편집기
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [categoryNo, setCategoryNo] = useState(0);
  const [publishStatus, setPublishStatus] = useState<'publish' | 'draft'>('publish');
  const [preview, setPreview] = useState(false);
  const [targetKeyword, setTargetKeyword] = useState('');

  // 리라이팅/자동화
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState('');
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoStep, setAutoStep] = useState('');
  const [snsHook, setSnsHook] = useState('');

  // 발행
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [publishError, setPublishError] = useState('');

  // 히스토리
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // ── 데이터 로드 ──────────────────────────────────────────────────────────

  const loadConn = useCallback(async () => {
    const r = await fetch('/api/naver/connect');
    if (r.ok) {
      const d = await r.json() as NaverConnection | null;
      if (d) {
        setConn(d);
        setConnForm({ blog_id: d.blog_id, blog_name: d.blog_name, nid_aut: d.nid_aut, nid_ses: d.nid_ses });
      }
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const r = await fetch('/api/naver/history');
    if (r.ok) setHistory(await r.json());
  }, []);

  const loadNotionStatus = useCallback(async () => {
    const r = await fetch('/api/wordpress/notion?action=settings');
    if (r.ok) { const d = await r.json(); if (d) setNotionConnected(true); }
  }, []);

  useEffect(() => { loadConn(); loadHistory(); loadNotionStatus(); }, [loadConn, loadHistory, loadNotionStatus]);

  const loadArticles = async () => {
    setArticlesLoading(true);
    const r = await fetch('/api/wordpress/notion?action=articles');
    if (r.ok) setArticles(await r.json());
    setArticlesLoading(false);
  };
  useEffect(() => { if (notionConnected) loadArticles(); }, [notionConnected]); // eslint-disable-line

  const selectArticle = async (a: NotionArticle) => {
    setSelectedArticle(a); setTitle(a.title); setContentLoading(true);
    setPublishResult(null); setPublishError(''); setAutoStep(''); setSnsHook('');
    const r = await fetch(`/api/wordpress/notion?action=content&id=${a.id}`);
    if (r.ok) { const d = await r.json(); setTitle(d.title || a.title); setContent(d.html || ''); }
    setContentLoading(false);
  };

  // ── 연결 설정 저장 ───────────────────────────────────────────────────────

  const handleSaveConn = async () => {
    setConnSaving(true); setConnMsg('');
    const r = await fetch('/api/naver/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connForm),
    });
    const d = await r.json();
    if (r.ok) { setConn(d); setConnMsg('✓ 저장 완료'); }
    else setConnMsg(`⚠️ ${(d as { error?: string }).error}`);
    setConnSaving(false);
  };

  const handleTestConn = async () => {
    setTesting(true); setTestResult(null); setConnMsg('');
    const r = await fetch('/api/naver/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blog_id: connForm.blog_id, nid_aut: connForm.nid_aut, nid_ses: connForm.nid_ses }),
    });
    const d = await r.json() as typeof testResult;
    setTestResult(d);
    if (r.ok && (d as { ok?: boolean }).ok) {
      setConnMsg('✓ 연결 성공! 카테고리 업데이트 완료');
      setConn((prev) => prev ? { ...prev, categories: (d as { categories?: NaverCategory[] }).categories || [] } : prev);
    }
    setTesting(false);
  };

  // ── SEO 리라이팅 ─────────────────────────────────────────────────────────

  const handleRewrite = async () => {
    if (!content.trim()) return;
    setRewriting(true); setRewriteError('');
    try {
      const res = await fetch('/api/wordpress/rewrite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, targetKeyword: targetKeyword.trim() }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setRewriteError((e as { error?: string }).error || `오류`); return; }
      setContent((await res.json() as { content: string }).content);
    } catch (e) { setRewriteError(String(e)); }
    finally { setRewriting(false); }
  };

  // ── 자동화 (AI 제목/태그/후킹 생성) ──────────────────────────────────────

  const handleAutoGenerate = async () => {
    if (!content.trim() && !title.trim()) { setPublishError('내용을 먼저 입력하거나 노션 아티클을 선택하세요'); return; }
    setAutoGenerating(true); setPublishError(''); setAutoStep('✨ AI 제목/태그/후킹 생성 중...');
    try {
      const res = await fetch('/api/wordpress/auto-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error((data as { error?: string }).error || '자동 생성 실패');

      const newTitle = (data.seoTitle as string) || title;
      setTitle(newTitle);
      setTags((data.tags as string[] | undefined)?.join(', ') || tags);
      setHashtags((data.hashtags as string) || '');
      setSnsHook((data.snsHook as string) || '');
      setAutoStep('✅ 자동화 완료!');
    } catch (e) { setPublishError(String(e)); setAutoStep(''); }
    finally { setAutoGenerating(false); }
  };

  // ── 발행 ─────────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) { setPublishError('제목과 내용이 필요합니다'); return; }
    if (!conn?.blog_id) { setPublishError('네이버 블로그 연결 설정이 필요합니다'); return; }
    if (!conn.nid_aut || !conn.nid_ses) { setPublishError('쿠키(NID_AUT, NID_SES)를 설정 탭에서 입력해주세요'); return; }

    setPublishing(true); setPublishResult(null); setPublishError('');
    try {
      const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch('/api/naver/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), content, tags: parsedTags,
          categoryNo, status: publishStatus,
          notionPageId: selectedArticle?.id || '',
        }),
      });
      const data = await res.json() as PublishResult & { error?: string };
      if (!res.ok) {
        setPublishError(data.error || `발행 실패 (${res.status})`);
        if (data.errorCode === 'AUTH') setTab('settings');
        return;
      }
      setPublishResult(data);
      loadHistory();
    } catch (e) { setPublishError('네트워크 오류: ' + String(e)); }
    finally { setPublishing(false); }
  };

  // ── 렌더 ─────────────────────────────────────────────────────────────────

  const isConnected = !!(conn?.blog_id && conn?.nid_aut && conn?.nid_ses);
  const categories = conn?.categories || [];

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-lg font-black text-gray-900">🟢 네이버 블로그 자동 발행</h1>
            <p className="text-xs text-gray-400 mt-0.5">노션 DB → 네이버 블로그 자동 발행</p>
          </div>
          <div className="flex items-center gap-3">
            {/* 연결 상태 */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {isConnected ? `${conn?.blog_name || conn?.blog_id} 연결됨` : '미연결'}
            </div>
            <nav className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {([['publish','✍️','발행'],['settings','🔑','설정'],['history','📋','히스토리']] as [Tab,string,string][]).map(([key,icon,label]) => (
                <button key={key} onClick={() => setTab(key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab===key?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>{icon} {label}</button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">

        {/* ══ TAB: 발행 ══ */}
        {tab === 'publish' && (
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">

            {/* 좌측: 노션 목록 */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <h2 className="font-bold text-sm text-gray-800">📔 노션 아티클</h2>
                  <button onClick={loadArticles} disabled={articlesLoading || !notionConnected} className="text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-40">
                    {articlesLoading ? '로딩...' : '↻'}
                  </button>
                </div>
                {!notionConnected ? (
                  <div className="p-4 text-center"><p className="text-xs text-gray-400 mb-2">노션 연동 필요</p><a href="/dashboard/wordpress" className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-medium">WordPress 탭에서 설정 →</a></div>
                ) : articlesLoading ? <div className="p-6 text-center text-xs text-gray-400">불러오는 중...</div>
                : articles.length === 0 ? <div className="p-6 text-center text-xs text-gray-400">아티클 없음</div>
                : (
                  <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-50">
                    {articles.map((a) => (
                      <button key={a.id} onClick={() => selectArticle(a)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedArticle?.id===a.id?'bg-green-50 border-l-2 border-green-400':''}`}>
                        <div className="flex items-start justify-between gap-2"><p className="text-xs font-medium text-gray-800 line-clamp-2 flex-1">{a.title}</p><StatusBadge status={a.status} /></div>
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(a.lastEdited).toLocaleDateString('ko-KR')}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 연결 경고 */}
              {!isConnected && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-amber-800 mb-1">⚠️ 네이버 블로그 미연결</p>
                  <p className="text-xs text-amber-700 mb-2">설정 탭에서 블로그 ID와 쿠키를 입력하세요.</p>
                  <button onClick={() => setTab('settings')} className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-semibold">설정하기 →</button>
                </div>
              )}
            </div>

            {/* 우측: 에디터 */}
            <div className="space-y-4">
              {/* 제목 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 입력" className="w-full text-xl font-bold text-gray-900 placeholder-gray-300 focus:outline-none" />
              </div>

              {/* 메타 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">카테고리</label>
                    <select value={categoryNo} onChange={(e) => setCategoryNo(parseInt(e.target.value))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400">
                      <option value={0}>카테고리 없음</option>
                      {categories.map((c) => (
                        <option key={c.no} value={c.no}>{c.name}</option>
                      ))}
                    </select>
                    {categories.length === 0 && conn?.blog_id && (
                      <p className="text-[10px] text-gray-400 mt-1">연결 테스트 후 카테고리가 로드됩니다</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">태그 <span className="font-normal text-gray-400">(쉼표 구분, 최대 30개)</span></label>
                    <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="맛집, 여행, 추천" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">해시태그 <span className="font-normal text-gray-400">(자동화 생성)</span></label>
                    <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#태그1 #태그2 ..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400 font-mono text-xs" />
                  </div>
                </div>
              </div>

              {/* SNS 후킹 (자동화 후) */}
              {snsHook && (
                <div className="bg-green-50 rounded-2xl border border-green-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-green-700">📲 SNS 후킹 요약본</span>
                    <button onClick={() => setSnsHook('')} className="text-[10px] text-green-400 hover:text-green-600">✕</button>
                  </div>
                  <textarea value={snsHook} onChange={(e) => setSnsHook(e.target.value)} rows={4} className="w-full text-xs text-green-800 bg-transparent focus:outline-none resize-none" />
                </div>
              )}

              {/* 본문 에디터 */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50 flex-wrap gap-2">
                  <span className="text-sm font-semibold text-gray-700">본문</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {contentLoading && <span className="text-xs text-gray-400 animate-pulse">노션에서 불러오는 중...</span>}
                    <input value={targetKeyword} onChange={(e) => setTargetKeyword(e.target.value)} placeholder="대상 키워드 (선택)" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-32 focus:outline-none focus:border-green-400" />
                    <button onClick={handleRewrite} disabled={rewriting||!content.trim()} className="text-xs bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">
                      {rewriting ? '⏳...' : '🤖 SEO 리라이팅'}
                    </button>
                    <button onClick={handleAutoGenerate} disabled={autoGenerating||(!content.trim()&&!title.trim())} className="text-xs bg-violet-500 hover:bg-violet-400 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">
                      {autoGenerating ? '⏳...' : '🔄 자동화'}
                    </button>
                    <button onClick={() => setPreview((v) => !v)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${preview?'bg-gray-900 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {preview ? '편집' : '미리보기'}
                    </button>
                  </div>
                </div>
                {rewriteError && <div className="px-5 py-2 bg-red-50 text-xs text-red-600 border-b border-red-100">⚠️ {rewriteError}</div>}
                {autoGenerating && autoStep && <div className="px-5 py-2 bg-violet-50 text-xs text-violet-700 border-b border-violet-100 animate-pulse font-medium">{autoStep}</div>}
                {!autoGenerating && autoStep && <div className="px-5 py-2 bg-emerald-50 text-xs text-emerald-700 border-b border-emerald-100 font-medium">{autoStep}</div>}
                {preview ? (
                  <div className="p-5 prose prose-sm max-w-none min-h-[300px] text-gray-800" dangerouslySetInnerHTML={{ __html: content || '<p class="text-gray-400">내용을 입력하세요</p>' }} />
                ) : (
                  <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="HTML 본문 입력 (SEO 리라이팅 후 발행 권장)" className="w-full px-5 py-4 text-sm font-mono text-gray-800 focus:outline-none resize-none min-h-[300px]" rows={16} />
                )}
              </div>

              {/* 발행 컨트롤 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-sm text-gray-800">네이버 블로그 발행</h3>
                  <select value={publishStatus} onChange={(e) => setPublishStatus(e.target.value as 'publish' | 'draft')} className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none">
                    <option value="publish">즉시 발행</option>
                    <option value="draft">임시저장</option>
                  </select>
                </div>

                {!isConnected && (
                  <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                    <p className="text-xs text-amber-700">⚠️ 네이버 블로그가 연결되지 않았습니다. <button onClick={() => setTab('settings')} className="text-amber-800 font-bold underline">설정 탭</button>에서 먼저 연결하세요.</p>
                  </div>
                )}

                {publishError && (
                  <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-200">
                    <p className="text-xs text-red-700">⚠️ {publishError}</p>
                    {publishError.includes('쿠키') && (
                      <button onClick={() => setTab('settings')} className="mt-2 text-xs bg-red-500 text-white px-3 py-1 rounded-lg font-semibold">쿠키 갱신하기 →</button>
                    )}
                  </div>
                )}

                {publishResult && (
                  <div className="mb-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                    <p className="text-xs font-semibold text-emerald-800">✅ 발행 완료!</p>
                    {publishResult.postUrl && (
                      <a href={publishResult.postUrl} target="_blank" rel="noopener" className="text-xs text-emerald-600 hover:text-emerald-800 underline mt-1 block">
                        {publishResult.postUrl}
                      </a>
                    )}
                  </div>
                )}

                <button
                  onClick={handlePublish}
                  disabled={publishing || !isConnected || !title.trim() || !content.trim()}
                  className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {publishing ? (
                    <><span className="animate-spin">⏳</span> 발행 중...</>
                  ) : (
                    <>🟢 네이버 블로그 발행</>
                  )}
                </button>
                <p className="text-[10px] text-gray-400 mt-2 text-center">발행 전 SEO 리라이팅을 권장합니다 (네이버 검색 최적화)</p>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB: 설정 ══ */}
        {tab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">

            {/* 연결 상태 카드 */}
            {conn?.last_tested_at && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-sm font-bold text-emerald-800">{conn.blog_name || conn.blog_id} 연결됨</p>
                  <p className="text-xs text-emerald-600">마지막 확인: {new Date(conn.last_tested_at).toLocaleString('ko-KR')}</p>
                </div>
              </div>
            )}

            {/* 블로그 연결 폼 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-bold text-sm text-gray-900">🟢 네이버 블로그 연결</h2>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">블로그 ID <span className="text-red-400">*</span></label>
                <input
                  value={connForm.blog_id}
                  onChange={(e) => setConnForm((p) => ({ ...p, blog_id: e.target.value.toLowerCase().trim() }))}
                  placeholder="네이버 블로그 ID (예: myid123)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-400"
                />
                <p className="text-[10px] text-gray-400 mt-1">blog.naver.com/<strong>여기에 입력한 ID</strong> 형식의 블로그 주소</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">블로그 이름 <span className="text-gray-400">(선택)</span></label>
                <input
                  value={connForm.blog_name}
                  onChange={(e) => setConnForm((p) => ({ ...p, blog_name: e.target.value }))}
                  placeholder="표시할 블로그 이름"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-400"
                />
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-xs font-bold text-gray-700 mb-3">🍪 네이버 로그인 쿠키</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">NID_AUT <span className="text-red-400">*</span></label>
                    <input
                      type="password"
                      value={connForm.nid_aut}
                      onChange={(e) => setConnForm((p) => ({ ...p, nid_aut: e.target.value.trim() }))}
                      placeholder="NID_AUT 쿠키 값"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">NID_SES <span className="text-red-400">*</span></label>
                    <input
                      type="password"
                      value={connForm.nid_ses}
                      onChange={(e) => setConnForm((p) => ({ ...p, nid_ses: e.target.value.trim() }))}
                      placeholder="NID_SES 쿠키 값"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-green-400"
                    />
                  </div>
                </div>
                <CookieGuide />
              </div>

              {connMsg && (
                <div className={`p-3 rounded-xl text-xs font-medium ${connMsg.startsWith('✓') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {connMsg}
                </div>
              )}

              {testResult && (
                <div className={`p-3 rounded-xl text-xs ${(testResult as { ok?: boolean }).ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {(testResult as { ok?: boolean }).ok ? (
                    <div>
                      <p className="font-bold">✅ 연결 성공!</p>
                      <p>블로그: {(testResult as { blogName?: string }).blogName}</p>
                      <p>카테고리: {((testResult as { categories?: NaverCategory[] }).categories || []).length}개 로드됨</p>
                    </div>
                  ) : (
                    <p>❌ {(testResult as { error?: string }).error}</p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={handleTestConn} disabled={testing || !connForm.blog_id || !connForm.nid_aut || !connForm.nid_ses} className="flex-1 bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
                  {testing ? '⏳ 테스트 중...' : '🔌 연결 테스트'}
                </button>
                <button onClick={handleSaveConn} disabled={connSaving || !connForm.blog_id} className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
                  {connSaving ? '저장 중...' : '💾 저장'}
                </button>
              </div>
            </div>

            {/* 쿠키 만료 대응 안내 */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-bold text-blue-900">💡 쿠키 관리 팁</h3>
              <ul className="text-xs text-blue-800 space-y-1.5 list-disc pl-4">
                <li>쿠키는 <strong>14~30일</strong> 주기로 만료됩니다</li>
                <li>발행 실패 시 &apos;쿠키 만료&apos; 메시지가 나오면 새 쿠키를 복사해서 저장하세요</li>
                <li>네이버 앱에서 로그인 상태를 유지하면 PC 쿠키도 오래 유지됩니다</li>
                <li>2단계 인증을 사용하는 경우 쿠키 유효기간이 길어질 수 있습니다</li>
              </ul>
            </div>

            {/* 카테고리 목록 */}
            {categories.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="font-bold text-sm text-gray-800 mb-3">📁 카테고리 목록</h3>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <span key={c.no} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                      {c.name} <span className="text-gray-400">#{c.no}</span>
                    </span>
                  ))}
                </div>
                <button onClick={handleTestConn} disabled={testing} className="mt-3 text-xs text-blue-500 hover:text-blue-700 disabled:opacity-40">
                  {testing ? '업데이트 중...' : '↻ 카테고리 새로고침'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: 히스토리 ══ */}
        {tab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-gray-800">📋 발행 히스토리</h2>
              <button onClick={loadHistory} className="text-xs text-indigo-500 hover:text-indigo-700">↻ 새로고침</button>
            </div>
            {history.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <p className="text-gray-400 text-sm">발행 이력이 없습니다</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {history.map((h) => (
                    <div key={h.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{h.title}</p>
                          {h.post_url && (
                            <a href={h.post_url} target="_blank" rel="noopener" className="text-xs text-green-600 hover:text-green-800 truncate block mt-0.5">
                              {h.post_url}
                            </a>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1">{new Date(h.created_at).toLocaleString('ko-KR')}</p>
                        </div>
                        <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${h.status === 'publish' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          {h.status === 'publish' ? '발행' : '임시저장'}
                        </span>
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
