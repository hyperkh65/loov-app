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
  oauth_connected: boolean;
  token_expires_at: string | null;
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
  const [testResult, setTestResult] = useState<{ ok?: boolean; blogName?: string; categories?: NaverCategory[]; error?: string; note?: string } | null>(null);
  const [oauthMsg, setOauthMsg] = useState('');

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

  // 발행 모드
  const [jobType, setJobType] = useState<'draft' | 'rewrite' | 'scrape'>('draft');
  const [sourceUrl, setSourceUrl] = useState('');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'claude' | 'gpt4o' | 'gpt4' | 'gpt35'>('gemini');
  const [thumbnailPrompt, setThumbnailPrompt] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  // 이미지 관리
  const [representativeImage, setRepresentativeImage] = useState(''); // 대표이미지 URL
  const [bodyImages, setBodyImages] = useState<string[]>([]); // 본문 이미지 URL 목록
  const [imgSearchTarget, setImgSearchTarget] = useState<'representative' | 'body' | null>(null);
  const [imageUploading, setImageUploading] = useState<'representative' | 'body' | null>(null);
  const [imgQuery, setImgQuery] = useState('');
  const [imgResults, setImgResults] = useState<{ id: number; preview: string; webformat: string; large: string; tags: string; user: string }[]>([]);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState('');
  const [imgPage, setImgPage] = useState(1);
  const [imgTotal, setImgTotal] = useState(0);

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
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('');

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

  useEffect(() => {
    loadConn(); loadHistory(); loadNotionStatus();
    // OAuth 콜백 파라미터 처리
    const params = new URLSearchParams(window.location.search);
    const oauthParam = params.get('oauth');
    const errorParam = params.get('error');
    const tabParam = params.get('tab');
    if (tabParam === 'settings') setTab('settings');
    if (oauthParam === 'success') { setOauthMsg('✅ 네이버 OAuth 연결 완료!'); setTab('settings'); }
    else if (errorParam) { setOauthMsg(`❌ OAuth 연결 실패: ${errorParam}`); setTab('settings'); }
    if (oauthParam || errorParam || tabParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete('oauth'); url.searchParams.delete('error'); url.searchParams.delete('tab');
      window.history.replaceState(null, '', url.toString());
    }
  }, [loadConn, loadHistory, loadNotionStatus]); // eslint-disable-line

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

  // ── OAuth 연결 해제 ───────────────────────────────────────────────────────

  const handleOAuthDisconnect = async () => {
    const r = await fetch('/api/naver/oauth/disconnect', { method: 'POST' });
    if (r.ok) { setConn((prev) => prev ? { ...prev, oauth_connected: false, token_expires_at: null } : prev); setOauthMsg('OAuth 연결이 해제되었습니다.'); }
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

  // ── 이미지 관리 ──────────────────────────────────────────────────────────

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'representative' | 'body') => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImageUploading(target);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/naver/upload-image', { method: 'POST', body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error || '업로드 실패');
      if (target === 'representative') setRepresentativeImage(data.url!);
      else setBodyImages(prev => [...prev, data.url!]);
    } catch (err) {
      setPublishError('이미지 업로드 실패: ' + String(err));
    } finally {
      setImageUploading(null);
    }
  };

  // ── 이미지 검색 (Pixabay) ────────────────────────────────────────────────

  const handleImageSearch = async (page = 1) => {
    if (!imgQuery.trim()) return;
    setImgLoading(true); setImgError('');
    try {
      const res = await fetch(`/api/naver/image-search?q=${encodeURIComponent(imgQuery)}&page=${page}&per_page=20`);
      const data = await res.json() as { total?: number; images?: typeof imgResults; error?: string };
      if (!res.ok) throw new Error(data.error || '검색 실패');
      if (page === 1) setImgResults(data.images || []);
      else setImgResults(prev => [...prev, ...(data.images || [])]);
      setImgTotal(data.total || 0);
      setImgPage(page);
    } catch (e) {
      setImgError(String(e));
    } finally {
      setImgLoading(false);
    }
  };

  const handleSelectImage = (url: string) => {
    if (imgSearchTarget === 'representative') {
      setRepresentativeImage(url);
      setImgSearchTarget(null);
    } else if (imgSearchTarget === 'body') {
      setBodyImages(prev => [...prev, url]);
      // 패널 열어두기 (여러 장 선택 가능)
    }
  };

  // ── 발행 (로컬 에이전트 방식) ────────────────────────────────────────────

  const handlePublish = async () => {
    if (!title.trim()) { setPublishError('제목이 필요합니다'); return; }
    if (jobType === 'draft' && !content.trim()) { setPublishError('내용이 필요합니다'); return; }
    if (jobType === 'rewrite' && !content.trim()) { setPublishError('rewrite 모드는 초안 내용이 필요합니다'); return; }
    if (jobType === 'scrape' && !sourceUrl.trim()) { setPublishError('스크랩 URL이 필요합니다'); return; }
    if (!conn?.blog_id) { setPublishError('네이버 블로그 연결 설정이 필요합니다'); return; }
    if (!conn.nid_aut || !conn.nid_ses) { setPublishError('쿠키(NID_AUT, NID_SES)를 설정 탭에서 입력해주세요'); return; }

    setPublishing(true); setPublishResult(null); setPublishError(''); setJobId(null); setJobStatus('대기열 등록 중...');
    try {
      const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);

      // 본문 이미지를 단락 사이에 균등 배분
      let finalContent = content;
      if (bodyImages.length > 0) {
        const paras: string[] = [];
        const re = /(<p[^>]*>[\s\S]*?<\/p>)/gi;
        let m; while ((m = re.exec(content)) !== null) paras.push(m[1]);
        if (paras.length > 0) {
          const interval = paras.length / (bodyImages.length + 1);
          const result: string[] = [];
          paras.forEach((p, i) => {
            result.push(p);
            bodyImages.forEach((url, j) => {
              if (i + 1 === Math.round(interval * (j + 1)))
                result.push(`<img src="${url}" />`);
            });
          });
          finalContent = result.join('\n');
        } else {
          finalContent = content + bodyImages.map(url => `\n<img src="${url}" />`).join('');
        }
      }

      // 대표이미지 → thumbnail_prompt에 __url__: 접두어로 전달
      const finalThumbnailPrompt = representativeImage
        ? `__url__:${representativeImage}`
        : thumbnailPrompt.trim() || undefined;

      const res = await fetch('/api/naver/trigger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), content: finalContent, tags: parsedTags,
          categoryNo, status: publishStatus,
          notionPageId: selectedArticle?.id || '',
          jobType, sourceUrl: sourceUrl.trim() || undefined,
          aiPrompt: aiPrompt.trim() || undefined,
          aiProvider,
          thumbnailPrompt: finalThumbnailPrompt,
        }),
      });
      const data = await res.json() as { jobId?: string; error?: string; message?: string };
      if (!res.ok) {
        setPublishError(data.error || `오류 (${res.status})`);
        if ((data as { errorCode?: string }).errorCode === 'AUTH') setTab('settings');
        setJobStatus('');
        return;
      }

      const newJobId = data.jobId || null;
      setJobId(newJobId);
      setJobStatus('로컬 에이전트 대기 중...');
      setPublishing(false);

      // 작업 상태 폴링
      if (newJobId) {
        const poll = setInterval(async () => {
          const r = await fetch(`/api/naver/job/${newJobId}`);
          if (!r.ok) return;
          const j = await r.json() as { status: string; post_url?: string; post_id?: string; error_message?: string };
          if (j.status === 'processing') setJobStatus('발행 중...');
          else if (j.status === 'completed') {
            clearInterval(poll);
            setJobStatus('');
            setPublishResult({ postId: j.post_id, postUrl: j.post_url });
            loadHistory();
          } else if (j.status === 'failed') {
            clearInterval(poll);
            setJobStatus('');
            setPublishError(j.error_message || '발행 실패');
          }
        }, 3000);
        // 3분 후 폴링 자동 중단
        setTimeout(() => clearInterval(poll), 180000);
      }
    } catch (e) {
      setPublishError('네트워크 오류: ' + String(e));
      setJobStatus('');
      setPublishing(false);
    }
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

              {/* 발행 모드 선택 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-500 mb-3">발행 모드</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['draft',   '📝', '일반 발행',    '작성한 내용 그대로 발행'],
                    ['rewrite', '🤖', 'AI 리라이팅', '초안을 AI가 재작성 + 썸네일 자동생성'],
                    ['scrape',  '🌐', 'URL 스크랩',   'URL 스크랩 + AI 재작성 + 이미지 배분'],
                  ] as [typeof jobType, string, string, string][]).map(([mode, icon, label, desc]) => (
                    <button
                      key={mode}
                      onClick={() => setJobType(mode)}
                      className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${jobType === mode ? 'border-green-400 bg-green-50' : 'border-gray-100 hover:border-gray-300'}`}
                    >
                      <span className="text-lg mb-1">{icon}</span>
                      <span className={`text-xs font-bold ${jobType === mode ? 'text-green-700' : 'text-gray-700'}`}>{label}</span>
                      <span className="text-[10px] text-gray-400 mt-0.5 leading-tight">{desc}</span>
                    </button>
                  ))}
                </div>

                {/* 모드별 추가 필드 */}
                {jobType === 'scrape' && (
                  <div className="mt-3 space-y-2">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">스크랩 URL <span className="text-red-400">*</span></label>
                      <input
                        value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
                        placeholder="https://example.com/article"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-400"
                      />
                    </div>
                  </div>
                )}

                {(jobType === 'rewrite' || jobType === 'scrape') && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">AI 제공자</label>
                      <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value as typeof aiProvider)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-green-400">
                        <option value="gemini">Gemini (기본)</option>
                        <option value="claude">Claude</option>
                        <option value="gpt4o">GPT-4o</option>
                        <option value="gpt4">GPT-4</option>
                        <option value="gpt35">GPT-3.5</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">썸네일 프롬프트 <span className="text-gray-400">(선택)</span></label>
                      <input
                        value={thumbnailPrompt} onChange={(e) => setThumbnailPrompt(e.target.value)}
                        placeholder="제목 기반 자동 생성"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-green-400"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-600 block mb-1">AI 추가 지시사항 <span className="text-gray-400">(선택)</span></label>
                      <input
                        value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="예: 반려동물 관련 내용 강조, 친근한 말투 사용"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-green-400"
                      />
                    </div>
                  </div>
                )}
              </div>

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

              {/* 이미지 관리 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                <h3 className="text-sm font-bold text-gray-800">🖼️ 이미지 관리</h3>

                {/* 이미지 검색 패널 (공용) */}
                {imgSearchTarget && (
                  <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-700">
                        {imgSearchTarget === 'representative' ? '대표이미지 검색' : '본문 이미지 검색'}
                      </span>
                      <button onClick={() => { setImgSearchTarget(null); setImgResults([]); }} className="text-xs text-indigo-400 hover:text-indigo-600">✕ 닫기</button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={imgQuery}
                        onChange={(e) => setImgQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleImageSearch(1)}
                        placeholder="검색어 (예: 강아지, 고양이, 펫샵)"
                        className="flex-1 border border-indigo-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-400 bg-white"
                      />
                      <button onClick={() => handleImageSearch(1)} disabled={imgLoading || !imgQuery.trim()} className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
                        {imgLoading ? '⏳' : '검색'}
                      </button>
                    </div>
                    {imgError && <p className="text-[10px] text-red-500">{imgError}</p>}
                    {imgResults.length > 0 && (
                      <>
                        <p className="text-[10px] text-gray-400">총 {imgTotal.toLocaleString()}개 · Pixabay · 클릭하면 선택됩니다</p>
                        <div className="grid grid-cols-5 gap-1.5 max-h-52 overflow-y-auto">
                          {imgResults.map((img) => (
                            <button key={img.id} onClick={() => handleSelectImage(img.webformat)} className="group relative rounded overflow-hidden border-2 border-transparent hover:border-indigo-400 transition-all">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img.preview} alt={img.tags} className="w-full h-16 object-cover" />
                              <div className="absolute inset-0 bg-indigo-600/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          ))}
                        </div>
                        {imgResults.length < imgTotal && (
                          <button onClick={() => handleImageSearch(imgPage + 1)} disabled={imgLoading} className="w-full text-[10px] text-indigo-500 hover:text-indigo-700 disabled:opacity-40">
                            {imgLoading ? '로딩 중...' : '더 보기'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* 대표이미지 */}
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">대표이미지 <span className="text-gray-400 font-normal">(게시글 맨 앞)</span></p>
                    {representativeImage ? (
                      <div className="relative rounded-xl overflow-hidden border border-gray-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={representativeImage} alt="대표이미지" className="w-full h-28 object-cover" />
                        <button onClick={() => setRepresentativeImage('')} className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-5 h-5 text-[10px] flex items-center justify-center hover:bg-black/70">✕</button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-gray-200 rounded-xl h-28 flex flex-col items-center justify-center gap-2">
                        <button onClick={() => { setImgSearchTarget('representative'); setImgResults([]); }} className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-semibold">🔍 이미지 검색</button>
                        <label className={`text-xs text-gray-500 hover:text-gray-700 cursor-pointer ${imageUploading === 'representative' ? 'opacity-40' : ''}`}>
                          {imageUploading === 'representative' ? '⏳ 업로드 중...' : '📁 파일 업로드'}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'representative')} disabled={imageUploading !== null} />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* 본문 이미지 */}
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">본문 이미지 <span className="text-gray-400 font-normal">(단락 사이 자동 배분)</span></p>
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-2 min-h-28">
                      {bodyImages.length > 0 && (
                        <div className="grid grid-cols-3 gap-1 mb-2">
                          {bodyImages.map((url, i) => (
                            <div key={i} className="relative rounded overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`본문이미지${i+1}`} className="w-full h-12 object-cover" />
                              <button onClick={() => setBodyImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-black/50 text-white w-4 h-4 text-[9px] flex items-center justify-center hover:bg-black/70">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-1.5 justify-center">
                        <button onClick={() => { setImgSearchTarget('body'); setImgResults([]); }} className="text-[10px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded-lg font-semibold">🔍 검색</button>
                        <label className={`text-[10px] text-gray-500 hover:text-gray-700 cursor-pointer px-2 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 ${imageUploading === 'body' ? 'opacity-40' : ''}`}>
                          {imageUploading === 'body' ? '⏳' : '📁 업로드'}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'body')} disabled={imageUploading !== null} />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {(jobType === 'rewrite' || jobType === 'scrape') && !representativeImage && (
                  <p className="text-[10px] text-gray-400">💡 대표이미지를 선택하지 않으면 AI가 자동 생성합니다</p>
                )}
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
                  <span className="text-sm font-semibold text-gray-700">
                    본문
                    {jobType === 'scrape' && <span className="ml-2 text-[10px] text-gray-400 font-normal">(scrape 모드: 에이전트가 자동 채움)</span>}
                    {jobType === 'rewrite' && <span className="ml-2 text-[10px] text-gray-400 font-normal">(AI가 리라이팅할 초안)</span>}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {contentLoading && <span className="text-xs text-gray-400 animate-pulse">노션에서 불러오는 중...</span>}
                    {jobType === 'draft' && (
                      <>
                        <input value={targetKeyword} onChange={(e) => setTargetKeyword(e.target.value)} placeholder="대상 키워드 (선택)" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-32 focus:outline-none focus:border-green-400" />
                        <button onClick={handleRewrite} disabled={rewriting||!content.trim()} className="text-xs bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">
                          {rewriting ? '⏳...' : '🤖 SEO 리라이팅'}
                        </button>
                      </>
                    )}
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
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={
                      jobType === 'scrape'
                        ? '(선택) 스크랩 후 참고할 추가 내용 입력 — 에이전트가 URL을 자동 스크랩합니다'
                        : jobType === 'rewrite'
                        ? 'AI가 리라이팅할 초안 HTML을 입력하세요'
                        : 'HTML 본문 입력 (SEO 리라이팅 후 발행 권장)'
                    }
                    className="w-full px-5 py-4 text-sm font-mono text-gray-800 focus:outline-none resize-none min-h-[300px]"
                    rows={16}
                  />
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

                {jobStatus && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-xs font-semibold text-blue-800 animate-pulse">⏳ {jobStatus}</p>
                    <p className="text-[10px] text-blue-600 mt-1">로컬 에이전트가 처리 중입니다. Mac에서 <code className="bg-blue-100 px-1 rounded">npm run naver:publish</code> 실행 확인</p>
                  </div>
                )}

                <button
                  onClick={handlePublish}
                  disabled={
                    publishing || !!jobStatus || !isConnected || !title.trim() ||
                    (jobType === 'draft' && !content.trim()) ||
                    (jobType === 'rewrite' && !content.trim()) ||
                    (jobType === 'scrape' && !sourceUrl.trim())
                  }
                  className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {publishing ? (
                    <><span className="animate-spin">⏳</span> 등록 중...</>
                  ) : jobStatus ? (
                    <><span className="animate-spin">⏳</span> {jobStatus}</>
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
                    <div className="space-y-1">
                      <p className="font-bold">✅ 저장 완료!</p>
                      <p>블로그: blog.naver.com/{(testResult as { blogName?: string }).blogName}</p>
                      <p>카테고리: {((testResult as { categories?: NaverCategory[] }).categories || []).length}개 로드됨</p>
                      {(testResult as { note?: string }).note && (
                        <p className="text-amber-600 bg-amber-50 p-2 rounded-lg mt-1">{(testResult as { note?: string }).note}</p>
                      )}
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
