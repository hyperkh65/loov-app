'use client';

import { useState, useEffect, useCallback } from 'react';

const AI_MODELS = [
  { id: 'qwen3', name: 'Qwen 3', emoji: '🔮' },
  { id: 'qwen3.5', name: 'Qwen 3.5', emoji: '🔮' },
  { id: 'llama3.3', name: 'Llama 3.3', emoji: '🦙' },
  { id: 'mistral', name: 'Mistral', emoji: '🌪️' },
  { id: 'gemma3', name: 'Gemma 3', emoji: '💎' },
  { id: 'deepseek-r1', name: 'DeepSeek R1', emoji: '🧠' },
];

const BLOG_PLATFORMS = [
  { id: 'naver', name: '네이버 블로그', icon: '🟢' },
  { id: 'blogger', name: 'Google 블로거', icon: '📝' },
  { id: 'wordpress', name: 'WordPress', icon: '🔵' },
];

const SNS_PLATFORMS = [
  { id: 'twitter', name: 'X (트위터)', icon: '🐦' },
  { id: 'instagram', name: '인스타그램', icon: '📸' },
  { id: 'threads', name: '스레드', icon: '🧵' },
  { id: 'facebook', name: '페이스북', icon: '📘' },
];

type Tab = 'keywords' | 'drafts' | 'history';
type Status = 'draft' | 'approved' | 'published' | 'failed';

interface Article {
  id: string;
  keyword: string;
  title: string;
  meta_description: string;
  content: string;
  representative_image_url: string | null;
  ai_model: string;
  status: Status;
  blog_platforms: string[];
  sns_platforms: string[];
  published_urls: Record<string, string>;
  published_at: string | null;
  word_count: number;
  created_at: string;
  sources: { type: string; title: string; link: string }[];
}

interface TrendKeyword {
  keyword: string;
  score?: number;
  category?: string;
}

const STATUS_LABELS: Record<Status, { label: string; color: string }> = {
  draft: { label: '초안', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '승인됨', color: 'bg-blue-100 text-blue-800' },
  published: { label: '발행완료', color: 'bg-green-100 text-green-800' },
  failed: { label: '실패', color: 'bg-red-100 text-red-800' },
};

export default function AutoServicePage() {
  const [tab, setTab] = useState<Tab>('keywords');
  const [trendKeywords, setTrendKeywords] = useState<TrendKeyword[]>([]);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [customKeyword, setCustomKeyword] = useState('');
  const [selectedModel, setSelectedModel] = useState('qwen3');
  const [generating, setGenerating] = useState(false);
  const [generatingKw, setGeneratingKw] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [history, setHistory] = useState<Article[]>([]);
  // Preview/Edit modal
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editModel, setEditModel] = useState('qwen3');
  const [savingEdit, setSavingEdit] = useState(false);
  // Publish modal
  const [publishArticle, setPublishArticle] = useState<Article | null>(null);
  const [selBlog, setSelBlog] = useState<string[]>([]);
  const [selSns, setSelSns] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<Record<string, { success: boolean; url?: string; error?: string }> | null>(null);

  const loadArticles = useCallback(async (status?: string) => {
    setLoadingArticles(true);
    const params = status ? `?status=${status}` : '';
    const res = await fetch(`/api/auto-service/articles${params}`);
    const data = await res.json();
    if (status === 'published') {
      setHistory(data.items || []);
    } else {
      setArticles((data.items || []).filter((a: Article) => a.status !== 'published'));
    }
    setLoadingArticles(false);
  }, []);

  useEffect(() => {
    if (tab === 'drafts') loadArticles();
    if (tab === 'history') loadArticles('published');
  }, [tab, loadArticles]);

  const loadTrending = async () => {
    setLoadingTrend(true);
    try {
      const res = await fetch('/api/keyword/advanced?action=trending');
      const data = await res.json();
      const kws: TrendKeyword[] = [];
      if (data.keywords) {
        for (const k of data.keywords.slice(0, 30)) {
          kws.push({ keyword: typeof k === 'string' ? k : k.keyword || k.text, score: k.score });
        }
      }
      setTrendKeywords(kws);
    } catch {
      setTrendKeywords([]);
    }
    setLoadingTrend(false);
  };

  const generateArticle = async (keyword: string) => {
    if (!keyword.trim()) return;
    setGenerating(true);
    setGeneratingKw(keyword);
    try {
      const res = await fetch('/api/auto-service/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, ai_model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      setCustomKeyword('');
      setTab('drafts');
      await loadArticles();
    } catch (err) {
      alert(`글 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
    setGenerating(false);
    setGeneratingKw('');
  };

  const openPreview = (article: Article) => {
    setPreviewArticle(article);
    setEditMode(false);
    setEditContent(article.content);
    setEditTitle(article.title);
    setEditModel(article.ai_model || 'qwen3');
    setPublishResult(null);
  };

  const saveEdit = async () => {
    if (!previewArticle) return;
    setSavingEdit(true);
    const res = await fetch('/api/auto-service/articles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: previewArticle.id, content: editContent, title: editTitle, ai_model: editModel }),
    });
    if (res.ok) {
      setEditMode(false);
      setPreviewArticle(prev => prev ? { ...prev, content: editContent, title: editTitle, ai_model: editModel } : null);
      await loadArticles();
    }
    setSavingEdit(false);
  };

  const deleteArticle = async (id: string) => {
    if (!confirm('이 초안을 삭제하시겠습니까?')) return;
    await fetch(`/api/auto-service/articles?id=${id}`, { method: 'DELETE' });
    setPreviewArticle(null);
    await loadArticles();
  };

  const openPublish = (article: Article) => {
    setPublishArticle(article);
    setSelBlog(['naver']);
    setSelSns([]);
    setPublishResult(null);
  };

  const doPublish = async () => {
    if (!publishArticle) return;
    setPublishing(true);
    const res = await fetch('/api/auto-service/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: publishArticle.id, blog_platforms: selBlog, sns_platforms: selSns }),
    });
    const data = await res.json();
    setPublishResult(data.results || {});
    setPublishing(false);
    await loadArticles();
  };

  const togglePlatform = (arr: string[], setArr: (v: string[]) => void, id: string) => {
    setArr(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🤖 자동화서비스 — 블로그 자동화</h1>
        <p className="text-sm text-gray-500 mt-1">키워드 발굴 → AI 글 생성 → 승인 → 블로그+SNS 자동 발행</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {([['keywords', '🔍 키워드 발굴'], ['drafts', '📝 초안 관리'], ['history', '📚 발행 히스토리']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ===== 키워드 발굴 탭 ===== */}
      {tab === 'keywords' && (
        <div className="space-y-6">
          {/* AI 모델 선택 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-800 mb-3">AI 모델 선택</h2>
            <div className="flex flex-wrap gap-2">
              {AI_MODELS.map(m => (
                <button key={m.id} onClick={() => setSelectedModel(m.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedModel === m.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {m.emoji} {m.name}
                </button>
              ))}
            </div>
          </div>

          {/* 직접 입력 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-800 mb-3">직접 키워드 입력</h2>
            <div className="flex gap-2">
              <input value={customKeyword} onChange={e => setCustomKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generateArticle(customKeyword)}
                placeholder="예: BTS 광화문 공연 후기" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={() => generateArticle(customKeyword)} disabled={generating || !customKeyword.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {generating && generatingKw === customKeyword ? '⏳ 생성 중...' : '✨ AI 글 생성'}
              </button>
            </div>
            {generating && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                <div className="flex items-center gap-2">
                  <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                  <span>"{generatingKw}" 키워드로 3000자+ SEO 글 생성 중... (최대 2분 소요)</span>
                </div>
                <div className="mt-2 text-xs text-blue-500">뉴스/블로그 수집 → AI 작성 → 이미지 검색 → 저장</div>
              </div>
            )}
          </div>

          {/* 트렌딩 키워드 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800">실시간 트렌딩 키워드</h2>
              <button onClick={loadTrending} disabled={loadingTrend}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50">
                {loadingTrend ? '⏳ 로딩...' : '🔄 불러오기'}
              </button>
            </div>
            {trendKeywords.length === 0 && !loadingTrend && (
              <p className="text-sm text-gray-400 text-center py-6">버튼을 눌러 트렌딩 키워드를 불러오세요</p>
            )}
            <div className="flex flex-wrap gap-2">
              {trendKeywords.map((kw, i) => (
                <div key={i} className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                  <span className="px-2 py-1 text-xs text-gray-500 bg-gray-100">{i + 1}</span>
                  <span className="px-2 py-1 text-sm text-gray-800">{kw.keyword}</span>
                  <button onClick={() => generateArticle(kw.keyword)} disabled={generating}
                    className="px-2 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 transition-colors">
                    {generating && generatingKw === kw.keyword ? '⏳' : '✨ 생성'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== 초안 관리 탭 ===== */}
      {tab === 'drafts' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{articles.length}개의 초안</p>
            <button onClick={() => loadArticles()} disabled={loadingArticles}
              className="text-sm text-blue-600 hover:underline">
              {loadingArticles ? '로딩...' : '새로고침'}
            </button>
          </div>

          {loadingArticles && (
            <div className="text-center py-12 text-gray-400">로딩 중...</div>
          )}

          {!loadingArticles && articles.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📝</div>
              <p>초안이 없습니다. 키워드 발굴 탭에서 글을 생성해보세요.</p>
            </div>
          )}

          <div className="grid gap-4">
            {articles.map(article => (
              <div key={article.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-start gap-3">
                  {article.representative_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={article.representative_image_url} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABELS[article.status].color}`}>
                        {STATUS_LABELS[article.status].label}
                      </span>
                      <span className="text-xs text-gray-400">{article.word_count.toLocaleString()}자</span>
                      <span className="text-xs text-gray-400">• {AI_MODELS.find(m => m.id === article.ai_model)?.emoji} {article.ai_model}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 line-clamp-1">{article.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">{article.meta_description}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                      <span>🔑 {article.keyword}</span>
                      <span>• {new Date(article.created_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => openPreview(article)}
                      className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                      미리보기/편집
                    </button>
                    <button onClick={() => openPublish(article)}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                      승인 & 발행
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 발행 히스토리 탭 ===== */}
      {tab === 'history' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{history.length}개 발행됨</p>
            <button onClick={() => loadArticles('published')} className="text-sm text-blue-600 hover:underline">새로고침</button>
          </div>

          {history.length === 0 && !loadingArticles && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📚</div>
              <p>아직 발행된 글이 없습니다.</p>
            </div>
          )}

          <div className="grid gap-4">
            {history.map(article => (
              <div key={article.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  {article.representative_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={article.representative_image_url} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-800">발행완료</span>
                    <h3 className="font-semibold text-gray-900 mt-1">{article.title}</h3>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{article.meta_description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(article.published_urls || {}).map(([platform, url]) => (
                        url ? (
                          <a key={platform} href={url} target="_blank" rel="noopener noreferrer"
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:underline">
                            {platform} 보기 →
                          </a>
                        ) : null
                      ))}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {article.published_at && `발행: ${new Date(article.published_at).toLocaleString('ko-KR')}`}
                    </div>
                  </div>
                  <button onClick={() => openPreview(article)}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex-shrink-0">
                    내용 보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 미리보기/편집 모달 ===== */}
      {previewArticle && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) setPreviewArticle(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-4xl my-4 shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABELS[previewArticle.status].color}`}>
                  {STATUS_LABELS[previewArticle.status].label}
                </span>
                <span className="text-sm text-gray-500">{previewArticle.word_count.toLocaleString()}자</span>
                <span className="text-xs text-gray-400">🔑 {previewArticle.keyword}</span>
              </div>
              <div className="flex gap-2">
                {!editMode ? (
                  <button onClick={() => setEditMode(true)}
                    className="px-3 py-1.5 text-sm bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200">
                    ✏️ 편집
                  </button>
                ) : (
                  <>
                    <button onClick={() => setEditMode(false)} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">취소</button>
                    <button onClick={saveEdit} disabled={savingEdit}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {savingEdit ? '저장 중...' : '💾 저장'}
                    </button>
                  </>
                )}
                <button onClick={() => { openPublish(previewArticle); setPreviewArticle(null); }}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                  🚀 승인 & 발행
                </button>
                <button onClick={() => deleteArticle(previewArticle.id)}
                  className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                  🗑️ 삭제
                </button>
                <button onClick={() => setPreviewArticle(null)}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                  ✕ 닫기
                </button>
              </div>
            </div>

            {editMode ? (
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">제목 (SEO)</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">AI 모델 변경</label>
                  <div className="flex flex-wrap gap-2">
                    {AI_MODELS.map(m => (
                      <button key={m.id} onClick={() => setEditModel(m.id)}
                        className={`px-2 py-1 rounded text-xs font-medium ${editModel === m.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                        {m.emoji} {m.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">HTML 내용</label>
                  <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                    rows={20} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                </div>
              </div>
            ) : (
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">{previewArticle.title}</h2>
                {previewArticle.meta_description && (
                  <p className="text-sm text-gray-500 mb-4 pb-4 border-b border-gray-100">{previewArticle.meta_description}</p>
                )}
                {previewArticle.representative_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewArticle.representative_image_url} alt={previewArticle.keyword}
                    className="w-full max-h-64 object-cover rounded-xl mb-4" />
                )}
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewArticle.content }} />
                {previewArticle.sources?.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-2">참고 자료</p>
                    <div className="flex flex-wrap gap-2">
                      {previewArticle.sources.map((s, i) => (
                        <a key={i} href={s.link} target="_blank" rel="noopener noreferrer"
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:underline">
                          [{s.type}] {s.title.slice(0, 30)}...
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 발행 모달 ===== */}
      {publishArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={e => { if (e.target === e.currentTarget && !publishing) setPublishArticle(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">🚀 승인 & 발행</h2>
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{publishArticle.title}</p>
            </div>

            {!publishResult ? (
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">블로그 플랫폼</label>
                  <div className="grid grid-cols-1 gap-2">
                    {BLOG_PLATFORMS.map(p => (
                      <label key={p.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={selBlog.includes(p.id)} onChange={() => togglePlatform(selBlog, setSelBlog, p.id)} className="w-4 h-4" />
                        <span>{p.icon} {p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">SNS 연동 (선택)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SNS_PLATFORMS.map(p => (
                      <label key={p.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={selSns.includes(p.id)} onChange={() => togglePlatform(selSns, setSelSns, p.id)} className="w-4 h-4" />
                        <span className="text-sm">{p.icon} {p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button onClick={() => setPublishArticle(null)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">취소</button>
                  <button onClick={doPublish} disabled={publishing || (selBlog.length === 0 && selSns.length === 0)}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {publishing ? '발행 중...' : '🚀 발행하기'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <p className="font-medium text-gray-800">발행 결과</p>
                {Object.entries(publishResult).map(([platform, result]) => (
                  <div key={platform} className={`flex items-center justify-between p-3 rounded-lg ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
                    <span className="text-sm font-medium">{platform}</span>
                    {result.success ? (
                      <div className="flex items-center gap-2">
                        <span className="text-green-600 text-sm">✅ 성공</span>
                        {result.url && (
                          <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">보기</a>
                        )}
                      </div>
                    ) : (
                      <span className="text-red-600 text-xs">{result.error || '실패'}</span>
                    )}
                  </div>
                ))}
                <button onClick={() => setPublishArticle(null)} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 mt-2">닫기</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
