'use client';

import { useState, useEffect, useCallback } from 'react';

type Status = 'pending' | 'rewriting' | 'ready' | 'failed' | 'published';

const STATUS_META: Record<Status, { label: string; color: string }> = {
  pending:   { label: '대기중',   color: 'bg-yellow-100 text-yellow-800' },
  rewriting: { label: '리라이팅중', color: 'bg-blue-100 text-blue-800 animate-pulse' },
  ready:     { label: '준비',     color: 'bg-green-100 text-green-800' },
  failed:    { label: '실패',     color: 'bg-red-100 text-red-800' },
  published: { label: '발행완료', color: 'bg-purple-100 text-purple-800' },
};

interface Article {
  id: string;
  notion_page_id: string | null;
  title: string;
  source_url: string;
  source_account: string;
  source_id: string | null;
  representative_image_url: string | null;
  rewritten_title: string;
  rewritten_meta: string;
  rewritten_content: string;
  status: Status;
  ai_model: string;
  word_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface SourceSite {
  id: string;
  name: string;
  site_url: string;
  feed_url: string | null;
  is_active: boolean;
  last_checked_at: string | null;
}

type FilterStatus = 'all' | Status;

export default function RewritePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterAccount, setFilterAccount] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [running, setRunning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // 수동 추가 모달
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addAccount, setAddAccount] = useState('');
  const [addContent, setAddContent] = useState('');
  const [adding, setAdding] = useState(false);

  // 소스 사이트 관리
  const [sites, setSites] = useState<SourceSite[]>([]);
  const [showSites, setShowSites] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [addingSite, setAddingSite] = useState(false);
  const [checkingSites, setCheckingSites] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus !== 'all') params.set('status', filterStatus);
    if (filterAccount) params.set('account', filterAccount);
    params.set('limit', '100');

    const res = await fetch(`/api/rewrite/articles?${params}`);
    const data = await res.json();
    if (data.ok) {
      setArticles(data.data || []);
      setAccounts(data.accounts || []);
    }
    setLoading(false);
  }, [filterStatus, filterAccount]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  const fetchSites = useCallback(async () => {
    const res = await fetch('/api/rewrite/sites');
    const data = await res.json();
    if (data.ok) setSites(data.data || []);
  }, []);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  const handleAddSite = async () => {
    if (!siteName.trim() || !siteUrl.trim()) return;
    setAddingSite(true);
    const res = await fetch('/api/rewrite/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: siteName, site_url: siteUrl }),
    });
    const data = await res.json();
    setAddingSite(false);
    if (data.ok) {
      showToast('사이트 등록 완료');
      setSiteName(''); setSiteUrl('');
      fetchSites();
    } else {
      showToast(data.error || '등록 실패 (RSS 피드를 못 찾았을 수 있음)', false);
    }
  };

  const handleDeleteSite = async (id: string) => {
    if (!confirm('이 사이트를 삭제할까요?')) return;
    await fetch(`/api/rewrite/sites?id=${id}`, { method: 'DELETE' });
    setSites((prev) => prev.filter((s) => s.id !== id));
  };

  const handleToggleSite = async (site: SourceSite) => {
    const res = await fetch('/api/rewrite/sites', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: site.id, is_active: !site.is_active }),
    });
    const data = await res.json();
    if (data.ok) setSites((prev) => prev.map((s) => (s.id === site.id ? data.data : s)));
  };

  const handleCheckSites = async () => {
    setCheckingSites(true);
    const res = await fetch('/api/rewrite/sync-sites', { method: 'POST' });
    const data = await res.json();
    setCheckingSites(false);
    if (data.ok) {
      showToast(`사이트 확인 완료 (새 글 ${data.newFound}개)`);
      fetchArticles();
      fetchSites();
    } else {
      showToast(data.error || '확인 실패', false);
    }
  };

  // 자동 새로고침 (리라이팅 중인 기사 있을 때)
  useEffect(() => {
    const hasRewriting = articles.some((a) => a.status === 'rewriting');
    if (!hasRewriting) return;
    const t = setInterval(() => fetchArticles(), 8000);
    return () => clearInterval(t);
  }, [articles, fetchArticles]);

  const handleSync = async () => {
    setSyncing(true);
    const res = await fetch('/api/rewrite/sync', { method: 'POST' });
    const data = await res.json();
    setSyncing(false);
    if (data.ok) {
      showToast(`Notion 동기화 완료 (${data.synced}개 추가)`);
      fetchArticles();
    } else {
      showToast(data.error || '동기화 실패', false);
    }
  };

  const handleAutoRun = async () => {
    setRunning(true);
    const res = await fetch('/api/rewrite/auto-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max: 2, ai_model: 'qwen3', skip_sync: true }),
    });
    const data = await res.json();
    setRunning(false);
    if (data.ok) {
      showToast(`리라이팅 완료 (${data.processed}개)`);
      fetchArticles();
    } else {
      showToast(data.error || '실패', false);
    }
  };

  const handleProcessOne = async (id: string) => {
    setRunning(true);
    const res = await fetch('/api/rewrite/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: id, ai_model: 'qwen3' }),
    });
    const data = await res.json();
    setRunning(false);
    if (data.ok) {
      showToast('리라이팅 완료');
      fetchArticles();
    } else {
      showToast(data.error || '실패', false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(id);
    const res = await fetch('/api/rewrite/articles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, rewritten_title: editTitle, rewritten_content: editContent, status: 'ready' }),
    });
    const data = await res.json();
    setSaving(null);
    if (data.ok) {
      showToast('저장 완료');
      setEditingId(null);
      fetchArticles();
    } else {
      showToast(data.error || '저장 실패', false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    const res = await fetch(`/api/rewrite/articles?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      showToast('삭제 완료');
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } else {
      showToast(data.error || '삭제 실패', false);
    }
  };

  const handleResetFailed = async (id: string) => {
    const res = await fetch('/api/rewrite/articles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'pending', error_message: null }),
    });
    const data = await res.json();
    if (data.ok) { showToast('재시도 준비 완료'); fetchArticles(); }
  };

  const handleAdd = async () => {
    if (!addTitle.trim()) return;
    setAdding(true);
    const res = await fetch('/api/rewrite/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: addTitle,
        source_url: addUrl,
        source_account: addAccount,
        original_content: addContent,
      }),
    });
    const data = await res.json();
    setAdding(false);
    if (data.ok) {
      showToast('추가 완료');
      setShowAdd(false);
      setAddTitle(''); setAddUrl(''); setAddAccount(''); setAddContent('');
      fetchArticles();
    } else {
      showToast(data.error || '추가 실패', false);
    }
  };

  // 계정별 그룹화
  const grouped = filterAccount
    ? { [filterAccount]: articles }
    : articles.reduce<Record<string, Article[]>>((acc, a) => {
        const key = a.source_account || '(미분류)';
        if (!acc[key]) acc[key] = [];
        acc[key].push(a);
        return acc;
      }, {});

  const pendingCount = articles.filter((a) => a.status === 'pending').length;
  const readyCount = articles.filter((a) => a.status === 'ready').length;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      {/* 토스트 */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${
          toast.ok ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">리라이팅</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Notion에서 수집된 글을 AI로 자동 리라이팅 (10분마다 자동 실행)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-2 text-sm font-semibold bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            {syncing ? '동기화중...' : 'Notion 동기화'}
          </button>
          <button
            onClick={() => setShowSites((v) => !v)}
            className="px-3 py-2 text-sm font-semibold bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors"
          >
            📡 소스 사이트 ({sites.length})
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-2 text-sm font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            + 직접 추가
          </button>
          <button
            onClick={handleAutoRun}
            disabled={running || pendingCount === 0}
            className="px-4 py-2 text-sm font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {running ? '리라이팅중...' : `지금 실행 (${pendingCount}개 대기)`}
          </button>
        </div>
      </div>

      {/* 소스 사이트 관리 */}
      {showSites && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">소스 사이트</h3>
              <p className="text-xs text-gray-500 mt-0.5">등록한 사이트에 새 글이 올라오면 RSS로 감지해 자동 리라이팅합니다 (10분마다).</p>
            </div>
            <button
              onClick={handleCheckSites}
              disabled={checkingSites || sites.length === 0}
              className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors flex-shrink-0"
            >
              {checkingSites ? '확인중...' : '지금 확인'}
            </button>
          </div>

          <div className="space-y-2 mb-3">
            {sites.length === 0 && <p className="text-xs text-gray-400">등록된 사이트가 없습니다.</p>}
            {sites.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded-lg">
                <input type="checkbox" checked={s.is_active} onChange={() => handleToggleSite(s)} className="flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-800 truncate">{s.name}</p>
                  <p className="text-xs text-gray-400 truncate">{s.feed_url || s.site_url}</p>
                </div>
                {s.last_checked_at && (
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {new Date(s.last_checked_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <button onClick={() => handleDeleteSite(s.id)} className="text-gray-400 hover:text-red-500 text-xs flex-shrink-0">삭제</button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="사이트 이름"
              className="w-32 px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
            />
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
            />
            <button
              onClick={handleAddSite}
              disabled={addingSite}
              className="px-3 py-1.5 text-sm font-semibold bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors flex-shrink-0"
            >
              {addingSite ? '등록중...' : '등록'}
            </button>
          </div>
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {(['all', 'pending', 'rewriting', 'ready', 'failed'] as const).map((s) => {
          const count = s === 'all' ? articles.length : articles.filter((a) => a.status === s).length;
          const meta = s === 'all'
            ? { label: '전체', color: 'bg-gray-100 text-gray-700' }
            : STATUS_META[s];
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`p-3 rounded-xl border-2 transition-all text-left ${
                filterStatus === s ? 'border-indigo-500 shadow-md' : 'border-transparent'
              } ${meta.color}`}
            >
              <div className="text-2xl font-black">{count}</div>
              <div className="text-xs font-semibold mt-0.5">{meta.label}</div>
            </button>
          );
        })}
      </div>

      {/* 계정 필터 */}
      {accounts.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setFilterAccount('')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              filterAccount === '' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            전체 계정
          </button>
          {accounts.map((acc) => (
            <button
              key={acc}
              onClick={() => setFilterAccount(acc === filterAccount ? '' : acc)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                filterAccount === acc ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {acc}
            </button>
          ))}
        </div>
      )}

      {/* 기사 목록 (계정별 그룹화) */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-4xl mb-3">✍️</div>
          <p className="font-semibold">리라이팅 대상 기사가 없습니다</p>
          <p className="text-sm mt-1">Notion DB에 기사를 추가하거나 직접 추가하세요</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([account, items]) => (
            <div key={account}>
              {!filterAccount && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                  <h2 className="text-sm font-bold text-gray-700">{account}</h2>
                  <span className="text-xs text-gray-400">({items.length}개)</span>
                </div>
              )}
              <div className="space-y-3">
                {items.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    expanded={expandedId === article.id}
                    editing={editingId === article.id}
                    editTitle={editTitle}
                    editContent={editContent}
                    saving={saving === article.id}
                    running={running}
                    onToggle={() => setExpandedId(expandedId === article.id ? null : article.id)}
                    onEdit={() => {
                      setEditingId(article.id);
                      setEditTitle(article.rewritten_title || article.title);
                      setEditContent(article.rewritten_content);
                      setExpandedId(article.id);
                    }}
                    onCancelEdit={() => setEditingId(null)}
                    onSave={() => handleSaveEdit(article.id)}
                    onEditTitle={setEditTitle}
                    onEditContent={setEditContent}
                    onProcess={() => handleProcessOne(article.id)}
                    onDelete={() => handleDelete(article.id)}
                    onRetry={() => handleResetFailed(article.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 수동 추가 모달 */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-gray-900">기사 직접 추가</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">제목 *</label>
                <input
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="원문 제목"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">출처 URL</label>
                  <input
                    value={addUrl}
                    onChange={(e) => setAddUrl(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">계정/사이트</label>
                  <input
                    value={addAccount}
                    onChange={(e) => setAddAccount(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="블로그 계정명"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block">원문 내용</label>
                <textarea
                  value={addContent}
                  onChange={(e) => setAddContent(e.target.value)}
                  rows={6}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  placeholder="리라이팅할 원문 내용을 붙여넣으세요"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAdd}
                disabled={adding || !addTitle.trim()}
                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {adding ? '추가중...' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CardProps {
  article: Article;
  expanded: boolean;
  editing: boolean;
  editTitle: string;
  editContent: string;
  saving: boolean;
  running: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onEditTitle: (v: string) => void;
  onEditContent: (v: string) => void;
  onProcess: () => void;
  onDelete: () => void;
  onRetry: () => void;
}

function ArticleCard({
  article, expanded, editing, editTitle, editContent, saving, running,
  onToggle, onEdit, onCancelEdit, onSave, onEditTitle, onEditContent,
  onProcess, onDelete, onRetry,
}: CardProps) {
  const meta = STATUS_META[article.status];
  const displayTitle = article.rewritten_title || article.title;

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-indigo-200 transition-all shadow-sm">
      {/* 카드 헤더 */}
      <div className="flex items-start gap-3 p-4">
        {article.representative_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.representative_image_url}
            alt=""
            className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100"
          />
        )}
        <button onClick={onToggle} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${meta.color}`}>
              {meta.label}
            </span>
            {article.source_account && (
              <span className="text-xs text-gray-400 font-medium">{article.source_account}</span>
            )}
            {article.word_count > 0 && (
              <span className="text-xs text-gray-400">{article.word_count.toLocaleString()}자</span>
            )}
          </div>
          <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{displayTitle}</p>
          {article.source_url && (
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-indigo-500 hover:underline mt-0.5 block truncate"
            >
              {article.source_url}
            </a>
          )}
          {article.status === 'failed' && article.error_message && (
            <p className="text-xs text-red-500 mt-1 line-clamp-1">{article.error_message}</p>
          )}
        </button>

        {/* 액션 버튼 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {article.status === 'pending' && (
            <button
              onClick={onProcess}
              disabled={running}
              className="px-2.5 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {running ? '...' : '리라이팅'}
            </button>
          )}
          {article.status === 'ready' && (
            <button
              onClick={onEdit}
              className="px-2.5 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              편집
            </button>
          )}
          {article.status === 'failed' && (
            <button
              onClick={onRetry}
              className="px-2.5 py-1.5 text-xs font-semibold bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              재시도
            </button>
          )}
          <button
            onClick={onDelete}
            className="px-2 py-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            삭제
          </button>
        </div>
      </div>

      {/* 확장 영역 */}
      {expanded && !editing && article.rewritten_content && (
        <div className="border-t border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">리라이팅 결과</h4>
            <button
              onClick={onEdit}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
            >
              편집하기
            </button>
          </div>
          {article.rewritten_meta && (
            <p className="text-xs text-gray-500 italic mb-3 p-2 bg-gray-50 rounded-lg">{article.rewritten_meta}</p>
          )}
          <div
            className="text-sm text-gray-700 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: article.rewritten_content.slice(0, 2000) + (article.rewritten_content.length > 2000 ? '...' : '') }}
          />
        </div>
      )}

      {/* 편집 모드 */}
      {editing && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">제목</label>
            <input
              value={editTitle}
              onChange={(e) => onEditTitle(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">내용 (HTML)</label>
            <textarea
              value={editContent}
              onChange={(e) => onEditContent(e.target.value)}
              rows={16}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancelEdit}
              className="px-3 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '저장중...' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
