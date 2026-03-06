'use client';

import { useState, useEffect, useCallback } from 'react';

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

interface WpSite {
  id: string;
  site_name: string;
  site_url: string;
  wp_username: string;
  is_active: boolean;
}

interface NotionArticle {
  id: string;
  title: string;
  status: string;
  lastEdited: string;
}

interface PublishResult {
  siteId: string;
  siteName: string;
  success: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
}

interface HistoryItem {
  id: string;
  title: string;
  sites: string[];
  results: PublishResult[];
  notion_page_id: string;
  created_at: string;
}

// ── 탭 ────────────────────────────────────────────────────────────────────────

type Tab = 'publish' | 'sites' | 'notion' | 'history';

// ── 상태 배지 ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  '완료': 'bg-emerald-100 text-emerald-700',
  '발행완료': 'bg-emerald-100 text-emerald-700',
  'Done': 'bg-emerald-100 text-emerald-700',
  '작성중': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  '대기': 'bg-amber-100 text-amber-700',
  'Not Started': 'bg-gray-100 text-gray-600',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || 'bg-gray-100 text-gray-600';
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color}`}>{status || '—'}</span>;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function WordPressPage() {
  const [tab, setTab] = useState<Tab>('publish');

  // ── WP 사이트 ──────────────────────────────────────────
  const [sites, setSites] = useState<WpSite[]>([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [addingSite, setAddingSite] = useState(false);
  const [siteForm, setSiteForm] = useState({ site_name: '', site_url: '', wp_username: '', app_password: '' });
  const [siteMsg, setSiteMsg] = useState('');

  // ── 노션 ───────────────────────────────────────────────
  const [notionForm, setNotionForm] = useState({ integration_token: '', database_id: '', status_property: 'Status', openai_api_key: '', rewrite_prompt: '' });
  const [notionConnected, setNotionConnected] = useState(false);
  const [notionMsg, setNotionMsg] = useState('');
  const [articles, setArticles] = useState<NotionArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NotionArticle | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // ── 편집기 ─────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categories, setCategories] = useState('');
  const [tags, setTags] = useState('');
  const [publishStatus, setPublishStatus] = useState<'publish' | 'draft'>('publish');
  const [preview, setPreview] = useState(false);

  // ── SEO 리라이팅 ───────────────────────────────────────
  const [targetKeyword, setTargetKeyword] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState('');

  const handleRewrite = async () => {
    if (!content.trim()) return;
    setRewriting(true);
    setRewriteError('');
    try {
      const res = await fetch('/api/wordpress/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, targetKeyword: targetKeyword.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setRewriteError((err as { error?: string }).error || `오류 (${res.status})`);
        return;
      }
      const data = await res.json() as { content: string };
      setContent(data.content);
    } catch (e) {
      setRewriteError('네트워크 오류: ' + String(e));
    } finally {
      setRewriting(false);
    }
  };

  // ── 이미지 ─────────────────────────────────────────────
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImageFiles((prev) => [...prev, ...files]);
    setImagePreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
  };

  const removeImage = (idx: number) => {
    URL.revokeObjectURL(imagePreviews[idx]);
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= imageFiles.length) return;
    const newFiles = [...imageFiles];
    const newPreviews = [...imagePreviews];
    [newFiles[from], newFiles[to]] = [newFiles[to], newFiles[from]];
    [newPreviews[from], newPreviews[to]] = [newPreviews[to], newPreviews[from]];
    setImageFiles(newFiles);
    setImagePreviews(newPreviews);
  };

  // ── 발행 ───────────────────────────────────────────────
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(null);
  const [publishError, setPublishError] = useState('');

  // ── 히스토리 ───────────────────────────────────────────
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // ── 초기 로드 ──────────────────────────────────────────
  const loadSites = useCallback(async () => {
    const res = await fetch('/api/wordpress/sites');
    if (res.ok) setSites(await res.json());
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/wordpress/history');
    if (res.ok) setHistory(await res.json());
  }, []);

  const loadNotionSettings = useCallback(async () => {
    const res = await fetch('/api/wordpress/notion?action=settings');
    if (res.ok) {
      const data = await res.json();
      if (data) {
        setNotionForm({
          integration_token: data.integration_token || '',
          database_id: data.database_id || '',
          status_property: data.status_property || 'Status',
          openai_api_key: data.openai_api_key || '',
          rewrite_prompt: data.rewrite_prompt || '',
        });
        setNotionConnected(true);
      }
    }
  }, []);

  useEffect(() => {
    loadSites();
    loadHistory();
    loadNotionSettings();
  }, [loadSites, loadHistory, loadNotionSettings]);

  // ── 노션 아티클 로드 ───────────────────────────────────
  const loadArticles = async () => {
    setArticlesLoading(true);
    const res = await fetch('/api/wordpress/notion?action=articles');
    if (res.ok) setArticles(await res.json());
    else {
      const err = await res.json();
      setNotionMsg(err.error || '아티클 로드 실패');
    }
    setArticlesLoading(false);
  };

  useEffect(() => {
    if (notionConnected) loadArticles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notionConnected]);

  // ── 아티클 선택 → 내용 로드 ───────────────────────────
  const selectArticle = async (article: NotionArticle) => {
    setSelectedArticle(article);
    setTitle(article.title);
    setContentLoading(true);
    setPublishResults(null);
    setPublishError('');

    const res = await fetch(`/api/wordpress/notion?action=content&id=${article.id}`);
    if (res.ok) {
      const data = await res.json();
      setTitle(data.title || article.title);
      setContent(data.html || '');
    }
    setContentLoading(false);
  };

  // ── 사이트 추가 ────────────────────────────────────────
  const handleAddSite = async () => {
    setAddingSite(true);
    setSiteMsg('');
    const res = await fetch('/api/wordpress/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(siteForm),
    });
    const data = await res.json();
    if (res.ok) {
      setSites((prev) => [...prev, data]);
      setSiteForm({ site_name: '', site_url: '', wp_username: '', app_password: '' });
      setSiteMsg('✓ 사이트 추가 완료');
    } else {
      setSiteMsg(`⚠️ ${data.error}`);
    }
    setAddingSite(false);
  };

  const handleDeleteSite = async (id: string) => {
    await fetch('/api/wordpress/sites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setSites((prev) => prev.filter((s) => s.id !== id));
  };

  // ── 노션 연결 ──────────────────────────────────────────
  const handleNotionConnect = async () => {
    setNotionMsg('');
    const res = await fetch('/api/wordpress/notion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'connect', integration_token: notionForm.integration_token, database_id: notionForm.database_id, status_property: notionForm.status_property, openai_api_key: notionForm.openai_api_key, rewrite_prompt: notionForm.rewrite_prompt }),
    });
    const data = await res.json();
    if (res.ok) {
      setNotionConnected(true);
      setNotionMsg('✓ 노션 연결 성공');
      loadArticles();
    } else {
      setNotionMsg(`⚠️ ${data.error}`);
    }
  };

  // ── 발행 ───────────────────────────────────────────────
  const handlePublish = async () => {
    if (!title.trim() || !content.trim() || !selectedSiteIds.length) return;
    setPublishing(true);
    setPublishResults(null);
    setPublishError('');

    try {
      const formData = new FormData();
      formData.append('meta', JSON.stringify({
        title: title.trim(),
        content,
        status: publishStatus,
        categories: categories.split(',').map((c) => c.trim()).filter(Boolean),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        siteIds: selectedSiteIds,
        notionPageId: selectedArticle?.id || '',
      }));
      imageFiles.forEach((file) => formData.append('images', file));

      const res = await fetch('/api/wordpress/publish', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPublishError((err as { error?: string }).error || `서버 오류 (${res.status})`);
        return;
      }
      const data = await res.json() as { results: PublishResult[] };
      setPublishResults(data.results);
      loadHistory();
    } catch (e) {
      setPublishError('네트워크 오류: ' + String(e));
    } finally {
      setPublishing(false);
    }
  };

  const toggleSite = (id: string) =>
    setSelectedSiteIds((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);

  // ── 렌더 ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-gray-50">
      {/* ── 헤더 ── */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-lg font-black text-gray-900">📝 WordPress 자동 발행</h1>
            <p className="text-xs text-gray-400 mt-0.5">노션 DB → 멀티 사이트 동시 발행</p>
          </div>
          <nav className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {([
              { key: 'publish', icon: '✍️', label: '발행' },
              { key: 'sites', icon: '🌐', label: '사이트' },
              { key: 'notion', icon: '📔', label: '노션' },
              { key: 'history', icon: '📋', label: '히스토리' },
            ] as { key: Tab; icon: string; label: string }[]).map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">

        {/* ════════════════════════════════════════════════
            TAB: 발행
        ════════════════════════════════════════════════ */}
        {tab === 'publish' && (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">

            {/* ── 좌측: 노션 아티클 목록 ── */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <h2 className="font-bold text-sm text-gray-800">📔 노션 아티클</h2>
                  <button onClick={loadArticles} disabled={articlesLoading || !notionConnected}
                    className="text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-40">
                    {articlesLoading ? '로딩...' : '↻ 새로고침'}
                  </button>
                </div>

                {!notionConnected ? (
                  <div className="p-4 text-center">
                    <p className="text-xs text-gray-400 mb-2">노션 연동이 필요합니다</p>
                    <button onClick={() => setTab('notion')}
                      className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-medium">
                      노션 설정하기 →
                    </button>
                  </div>
                ) : articlesLoading ? (
                  <div className="p-6 text-center text-xs text-gray-400">불러오는 중...</div>
                ) : articles.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">아티클이 없습니다</div>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-50">
                    {articles.map((article) => (
                      <button key={article.id} onClick={() => selectArticle(article)}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                          selectedArticle?.id === article.id ? 'bg-indigo-50 border-l-2 border-indigo-400' : ''
                        }`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium text-gray-800 line-clamp-2 flex-1">{article.title}</p>
                          <StatusBadge status={article.status} />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(article.lastEdited).toLocaleDateString('ko-KR')}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 직접 입력 섹션 */}
              {!selectedArticle && (
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-400 text-center">
                    노션에서 아티클을 선택하거나<br />오른쪽에서 직접 내용을 입력하세요
                  </p>
                </div>
              )}
            </div>

            {/* ── 우측: 에디터 ── */}
            <div className="space-y-4">
              {/* 제목 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="제목을 입력하세요"
                  className="w-full text-xl font-bold text-gray-900 placeholder-gray-300 focus:outline-none"
                />
              </div>

              {/* 메타 정보 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">카테고리</label>
                    <input value={categories} onChange={(e) => setCategories(e.target.value)}
                      placeholder="여행, 음식 (쉼표 구분)"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">태그</label>
                    <input value={tags} onChange={(e) => setTags(e.target.value)}
                      placeholder="맛집, 추천 (쉼표 구분)"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">
                      이미지 선택
                      <span className="font-normal text-gray-400 ml-1">① 대표이미지, ②③… 소제목 순서대로 자동 배치</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 hover:border-indigo-300 transition-colors">
                      <span className="text-sm">🖼️</span>
                      <span className="text-sm text-gray-400">이미지 파일 선택 (여러 개 가능)</span>
                      <input type="file" multiple accept="image/*" onChange={handleImagesChange} className="hidden" />
                    </label>
                    {imagePreviews.length > 0 && (
                      <div className="flex gap-2 mt-2.5 flex-wrap">
                        {imagePreviews.map((url, i) => (
                          <div key={i} className="relative group">
                            <img src={url} alt="" className="w-16 h-16 object-cover rounded-xl border border-gray-200" />
                            <span className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shadow ${
                              i === 0 ? 'bg-orange-500 text-white' : 'bg-gray-700 text-white'
                            }`}>
                              {i === 0 ? '★' : i}
                            </span>
                            <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                              {i > 0 && (
                                <button type="button" onClick={() => moveImage(i, i - 1)} className="text-white text-xs bg-black/50 rounded px-1">←</button>
                              )}
                              <button type="button" onClick={() => removeImage(i)} className="text-white text-xs bg-red-500 rounded px-1">✕</button>
                              {i < imagePreviews.length - 1 && (
                                <button type="button" onClick={() => moveImage(i, i + 1)} className="text-white text-xs bg-black/50 rounded px-1">→</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {imagePreviews.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">★ 대표이미지 | 숫자 = h2 소제목 순서 배치 | 호버 → 이동/삭제</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 본문 에디터 */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50 flex-wrap gap-2">
                  <span className="text-sm font-semibold text-gray-700">본문</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {contentLoading && <span className="text-xs text-gray-400 animate-pulse">노션에서 불러오는 중...</span>}
                    {/* 대상 키워드 입력 */}
                    <input
                      value={targetKeyword}
                      onChange={(e) => setTargetKeyword(e.target.value)}
                      placeholder="대상 키워드 (선택)"
                      className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-32 focus:outline-none focus:border-emerald-400"
                    />
                    <button onClick={handleRewrite}
                      disabled={rewriting || !content.trim()}
                      className="text-xs bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">
                      {rewriting ? '⏳ 리라이팅 중...' : '🤖 SEO 리라이팅'}
                    </button>
                    <button onClick={() => setPreview((v) => !v)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        preview ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {preview ? '편집' : '미리보기'}
                    </button>
                  </div>
                </div>
                {rewriteError && (
                  <div className="px-5 py-2 bg-red-50 text-xs text-red-600 border-b border-red-100">⚠️ {rewriteError}</div>
                )}
                {preview ? (
                  <div
                    className="p-5 prose prose-sm max-w-none min-h-[300px] text-gray-800"
                    dangerouslySetInnerHTML={{ __html: content || '<p class="text-gray-400">내용을 입력하세요</p>' }}
                  />
                ) : (
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="HTML 본문을 입력하거나 노션에서 불러오세요"
                    className="w-full px-5 py-4 text-sm font-mono text-gray-800 focus:outline-none resize-none min-h-[300px]"
                    rows={16}
                  />
                )}
              </div>

              {/* 사이트 선택 + 발행 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm text-gray-800">발행 사이트 선택</h3>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 font-medium">상태</label>
                    <select value={publishStatus} onChange={(e) => setPublishStatus(e.target.value as 'publish' | 'draft')}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none">
                      <option value="publish">즉시 발행</option>
                      <option value="draft">임시저장</option>
                    </select>
                  </div>
                </div>

                {sites.length === 0 ? (
                  <p className="text-xs text-gray-400 mb-3">
                    사이트를 먼저 등록하세요 →{' '}
                    <button onClick={() => setTab('sites')} className="text-indigo-500 underline">사이트 관리</button>
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {sites.map((site) => (
                      <button key={site.id} onClick={() => toggleSite(site.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                          selectedSiteIds.includes(site.id)
                            ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                            : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                        }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        {site.site_name}
                      </button>
                    ))}
                  </div>
                )}

                {publishError && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3 text-xs text-red-600">
                    ⚠️ {publishError}
                  </div>
                )}

                <button onClick={handlePublish}
                  disabled={publishing || !title.trim() || !content.trim() || !selectedSiteIds.length}
                  className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white py-3 rounded-xl font-bold text-sm transition-colors">
                  {publishing ? '🚀 발행 중...' : `🚀 ${selectedSiteIds.length}개 사이트에 발행`}
                </button>

                {!selectedSiteIds.length && sites.length > 0 && (
                  <p className="text-xs text-amber-500 text-center mt-2">발행할 사이트를 선택하세요</p>
                )}
              </div>

              {/* 발행 결과 */}
              {publishResults && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="font-bold text-sm text-gray-800 mb-3">발행 결과</h3>
                  <div className="space-y-2">
                    {publishResults.map((r) => (
                      <div key={r.siteId} className={`flex items-center gap-3 p-3 rounded-xl ${r.success ? 'bg-emerald-50' : 'bg-red-50'}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.success ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{r.siteName}</p>
                          {r.success && r.postUrl && (
                            <a href={r.postUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-indigo-500 underline truncate block">{r.postUrl}</a>
                          )}
                          {!r.success && <p className="text-xs text-red-500">{r.error}</p>}
                        </div>
                        <span className={`text-xs font-bold ${r.success ? 'text-emerald-600' : 'text-red-500'}`}>
                          {r.success ? '✓ 완료' : '✗ 실패'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            TAB: 사이트 관리
        ════════════════════════════════════════════════ */}
        {tab === 'sites' && (
          <div className="max-w-2xl space-y-5">
            {/* 등록된 사이트 */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="font-bold text-gray-800">등록된 WordPress 사이트</h2>
              </div>
              {sites.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">등록된 사이트가 없습니다</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {sites.map((site) => (
                    <div key={site.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center text-sm flex-shrink-0">🌐</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800">{site.site_name}</p>
                        <p className="text-xs text-gray-400 truncate">{site.site_url}</p>
                        <p className="text-xs text-gray-400">@{site.wp_username}</p>
                      </div>
                      <button onClick={() => handleDeleteSite(site.id)}
                        className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 사이트 추가 폼 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="font-bold text-gray-800 mb-4">사이트 추가</h2>
              <div className="space-y-3">
                <input value={siteForm.site_name}
                  onChange={(e) => setSiteForm((f) => ({ ...f, site_name: e.target.value }))}
                  placeholder="사이트 이름 (예: 메인 블로그)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                <input value={siteForm.site_url}
                  onChange={(e) => setSiteForm((f) => ({ ...f, site_url: e.target.value }))}
                  placeholder="사이트 URL (예: https://2days.kr)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-mono text-xs" />
                <input value={siteForm.wp_username}
                  onChange={(e) => setSiteForm((f) => ({ ...f, wp_username: e.target.value }))}
                  placeholder="WordPress 사용자명"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                <input value={siteForm.app_password} type="password"
                  onChange={(e) => setSiteForm((f) => ({ ...f, app_password: e.target.value }))}
                  placeholder="Application Password (WP 관리자 → 사용자 → 앱비밀번호 생성)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />

                <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
                  💡 <strong>앱비밀번호 생성:</strong> WordPress 관리자 → 사용자 → 프로필 → 하단 &quot;애플리케이션 비밀번호&quot; 섹션
                </div>

                {siteMsg && (
                  <p className={`text-xs ${siteMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{siteMsg}</p>
                )}

                <button onClick={handleAddSite}
                  disabled={addingSite || !siteForm.site_name || !siteForm.site_url || !siteForm.wp_username || !siteForm.app_password}
                  className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
                  {addingSite ? '연결 테스트 중...' : '+ 사이트 추가'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            TAB: 노션 설정
        ════════════════════════════════════════════════ */}
        {tab === 'notion' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-xl">📔</div>
                <div>
                  <h2 className="font-bold text-gray-800">Notion 연동</h2>
                  <p className="text-xs text-gray-400">Integration Token + Database ID 설정</p>
                </div>
                {notionConnected && <span className="ml-auto text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-full">✓ 연결됨</span>}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Integration Token</label>
                  <input value={notionForm.integration_token}
                    onChange={(e) => setNotionForm((f) => ({ ...f, integration_token: e.target.value }))}
                    placeholder="secret_xxxxxxxx..."
                    type="password"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-mono text-xs" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Database ID</label>
                  <input value={notionForm.database_id}
                    onChange={(e) => setNotionForm((f) => ({ ...f, database_id: e.target.value }))}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-mono text-xs" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">상태 필드명 (Notion DB에서)</label>
                  <input value={notionForm.status_property}
                    onChange={(e) => setNotionForm((f) => ({ ...f, status_property: e.target.value }))}
                    placeholder="Status 또는 상태"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>

                <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700 space-y-1">
                  <p><strong>Integration Token 발급:</strong></p>
                  <p>1. notion.so/my-integrations → New integration 생성</p>
                  <p>2. Internal Integration Secret 복사</p>
                  <p>3. Notion DB 페이지 → ··· → Connections → Integration 추가</p>
                  <p><strong>Database ID:</strong> DB URL에서 추출 (마지막 32자리)</p>
                </div>

                {/* SEO 리라이팅 설정 */}
                <div className="border-t border-gray-100 pt-4 mt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-bold text-gray-800">🤖 SEO 리라이팅 설정</span>
                    <span className="text-xs text-gray-400">(노션 글 → GPT-4o 자동 리라이팅)</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1.5">OpenAI API 키</label>
                      <input value={notionForm.openai_api_key}
                        onChange={(e) => setNotionForm((f) => ({ ...f, openai_api_key: e.target.value.trim() }))}
                        placeholder="sk-..."
                        type="password"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-400 font-mono text-xs" />
                      <p className="text-[10px] text-gray-400 mt-1">platform.openai.com → API Keys에서 발급</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                        커스텀 시스템 프롬프트
                        <span className="font-normal text-gray-400 ml-1">(비워두면 기본 SEO 프롬프트 사용)</span>
                      </label>
                      <textarea value={notionForm.rewrite_prompt}
                        onChange={(e) => setNotionForm((f) => ({ ...f, rewrite_prompt: e.target.value }))}
                        placeholder="ChatGPT Custom GPTs의 시스템 프롬프트를 여기에 붙여넣으세요.&#10;비워두면 기본 SEO 최적화 프롬프트가 사용됩니다."
                        rows={5}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-emerald-400 resize-y font-mono" />
                      <p className="text-[10px] text-gray-400 mt-1">
                        💡 ChatGPT → 내 GPT → 편집 → 지침(Instructions)에서 복사
                      </p>
                    </div>
                  </div>
                </div>

                {notionMsg && (
                  <p className={`text-xs ${notionMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{notionMsg}</p>
                )}

                <button onClick={handleNotionConnect}
                  disabled={!notionForm.integration_token || !notionForm.database_id}
                  className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
                  연결 테스트 + 저장
                </button>
              </div>
            </div>

            {notionConnected && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800 text-sm">DB 아티클 미리보기</h3>
                  <button onClick={loadArticles} className="text-xs text-indigo-500 hover:text-indigo-700">↻ 새로고침</button>
                </div>
                {articlesLoading ? (
                  <p className="text-xs text-gray-400 text-center py-4">불러오는 중...</p>
                ) : (
                  <div className="space-y-2">
                    {articles.slice(0, 5).map((a) => (
                      <div key={a.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl">
                        <p className="text-xs text-gray-700 flex-1 truncate">{a.title}</p>
                        <StatusBadge status={a.status} />
                      </div>
                    ))}
                    {articles.length > 5 && (
                      <p className="text-xs text-gray-400 text-center">+{articles.length - 5}개 더...</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════
            TAB: 히스토리
        ════════════════════════════════════════════════ */}
        {tab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800">발행 히스토리</h2>
              <button onClick={loadHistory} className="text-xs text-gray-500 hover:text-gray-700">↻ 새로고침</button>
            </div>

            {history.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
                발행 기록이 없습니다
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {history.map((item) => {
                    const successCount = item.results?.filter((r) => r.success).length || 0;
                    const total = item.results?.length || item.sites?.length || 0;
                    return (
                      <div key={item.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {item.sites?.map((s) => (
                                <span key={s} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
                              ))}
                              <span className="text-[10px] text-gray-400">
                                {new Date(item.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${
                            successCount === total ? 'bg-emerald-100 text-emerald-700'
                            : successCount > 0 ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                          }`}>
                            {successCount}/{total} 완료
                          </span>
                        </div>
                        {/* 사이트별 결과 */}
                        {item.results?.length > 0 && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {item.results.map((r) => (
                              <div key={r.siteId} className="flex items-center gap-1">
                                {r.success && r.postUrl ? (
                                  <a href={r.postUrl} target="_blank" rel="noopener noreferrer"
                                    className="text-[10px] text-indigo-500 underline hover:text-indigo-700">
                                    {r.siteName} ↗
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-red-400">{r.siteName} ✗</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
