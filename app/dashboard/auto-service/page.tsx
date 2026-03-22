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

type Tab = 'auto' | 'drafts' | 'history';
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

interface AutoSettings {
  enabled: boolean;
  ai_model: string;
  max_per_run: number;
  custom_keywords: string[];
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_count: number;
}

const STATUS_LABELS: Record<Status, { label: string; color: string }> = {
  draft: { label: '초안', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '승인됨', color: 'bg-blue-100 text-blue-800' },
  published: { label: '발행완료', color: 'bg-green-100 text-green-800' },
  failed: { label: '실패', color: 'bg-red-100 text-red-800' },
};

export default function AutoServicePage() {
  const [tab, setTab] = useState<Tab>('auto');

  // 자동실행 설정
  const [autoSettings, setAutoSettings] = useState<AutoSettings>({
    enabled: false, ai_model: 'qwen3', max_per_run: 3,
    custom_keywords: [], last_run_at: null, last_run_status: null, last_run_count: 0,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [customKwInput, setCustomKwInput] = useState('');
  const [runningNow, setRunningNow] = useState(false);
  const [runResult, setRunResult] = useState<{ generated: number; keywords: string[] } | null>(null);

  // 수동 생성
  const [manualKeyword, setManualKeyword] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingKw, setGeneratingKw] = useState('');

  // 초안/히스토리
  const [articles, setArticles] = useState<Article[]>([]);
  const [history, setHistory] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);

  // 미리보기/편집 모달
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [modalTab, setModalTab] = useState<'preview' | 'edit' | 'images'>('preview');
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editModel, setEditModel] = useState('qwen3');
  const [savingEdit, setSavingEdit] = useState(false);
  // 이미지 편집
  const [imgSearchTab, setImgSearchTab] = useState<'google' | 'pixabay' | 'sns' | 'upload'>('google');
  const [imgQuery, setImgQuery] = useState('');
  const [imgResults, setImgResults] = useState<{ url: string; thumb: string; author: string; caption?: string }[]>([]);
  const [imgLoading, setImgLoading] = useState(false);
  const [replacingImgSrc, setReplacingImgSrc] = useState<string | null>(null);
  // 대표이미지 편집기
  const [thumbTitle, setThumbTitle] = useState('');
  const [thumbKeyword, setThumbKeyword] = useState('');
  const [thumbColor, setThumbColor] = useState<'blue' | 'dark' | 'green'>('blue');
  const [thumbGenerating, setThumbGenerating] = useState(false);
  const [thumbRepUrl, setThumbRepUrl] = useState<string | null>(null);

  // 발행 모달
  const [publishArticle, setPublishArticle] = useState<Article | null>(null);
  const [selBlog, setSelBlog] = useState<string[]>([]);
  const [selSns, setSelSns] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<Record<string, { success: boolean; url?: string; error?: string }> | null>(null);
  // WordPress 사이트 목록
  const [wpSites, setWpSites] = useState<{ id: string; site_name: string; site_url: string }[]>([]);
  const [selWpSiteIds, setSelWpSiteIds] = useState<string[]>([]);

  // localStorage에서 무료AI 페이지의 키 읽기 (서버로 전달용)
  const getAiKeys = () => ({
    clientOllamaKey: localStorage.getItem('freeai_ollama_key') || undefined,
    clientOpenrouterKey: localStorage.getItem('freeai_openrouter_key') || undefined,
  });

  // 설정 로드
  useEffect(() => {
    fetch('/api/auto-service/settings')
      .then(r => r.json())
      .then(d => { if (d && !d.error) setAutoSettings(d); });
    // WordPress 사이트 목록 로드
    fetch('/api/wordpress/sites')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setWpSites(d); });
  }, []);

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

  // 설정 저장
  const saveSettings = async (newSettings: Partial<AutoSettings>) => {
    setSavingSettings(true);
    setSettingsError('');
    const merged = { ...autoSettings, ...newSettings };
    // 낙관적 업데이트 (즉시 UI 반영)
    setAutoSettings(merged);
    const res = await fetch('/api/auto-service/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    });
    if (res.ok) {
      const saved = await res.json();
      setAutoSettings(saved);
    } else {
      const err = await res.json().catch(() => ({}));
      const msg = err.error || '설정 저장 실패';
      setSettingsError(msg.includes('does not exist') || msg.includes('relation')
        ? 'Supabase에 테이블이 없습니다. SQL Editor에서 bossai_auto_settings 테이블을 생성해주세요.'
        : msg);
      // 실패 시 원래 상태로 복원
      setAutoSettings(prev => ({ ...prev, ...autoSettings }));
    }
    setSavingSettings(false);
  };

  // 지금 바로 실행
  const runNow = async () => {
    setRunningNow(true);
    setRunResult(null);
    const res = await fetch('/api/auto-service/auto-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords: autoSettings.custom_keywords.length > 0 ? autoSettings.custom_keywords : [],
        ai_model: autoSettings.ai_model,
        max: autoSettings.max_per_run,
        ...getAiKeys(),
      }),
    });
    const data = await res.json();
    setRunResult({ generated: data.generated || 0, keywords: data.keywords || [] });
    setRunningNow(false);
    // 초안 탭으로 이동
    if (data.generated > 0) {
      setTab('drafts');
      await loadArticles();
    }
    // 설정 갱신 (last_run_at 업데이트)
    fetch('/api/auto-service/settings').then(r => r.json()).then(d => { if (d && !d.error) setAutoSettings(d); });
  };

  // 수동 글 생성
  const generateManual = async (keyword: string) => {
    if (!keyword.trim()) return;
    setGenerating(true);
    setGeneratingKw(keyword);
    try {
      const res = await fetch('/api/auto-service/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, ai_model: autoSettings.ai_model, ...getAiKeys() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '생성 실패');
      setManualKeyword('');
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
    setModalTab('preview');
    setEditMode(false);
    setEditContent(article.content);
    setEditTitle(article.title);
    setEditModel(article.ai_model || 'qwen3');
    setPublishResult(null);
    setImgResults([]);
    setReplacingImgSrc(null);
    setImgQuery(article.keyword || '');
    setThumbTitle(article.title);
    setThumbKeyword(article.keyword || '');
    setThumbColor('blue');
    setThumbRepUrl(article.representative_image_url);
  };

  // 콘텐츠에서 img src 목록 추출
  const extractImages = (html: string): string[] => {
    const matches = [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)];
    return [...new Set(matches.map(m => m[1]))];
  };

  // 이미지 검색 (Google, Pixabay, SNS)
  const searchImages = async (tab: 'google' | 'pixabay' | 'sns', q: string) => {
    setImgLoading(true);
    setImgResults([]);
    const res = await fetch(`/api/auto-service/images?action=${tab}&q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setImgResults(data.images || []);
    setImgLoading(false);
  };

  // 이미지 교체 (editContent 내 src URL 변경)
  const replaceImage = (oldSrc: string, newUrl: string) => {
    setEditContent(prev => prev.replaceAll(oldSrc, newUrl));
    setReplacingImgSrc(null);
    setImgResults([]);
  };

  // 파일 업로드
  const uploadFile = async (file: File, oldSrc: string) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/auto-service/images', { method: 'POST', body: form });
    const data = await res.json();
    if (data.url) replaceImage(oldSrc, data.url);
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
    setSelBlog([]);
    setSelSns([]);
    setSelWpSiteIds([]);
    setPublishResult(null);
  };

  const doPublish = async () => {
    if (!publishArticle) return;
    setPublishing(true);
    const res = await fetch('/api/auto-service/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        article_id: publishArticle.id,
        blog_platforms: selBlog,
        sns_platforms: selSns,
        wp_site_ids: selWpSiteIds,
      }),
    });
    const data = await res.json();
    setPublishResult(data.results || {});
    setPublishing(false);
    await loadArticles();
  };

  const togglePlatform = (arr: string[], setArr: (v: string[]) => void, id: string) => {
    setArr(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  };

  const addCustomKeyword = () => {
    const kw = customKwInput.trim();
    if (!kw || autoSettings.custom_keywords.includes(kw)) return;
    const newKws = [...autoSettings.custom_keywords, kw];
    setAutoSettings(prev => ({ ...prev, custom_keywords: newKws }));
    setCustomKwInput('');
  };

  const removeCustomKeyword = (kw: string) => {
    setAutoSettings(prev => ({ ...prev, custom_keywords: prev.custom_keywords.filter(k => k !== kw) }));
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🤖 자동화서비스 — 블로그 자동화</h1>
        <p className="text-sm text-gray-500 mt-1">트렌딩 키워드 자동 감지 → AI 3000자+ SEO 글 생성 → 대표이미지 자동 제작 → 승인만 하면 발행</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {([['auto', '⚙️ 자동실행 설정'], ['drafts', '📝 초안 관리'], ['history', '📚 발행 히스토리']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
            {t === 'drafts' && articles.length > 0 && (
              <span className="ml-1.5 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{articles.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ===== 자동실행 설정 탭 ===== */}
      {tab === 'auto' && (
        <div className="space-y-5">
          {/* 자동실행 ON/OFF */}
          <div className="bg-white rounded-2xl border-2 border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">자동 실행</h2>
                <p className="text-sm text-gray-500 mt-0.5">매일 오전 9시마다 트렌딩 키워드를 수집하여 자동으로 블로그 초안을 생성합니다</p>
              </div>
              <button
                onClick={() => saveSettings({ enabled: !autoSettings.enabled })}
                disabled={savingSettings}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${autoSettings.enabled ? 'bg-blue-600' : 'bg-gray-300'} ${savingSettings ? 'opacity-50' : ''}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${autoSettings.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {settingsError && (
              <div className="mt-4 p-3 bg-red-50 rounded-xl text-sm text-red-700 border border-red-200">
                ⚠️ {settingsError}
              </div>
            )}

            {autoSettings.enabled && !settingsError && (
              <div className="mt-4 p-3 bg-blue-50 rounded-xl text-sm text-blue-700 flex items-center gap-2">
                <span className="text-lg">🟢</span>
                <div>
                  <strong>자동실행 활성화됨</strong> — 매일 오전 9시 최대 {autoSettings.max_per_run}개 글 자동 생성
                  {autoSettings.last_run_at && (
                    <span className="block text-xs text-blue-500 mt-0.5">
                      마지막 실행: {new Date(autoSettings.last_run_at).toLocaleString('ko-KR')}
                      {autoSettings.last_run_count !== undefined && ` · ${autoSettings.last_run_count}개 생성됨`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 설정 옵션 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-800">상세 설정</h2>

            {/* AI 모델 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">AI 모델</label>
              <div className="flex flex-wrap gap-2">
                {AI_MODELS.map(m => (
                  <button key={m.id}
                    onClick={() => setAutoSettings(prev => ({ ...prev, ai_model: m.id }))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${autoSettings.ai_model === m.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    {m.emoji} {m.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 최대 생성 수 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">실행 당 최대 생성 수</label>
              <div className="flex gap-2">
                {[1, 2, 3, 5, 10].map(n => (
                  <button key={n}
                    onClick={() => setAutoSettings(prev => ({ ...prev, max_per_run: n }))}
                    className={`w-12 h-9 rounded-lg text-sm font-medium transition-colors ${autoSettings.max_per_run === n ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* 키워드 설정 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">고정 키워드 (비어있으면 트렌딩 자동사용)</label>
              <div className="flex gap-2 mb-2">
                <input value={customKwInput} onChange={e => setCustomKwInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomKeyword()}
                  placeholder="예: BTS 공연, 요즘 트렌드" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <button onClick={addCustomKeyword} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">추가</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {autoSettings.custom_keywords.map(kw => (
                  <span key={kw} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm">
                    {kw}
                    <button onClick={() => removeCustomKeyword(kw)} className="text-blue-400 hover:text-blue-600 ml-1">×</button>
                  </span>
                ))}
                {autoSettings.custom_keywords.length === 0 && (
                  <span className="text-xs text-gray-400">트렌딩 키워드 자동 사용 중</span>
                )}
              </div>
            </div>

            <button onClick={() => saveSettings(autoSettings)} disabled={savingSettings}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {savingSettings ? '저장 중...' : '💾 설정 저장'}
            </button>
          </div>

          {/* 지금 바로 실행 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-3">지금 바로 실행</h2>
            <p className="text-sm text-gray-500 mb-4">스케줄을 기다리지 않고 지금 즉시 글을 생성합니다. 생성된 초안은 "초안 관리"에서 확인하고 승인 후 발행하세요.</p>

            {runResult && (
              <div className={`mb-4 p-3 rounded-xl text-sm ${runResult.generated > 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                {runResult.generated > 0 ? (
                  <div>
                    <strong>✅ {runResult.generated}개 글 생성 완료!</strong>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {runResult.keywords.map((kw, i) => <span key={i} className="text-xs bg-green-100 px-2 py-0.5 rounded">{kw}</span>)}
                    </div>
                  </div>
                ) : (
                  <span>⚠️ 새로 생성할 키워드가 없습니다 (최근 7일 내 같은 키워드 글 이미 존재)</span>
                )}
              </div>
            )}

            <button onClick={runNow} disabled={runningNow}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-bold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {runningNow ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  <span>실행 중... (최대 5분 소요)</span>
                </>
              ) : '🚀 지금 바로 실행'}
            </button>
          </div>

          {/* 수동 키워드 글 생성 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-3">특정 키워드 직접 생성</h2>
            <div className="flex gap-2">
              <input value={manualKeyword} onChange={e => setManualKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generateManual(manualKeyword)}
                placeholder="예: BTS 광화문 공연 후기"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <button onClick={() => generateManual(manualKeyword)} disabled={generating || !manualKeyword.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {generating ? '⏳' : '✨ 생성'}
              </button>
            </div>
            {generating && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                <div>
                  <div>"{generatingKw}" 3000자+ SEO 글 생성 중...</div>
                  <div className="text-xs text-blue-400 mt-0.5">뉴스/블로그 수집 → AI 작성 → 대표이미지 제작</div>
                </div>
              </div>
            )}
          </div>

          {/* 작동 방식 안내 */}
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-700 mb-3">🔄 자동화 흐름</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: '📡', title: '트렌딩 감지', desc: '6시간마다 네이버/구글 트렌딩 키워드 자동 수집' },
                { icon: '🤖', title: 'AI 글 작성', desc: '뉴스·블로그 참고 → 3000자+ SEO 최적화 HTML 자동 생성' },
                { icon: '🖼️', title: '대표이미지 제작', desc: 'Blogger 스타일 그라디언트 썸네일 자동 생성 (1080×1080)' },
                { icon: '✅', title: '승인 & 발행', desc: '초안 확인 후 클릭 한 번으로 네이버/블로거/WordPress + SNS 발행' },
              ].map((step, i) => (
                <div key={i} className="bg-white rounded-xl p-3 border border-gray-200">
                  <div className="text-2xl mb-1">{step.icon}</div>
                  <div className="text-sm font-semibold text-gray-800">{step.title}</div>
                  <div className="text-xs text-gray-500 mt-1">{step.desc}</div>
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
              className="text-sm text-blue-600 hover:underline">{loadingArticles ? '로딩...' : '새로고침'}</button>
          </div>

          {!loadingArticles && articles.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-4">📝</div>
              <p className="font-medium">초안이 없습니다</p>
              <p className="text-sm mt-1">자동실행 설정 탭에서 글을 생성해보세요</p>
              <button onClick={() => setTab('auto')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                설정으로 이동
              </button>
            </div>
          )}

          <div className="grid gap-4">
            {articles.map(article => (
              <div key={article.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-start gap-3">
                  {article.representative_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={article.representative_image_url} alt="" className="w-20 h-20 object-cover rounded-xl flex-shrink-0 border border-gray-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABELS[article.status].color}`}>
                        {STATUS_LABELS[article.status].label}
                      </span>
                      <span className="text-xs text-gray-400">{article.word_count.toLocaleString()}자</span>
                      <span className="text-xs text-gray-400">• {AI_MODELS.find(m => m.id === article.ai_model)?.emoji} {article.ai_model}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 line-clamp-1">{article.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">{article.meta_description}</p>
                    <div className="text-xs text-gray-400 mt-1">
                      🔑 {article.keyword} · {new Date(article.created_at).toLocaleString('ko-KR')}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button onClick={() => openPreview(article)}
                      className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                      미리보기/편집
                    </button>
                    <button onClick={() => openPublish(article)}
                      className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                      ✅ 승인 & 발행
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

          {history.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-4">📚</div>
              <p>아직 발행된 글이 없습니다</p>
            </div>
          )}

          <div className="grid gap-4">
            {history.map(article => (
              <div key={article.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  {article.representative_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={article.representative_image_url} alt="" className="w-20 h-20 object-cover rounded-xl flex-shrink-0 border border-gray-100" />
                  )}
                  <div className="flex-1">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-800">발행완료</span>
                    <h3 className="font-semibold text-gray-900 mt-1">{article.title}</h3>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{article.meta_description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(article.published_urls || {}).map(([platform, url]) =>
                        url ? (
                          <a key={platform} href={url} target="_blank" rel="noopener noreferrer"
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:underline">
                            {platform} 보기 →
                          </a>
                        ) : null
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {article.published_at && new Date(article.published_at).toLocaleString('ko-KR')}
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
            {/* 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABELS[previewArticle.status].color}`}>
                  {STATUS_LABELS[previewArticle.status].label}
                </span>
                <span className="text-sm text-gray-500">{previewArticle.word_count.toLocaleString()}자</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {modalTab === 'edit' && (
                  <button onClick={saveEdit} disabled={savingEdit} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
                    {savingEdit ? '저장 중...' : '💾 저장'}
                  </button>
                )}
                <button onClick={() => { openPublish(previewArticle); setPreviewArticle(null); }}
                  className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">🚀 발행</button>
                <button onClick={() => deleteArticle(previewArticle.id)} className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200">🗑️</button>
                <button onClick={() => setPreviewArticle(null)} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg">✕</button>
              </div>
            </div>

            {/* 탭 */}
            <div className="flex border-b border-gray-200 px-4">
              {([['preview', '👁️ 미리보기'], ['edit', '✏️ 편집'], ['images', '🖼️ 이미지']] as ['preview'|'edit'|'images', string][]).map(([t, label]) => (
                <button key={t} onClick={() => setModalTab(t)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${modalTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* 미리보기 탭 */}
            {modalTab === 'preview' && (
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">{previewArticle.title}</h2>
                {previewArticle.meta_description && (
                  <p className="text-sm text-gray-500 mb-4 pb-4 border-b border-gray-100">{previewArticle.meta_description}</p>
                )}
                {previewArticle.representative_image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewArticle.representative_image_url} alt={previewArticle.keyword}
                    className="w-full max-h-80 object-cover rounded-xl mb-6" />
                )}
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewArticle.content }} />
              </div>
            )}

            {/* 편집 탭 */}
            {modalTab === 'edit' && (
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">제목 (SEO)</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">AI 모델</label>
                  <div className="flex flex-wrap gap-2">
                    {AI_MODELS.map(m => (
                      <button key={m.id} onClick={() => setEditModel(m.id)}
                        className={`px-2 py-1 rounded text-xs font-medium ${editModel === m.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                        {m.emoji} {m.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">HTML 내용 직접 수정</label>
                  <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                    rows={22} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                </div>
              </div>
            )}

            {/* 이미지 탭 */}
            {modalTab === 'images' && (
              <div className="p-4">

                {/* ── 대표이미지 편집기 ── */}
                <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-xs font-semibold text-gray-700 mb-3">🖼️ 대표이미지 (썸네일) 편집</p>
                  <div className="flex gap-3 mb-3">
                    {thumbRepUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbRepUrl} alt="대표이미지" className="w-24 h-24 object-cover rounded-lg border border-gray-200 flex-shrink-0" />
                    )}
                    <div className="flex-1 space-y-2">
                      <input value={thumbTitle} onChange={e => setThumbTitle(e.target.value)}
                        placeholder="제목 텍스트" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                      <input value={thumbKeyword} onChange={e => setThumbKeyword(e.target.value)}
                        placeholder="키워드 태그" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                      <div className="flex gap-2">
                        {([['blue', '🔵 블루'], ['dark', '⚫ 다크'], ['green', '🟢 그린']] as ['blue'|'dark'|'green', string][]).map(([c, label]) => (
                          <button key={c} onClick={() => setThumbColor(c)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${thumbColor === c ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={async () => {
                      if (!previewArticle) return;
                      setThumbGenerating(true);
                      const res = await fetch('/api/auto-service/thumbnail', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ article_id: previewArticle.id, title: thumbTitle, keyword: thumbKeyword, color_scheme: thumbColor }),
                      });
                      const data = await res.json();
                      if (data.url) {
                        setThumbRepUrl(data.url);
                        setPreviewArticle(prev => prev ? { ...prev, representative_image_url: data.url } : null);
                        await loadArticles();
                      }
                      setThumbGenerating(false);
                    }} disabled={thumbGenerating}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      {thumbGenerating ? '생성 중...' : '🎨 썸네일 재생성'}
                    </button>
                    <label className="flex-1 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer text-center">
                      📁 이미지 직접 업로드
                      <input type="file" accept="image/*" className="hidden" onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file || !previewArticle) return;
                        setThumbGenerating(true);
                        const form = new FormData();
                        form.append('file', file);
                        form.append('article_id', previewArticle.id);
                        const res = await fetch('/api/auto-service/thumbnail', { method: 'PUT', body: form });
                        const data = await res.json();
                        if (data.url) {
                          setThumbRepUrl(data.url);
                          setPreviewArticle(prev => prev ? { ...prev, representative_image_url: data.url } : null);
                          await loadArticles();
                        }
                        setThumbGenerating(false);
                      }} />
                    </label>
                  </div>
                </div>

                {/* 현재 글 이미지 목록 */}
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-600 mb-2">📄 본문 이미지 ({extractImages(editContent).length}개) — 클릭하면 교체</p>
                  {extractImages(editContent).length === 0 ? (
                    <p className="text-sm text-gray-400">이미지 없음</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {extractImages(editContent).map((src, i) => (
                        <div key={i} onClick={() => setReplacingImgSrc(replacingImgSrc === src ? null : src)}
                          className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${replacingImgSrc === src ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200 hover:border-blue-300'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`이미지 ${i+1}`} className="w-28 h-20 object-cover" />
                          <div className="absolute inset-0 bg-black/0 hover:bg-black/20 flex items-center justify-center transition-all">
                            {replacingImgSrc === src && <span className="text-white text-xs font-bold bg-blue-500 px-2 py-0.5 rounded">교체 중</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {replacingImgSrc && (
                    <p className="text-xs text-blue-600 mt-2 font-medium">↓ 아래에서 교체할 이미지를 선택하세요</p>
                  )}
                </div>

                {/* 이미지 검색 탭 */}
                <div className="flex gap-1 mb-3 border-b border-gray-200">
                  {([['google', '🔍 구글'], ['pixabay', '📸 픽사베이'], ['sns', '🐦 SNS'], ['upload', '📁 업로드']] as ['google'|'pixabay'|'sns'|'upload', string][]).map(([t, label]) => (
                    <button key={t} onClick={() => { setImgSearchTab(t); setImgResults([]); }}
                      className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${imgSearchTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {imgSearchTab !== 'upload' && (
                  <div className="flex gap-2 mb-3">
                    <input value={imgQuery} onChange={e => setImgQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchImages(imgSearchTab as 'google'|'pixabay'|'sns', imgQuery)}
                      placeholder={imgSearchTab === 'sns' ? '계정 이름 검색...' : `${previewArticle.keyword} 이미지 검색...`}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    <button onClick={() => searchImages(imgSearchTab as 'google'|'pixabay'|'sns', imgQuery || previewArticle.keyword)}
                      disabled={imgLoading}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                      {imgLoading ? '...' : '검색'}
                    </button>
                  </div>
                )}

                {imgSearchTab === 'upload' && (
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                    <p className="text-sm text-gray-500 mb-2">이미지를 드래그하거나 클릭하여 업로드</p>
                    <input type="file" accept="image/*" onChange={e => {
                      const file = e.target.files?.[0];
                      if (file && replacingImgSrc) uploadFile(file, replacingImgSrc);
                      else if (file) alert('먼저 위에서 교체할 이미지를 클릭하세요');
                    }} className="hidden" id="img-upload" />
                    <label htmlFor="img-upload" className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 inline-block">
                      파일 선택
                    </label>
                    {!replacingImgSrc && <p className="text-xs text-orange-500 mt-2">⚠️ 먼저 위에서 교체할 이미지를 클릭하세요</p>}
                  </div>
                )}

                {imgResults.length > 0 && (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-80 overflow-y-auto">
                    {imgResults.map((img, i) => (
                      <div key={i} onClick={() => replacingImgSrc ? replaceImage(replacingImgSrc, img.url) : alert('먼저 위에서 교체할 이미지를 클릭하세요')}
                        className="relative cursor-pointer rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.thumb || img.url} alt={img.author} className="w-full h-20 object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all">
                          <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100">교체</span>
                        </div>
                        <p className="text-xs text-gray-400 truncate px-1 py-0.5">{img.caption || img.author}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* 저장 버튼 */}
                {editContent !== previewArticle.content && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button onClick={saveEdit} disabled={savingEdit}
                      className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      {savingEdit ? '저장 중...' : '💾 이미지 변경 저장'}
                    </button>
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
                  <div className="space-y-2">
                    {BLOG_PLATFORMS.filter(p => p.id !== 'wordpress').map(p => (
                      <label key={p.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={selBlog.includes(p.id)} onChange={() => togglePlatform(selBlog, setSelBlog, p.id)} className="w-4 h-4" />
                        <span>{p.icon} {p.name}</span>
                      </label>
                    ))}
                    {/* WordPress 사이트 목록 */}
                    {wpSites.length > 0 ? (
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-1.5 mt-1">🔵 WordPress 사이트 선택</div>
                        {wpSites.map(site => (
                          <label key={site.id} className="flex items-center gap-3 p-3 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-50 mb-1.5">
                            <input type="checkbox"
                              checked={selWpSiteIds.includes(site.id)}
                              onChange={() => {
                                const newIds = selWpSiteIds.includes(site.id)
                                  ? selWpSiteIds.filter(id => id !== site.id)
                                  : [...selWpSiteIds, site.id];
                                setSelWpSiteIds(newIds);
                                // wordpress를 blog_platforms에 포함 여부 자동 설정
                                if (newIds.length > 0 && !selBlog.includes('wordpress')) {
                                  setSelBlog(prev => [...prev, 'wordpress']);
                                } else if (newIds.length === 0) {
                                  setSelBlog(prev => prev.filter(b => b !== 'wordpress'));
                                }
                              }}
                              className="w-4 h-4" />
                            <div>
                              <div className="text-sm font-medium text-gray-800">{site.site_name}</div>
                              <div className="text-xs text-gray-400">{site.site_url}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500 border border-gray-200">
                        🔵 WordPress 사이트가 없습니다.{' '}
                        <a href="/dashboard/wordpress" className="text-blue-600 hover:underline">WordPress 관리</a>에서 사이트를 추가하세요.
                      </div>
                    )}
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
                  <button onClick={() => setPublishArticle(null)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">취소</button>
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
                        {result.url && <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">보기</a>}
                      </div>
                    ) : (
                      <span className="text-red-600 text-xs">{result.error || '실패'}</span>
                    )}
                  </div>
                ))}
                <button onClick={() => setPublishArticle(null)} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm mt-2">닫기</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
