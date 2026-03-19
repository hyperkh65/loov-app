'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncJob {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  result?: { pagesCount?: number; blocksCount?: number; filesCount?: number };
  error_message?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
}

interface NotionPage {
  id: string;
  title: string;
  cover?: string | null;
  icon?: string | null;
  url?: string;
  last_edited_time?: string;
  synced_at?: string;
}

interface NotionBlock {
  id: string;
  type: string;
  content: Record<string, unknown>;
  order_index: number;
  depth: number;
  has_children: boolean;
  parent_id?: string;
}

interface NotionDatabase {
  id: string;
  title: string;
  description?: string;
  synced_at?: string;
}

interface DatabaseItem {
  id: string;
  title: string;
  cover?: string | null;
  icon?: string | null;
  properties: Record<string, unknown>;
  last_edited_time?: string;
}

// ─── Block Renderer ───────────────────────────────────────────────────────────

function richTextToJsx(richText: unknown[]): React.ReactNode {
  if (!Array.isArray(richText)) return null;
  return richText.map((t: unknown, i: number) => {
    const token = t as Record<string, unknown>;
    const text = (token.plain_text as string) || '';
    const ann = (token.annotations as Record<string, boolean>) || {};
    let node: React.ReactNode = text;
    if (ann.bold) node = <strong key={i}>{node}</strong>;
    if (ann.italic) node = <em key={i}>{node}</em>;
    if (ann.code) node = <code key={i} className="bg-slate-700 text-emerald-300 px-1 rounded text-sm font-mono">{node}</code>;
    if (ann.strikethrough) node = <del key={i}>{node}</del>;
    if ((token.href as string)) node = <a key={i} href={token.href as string} className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">{node}</a>;
    return <span key={i}>{node}</span>;
  });
}

function BlockRenderer({ block }: { block: NotionBlock }) {
  const { type, content, depth } = block;
  const data = content as Record<string, unknown>;
  const indentClass = depth > 0 ? `ml-${Math.min(depth * 4, 16)}` : '';

  switch (type) {
    case 'paragraph': {
      const text = richTextToJsx((data.rich_text as unknown[]) || []);
      return <p className={`text-slate-300 my-1.5 ${indentClass}`}>{text || <span className="text-slate-600">&#8203;</span>}</p>;
    }
    case 'heading_1': {
      const text = richTextToJsx((data.rich_text as unknown[]) || []);
      return <h1 className="text-2xl font-bold text-white mt-6 mb-3">{text}</h1>;
    }
    case 'heading_2': {
      const text = richTextToJsx((data.rich_text as unknown[]) || []);
      return <h2 className="text-xl font-bold text-white mt-5 mb-2">{text}</h2>;
    }
    case 'heading_3': {
      const text = richTextToJsx((data.rich_text as unknown[]) || []);
      return <h3 className="text-lg font-semibold text-slate-100 mt-4 mb-2">{text}</h3>;
    }
    case 'bulleted_list_item': {
      const text = richTextToJsx((data.rich_text as unknown[]) || []);
      return (
        <div className={`flex items-start gap-2 my-0.5 ${indentClass}`}>
          <span className="text-slate-400 mt-1.5 flex-shrink-0">•</span>
          <span className="text-slate-300">{text}</span>
        </div>
      );
    }
    case 'numbered_list_item': {
      const text = richTextToJsx((data.rich_text as unknown[]) || []);
      return (
        <div className={`flex items-start gap-2 my-0.5 ${indentClass}`}>
          <span className="text-slate-400 mt-0.5 flex-shrink-0 w-5 text-right">1.</span>
          <span className="text-slate-300">{text}</span>
        </div>
      );
    }
    case 'to_do': {
      const text = richTextToJsx((data.rich_text as unknown[]) || []);
      const checked = data.checked as boolean;
      return (
        <div className={`flex items-start gap-2 my-0.5 ${indentClass}`}>
          <div className={`w-4 h-4 mt-0.5 rounded border flex-shrink-0 flex items-center justify-center ${
            checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-500'
          }`}>
            {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </div>
          <span className={`text-slate-300 ${checked ? 'line-through text-slate-500' : ''}`}>{text}</span>
        </div>
      );
    }
    case 'code': {
      const text = richTextToJsx((data.rich_text as unknown[]) || []);
      const lang = (data.language as string) || '';
      return (
        <div className="my-3">
          {lang && <div className="text-xs text-slate-500 mb-1 font-mono">{lang}</div>}
          <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-x-auto text-sm font-mono text-emerald-300">
            <code>{text}</code>
          </pre>
        </div>
      );
    }
    case 'quote': {
      const text = richTextToJsx((data.rich_text as unknown[]) || []);
      return (
        <blockquote className="border-l-4 border-indigo-500 pl-4 my-2 text-slate-400 italic">
          {text}
        </blockquote>
      );
    }
    case 'callout': {
      const text = richTextToJsx((data.rich_text as unknown[]) || []);
      const icon = (data.icon as Record<string, unknown>);
      const emoji = icon?.type === 'emoji' ? (icon.emoji as string) : '💡';
      const color = (data.color as string) || 'gray';
      const colorMap: Record<string, string> = {
        blue: 'bg-blue-500/10 border-blue-500/30',
        yellow: 'bg-yellow-500/10 border-yellow-500/30',
        green: 'bg-green-500/10 border-green-500/30',
        red: 'bg-red-500/10 border-red-500/30',
        purple: 'bg-purple-500/10 border-purple-500/30',
        gray: 'bg-slate-700/50 border-slate-600',
      };
      const colorClass = colorMap[color.split('_')[0]] || colorMap.gray;
      return (
        <div className={`flex gap-3 rounded-lg border p-3 my-2 ${colorClass}`}>
          <span className="text-lg flex-shrink-0">{emoji}</span>
          <span className="text-slate-300">{text}</span>
        </div>
      );
    }
    case 'divider':
      return <hr className="border-slate-700 my-4" />;
    case 'image': {
      const imgData = data as Record<string, unknown>;
      const url = imgData.type === 'external'
        ? (imgData.external as Record<string, string>)?.url
        : (imgData.file as Record<string, string>)?.url;
      const caption = richTextToJsx((imgData.caption as unknown[]) || []);
      return (
        <figure className="my-4">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={String(caption || '')}
              className="rounded-lg max-w-full"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          {caption && <figcaption className="text-xs text-slate-500 mt-1 text-center">{caption}</figcaption>}
        </figure>
      );
    }
    case 'file': {
      const fileData = data as Record<string, unknown>;
      const url = fileData.type === 'external'
        ? (fileData.external as Record<string, string>)?.url
        : (fileData.file as Record<string, string>)?.url;
      const caption = richTextToJsx((fileData.caption as unknown[]) || []);
      return (
        <div className="my-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300">
            <span>📎</span>
            <span>{caption || 'File'}</span>
          </a>
        </div>
      );
    }
    case 'embed': {
      const url = data.url as string;
      return (
        <div className="my-3 bg-slate-800 rounded-lg p-3 text-sm text-slate-400">
          <span>🔗 Embed: </span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline truncate">{url}</a>
        </div>
      );
    }
    case 'toggle': {
      const text = richTextToJsx((data.rich_text as unknown[]) || []);
      return (
        <details className="my-2 group">
          <summary className="cursor-pointer text-slate-300 hover:text-white flex items-center gap-2">
            <span className="text-slate-500 group-open:rotate-90 transition-transform inline-block">▶</span>
            {text}
          </summary>
          <div className="ml-5 mt-1 text-slate-400 text-sm">
            (내용은 중첩 블록에 있습니다)
          </div>
        </details>
      );
    }
    case 'child_database': {
      const title = (data.title as string) || 'Database';
      return (
        <div className="my-2 flex items-center gap-2 text-slate-400 bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <span>🗃️</span>
          <span className="font-medium text-slate-300">{title}</span>
          <span className="text-xs bg-slate-700 px-2 py-0.5 rounded">Database</span>
        </div>
      );
    }
    case 'child_page': {
      const title = (data.title as string) || 'Page';
      return (
        <div className="my-2 flex items-center gap-2 text-slate-400 bg-slate-800/50 rounded-lg p-3 border border-slate-700">
          <span>📄</span>
          <span className="font-medium text-slate-300">{title}</span>
        </div>
      );
    }
    default:
      return null;
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NotionMirrorPage() {
  const [activeTab, setActiveTab] = useState<'sync' | 'pages' | 'databases'>('sync');

  // Token settings
  const [tokenInput, setTokenInput] = useState('');
  const [tokenStatus, setTokenStatus] = useState<{ hasToken: boolean; tokenPreview: string } | null>(null);
  const [tokenSaving, setTokenSaving] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);

  // Sync tab state
  const [pageUrl, setPageUrl] = useState('https://www.notion.so/YnK-131c999644708011a105c4ec67ef49ea');
  const [syncLoading, setSyncLoading] = useState(false);
  const [currentJob, setCurrentJob] = useState<SyncJob | null>(null);
  const [jobPolling, setJobPolling] = useState(false);

  // Pages tab state
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [selectedPage, setSelectedPage] = useState<NotionPage | null>(null);
  const [pageBlocks, setPageBlocks] = useState<NotionBlock[]>([]);
  const [pageMarkdown, setPageMarkdown] = useState('');
  const [pageDetailLoading, setPageDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'render' | 'markdown'>('render');

  // Databases tab state
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [dbsLoading, setDbsLoading] = useState(false);
  const [selectedDb, setSelectedDb] = useState<NotionDatabase | null>(null);
  const [dbItems, setDbItems] = useState<DatabaseItem[]>([]);
  const [dbItemsLoading, setDbItemsLoading] = useState(false);

  // ─── Token settings ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/notion/mirror/settings').then(r => r.json()).then(setTokenStatus).catch(() => {});
  }, []);

  async function handleSaveToken() {
    if (!tokenInput.trim()) return;
    setTokenSaving(true);
    try {
      const res = await fetch('/api/notion/mirror/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: tokenInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      setTokenStatus({ hasToken: true, tokenPreview: `${tokenInput.trim().slice(0, 12)}••••••••••` });
      setTokenInput('');
      setShowTokenInput(false);
    } catch (e) { alert(String(e)); }
    finally { setTokenSaving(false); }
  }

  async function handleDeleteToken() {
    if (!confirm('토큰을 삭제할까요?')) return;
    await fetch('/api/notion/mirror/settings', { method: 'DELETE' });
    setTokenStatus({ hasToken: false, tokenPreview: '' });
  }

  // ─── Fetch latest job on mount ──────────────────────────────────────────────
  const fetchLatestJob = useCallback(async () => {
    try {
      const res = await fetch('/api/notion/mirror/sync');
      if (res.ok) {
        const data = await res.json();
        setCurrentJob(data.job);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchLatestJob();
  }, [fetchLatestJob]);

  // Poll job status when running/pending
  useEffect(() => {
    if (!currentJob || (currentJob.status !== 'running' && currentJob.status !== 'pending')) {
      setJobPolling(false);
      return;
    }
    setJobPolling(true);
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/notion/mirror/sync');
        if (res.ok) {
          const data = await res.json();
          setCurrentJob(data.job);
          if (data.job?.status === 'done' || data.job?.status === 'failed') {
            setJobPolling(false);
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [currentJob?.id, currentJob?.status]);

  // ─── Sync handler ───────────────────────────────────────────────────────────
  async function handleSync(fullSync: boolean) {
    setSyncLoading(true);
    try {
      const res = await fetch('/api/notion/mirror/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: pageUrl, fullSync }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '동기화 시작 실패');
        return;
      }
      // Start polling
      setCurrentJob({ id: data.jobId, type: fullSync ? 'full_sync' : 'incremental', status: 'pending', created_at: new Date().toISOString() });
    } catch (e) {
      alert(String(e));
    } finally {
      setSyncLoading(false);
    }
  }

  // ─── Load pages ─────────────────────────────────────────────────────────────
  async function loadPages() {
    setPagesLoading(true);
    try {
      const res = await fetch('/api/notion/mirror/pages');
      if (res.ok) {
        const data = await res.json();
        setPages(data.pages || []);
      }
    } catch {}
    setPagesLoading(false);
  }

  useEffect(() => {
    if (activeTab === 'pages') loadPages();
    if (activeTab === 'databases') loadDatabases();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ─── Load page detail ───────────────────────────────────────────────────────
  async function loadPageDetail(page: NotionPage) {
    setSelectedPage(page);
    setPageBlocks([]);
    setPageMarkdown('');
    setPageDetailLoading(true);
    try {
      const res = await fetch(`/api/notion/mirror/pages/${page.id}`);
      if (res.ok) {
        const data = await res.json();
        setPageBlocks(data.blocks || []);
        setPageMarkdown(data.rawMarkdown || '');
      }
    } catch {}
    setPageDetailLoading(false);
  }

  // ─── Load databases ─────────────────────────────────────────────────────────
  async function loadDatabases() {
    setDbsLoading(true);
    try {
      const res = await fetch('/api/notion/mirror/databases');
      if (res.ok) {
        const data = await res.json();
        setDatabases(data.databases || []);
      }
    } catch {}
    setDbsLoading(false);
  }

  async function loadDbItems(db: NotionDatabase) {
    setSelectedDb(db);
    setDbItems([]);
    setDbItemsLoading(true);
    try {
      const res = await fetch(`/api/notion/mirror/databases/${db.id}`);
      if (res.ok) {
        const data = await res.json();
        setDbItems(data.items || []);
      }
    } catch {}
    setDbItemsLoading(false);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function formatDate(iso?: string | null) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      done: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    const labels: Record<string, string> = {
      pending: '대기 중',
      running: '실행 중',
      done: '완료',
      failed: '실패',
    };
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${map[status] || 'bg-slate-700 text-slate-400'}`}>
        {status === 'running' && (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {labels[status] || status}
      </span>
    );
  }

  const lastSyncTime = currentJob?.finished_at || currentJob?.created_at;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-700/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-lg border border-slate-600">
              🔗
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Notion 미러</h1>
              <p className="text-xs text-slate-400">Notion 페이지를 로컬 DB에 동기화</p>
            </div>
          </div>
          {/* Last sync badge */}
          {lastSyncTime && (
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
              <span className="text-slate-400 text-xs">마지막 동기화:</span>
              <span className="text-slate-200 text-xs font-medium">{formatDate(lastSyncTime)}</span>
              {jobPolling && (
                <svg className="w-3 h-3 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {([
            { key: 'sync', label: '동기화', icon: '🔄' },
            { key: 'pages', label: '페이지', icon: '📄' },
            { key: 'databases', label: '데이터베이스', icon: '🗃️' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">

        {/* ── Tab: 동기화 ───────────────────────────────────────────────── */}
        {activeTab === 'sync' && (
          <div className="max-w-2xl space-y-6">
            {/* Token Settings */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-300">🔑 Notion 미러 전용 토큰</h2>
                {tokenStatus?.hasToken && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-400">● 설정됨</span>
                    <button onClick={() => setShowTokenInput(v => !v)} className="text-xs text-slate-400 hover:text-white">변경</button>
                    <button onClick={handleDeleteToken} className="text-xs text-red-400 hover:text-red-300">삭제</button>
                  </div>
                )}
              </div>
              {tokenStatus?.hasToken && !showTokenInput ? (
                <div className="font-mono text-xs text-slate-400 bg-slate-800 px-3 py-2 rounded-lg">{tokenStatus.tokenPreview}</div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    placeholder="secret_xxxxxxxx 또는 ntn_xxxxxxxx"
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={e => e.key === 'Enter' && handleSaveToken()}
                  />
                  <button onClick={handleSaveToken} disabled={tokenSaving || !tokenInput.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm rounded-lg font-medium">
                    {tokenSaving ? '저장 중...' : '저장'}
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-500 mt-2">Notion → 설정 → 내 연결 → API 통합에서 발급. 이 워크스페이스 전용 토큰을 입력하세요.</p>
            </div>

            {/* URL Input */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-3">루트 페이지 URL</h2>
              <input
                type="text"
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="https://www.notion.so/..."
              />
              <p className="text-xs text-slate-500 mt-2">
                동기화할 Notion 페이지 URL (하위 데이터베이스 포함 재귀 동기화)
              </p>
            </div>

            {/* Sync Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => handleSync(true)}
                disabled={syncLoading || jobPolling}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-4 py-3 font-medium transition-colors"
              >
                {(syncLoading || jobPolling) ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : <span>🔄</span>}
                전체 동기화
              </button>
              <button
                onClick={() => handleSync(false)}
                disabled={syncLoading || jobPolling}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-4 py-3 font-medium transition-colors"
              >
                {(syncLoading || jobPolling) ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : <span>⚡</span>}
                증분 동기화
              </button>
            </div>

            {/* Job Status */}
            {currentJob && (
              <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-300">최근 작업 상태</h2>
                  {statusBadge(currentJob.status)}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">작업 ID</div>
                    <div className="text-slate-300 font-mono text-xs truncate">{currentJob.id}</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">유형</div>
                    <div className="text-slate-300">
                      {{ full_sync: '전체 동기화', incremental: '증분 동기화', page_sync: '페이지 동기화' }[currentJob.type] || currentJob.type}
                    </div>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">시작 시간</div>
                    <div className="text-slate-300 text-xs">{formatDate(currentJob.started_at)}</div>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">완료 시간</div>
                    <div className="text-slate-300 text-xs">{formatDate(currentJob.finished_at)}</div>
                  </div>
                </div>

                {currentJob.status === 'done' && currentJob.result && (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: '페이지', value: currentJob.result.pagesCount ?? 0, icon: '📄' },
                      { label: '블록', value: currentJob.result.blocksCount ?? 0, icon: '🧱' },
                      { label: '파일', value: currentJob.result.filesCount ?? 0, icon: '📎' },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                        <div className="text-2xl mb-1">{stat.icon}</div>
                        <div className="text-xl font-bold text-emerald-400">{stat.value}</div>
                        <div className="text-xs text-slate-400">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {currentJob.status === 'failed' && currentJob.error_message && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <div className="text-xs font-semibold text-red-400 mb-1">오류 메시지</div>
                    <div className="text-sm text-red-300 font-mono break-all">{currentJob.error_message}</div>
                  </div>
                )}

                {(currentJob.status === 'running' || currentJob.status === 'pending') && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex items-center gap-3">
                    <svg className="w-5 h-5 animate-spin text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <div className="text-sm text-blue-300">
                      동기화 진행 중... Notion API rate limit(3 req/s)으로 인해 시간이 걸릴 수 있습니다.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Help */}
            <div className="bg-slate-900/50 border border-slate-700/30 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-400 mb-2">사용 방법</h3>
              <ul className="space-y-1.5 text-xs text-slate-500">
                <li className="flex items-start gap-2"><span>•</span><span><strong className="text-slate-400">전체 동기화</strong>: 모든 페이지와 데이터베이스를 처음부터 동기화</span></li>
                <li className="flex items-start gap-2"><span>•</span><span><strong className="text-slate-400">증분 동기화</strong>: 마지막 동기화 이후 변경된 페이지만 업데이트</span></li>
                <li className="flex items-start gap-2"><span>•</span><span>동기화는 백그라운드로 실행되며 상태가 자동 업데이트됩니다</span></li>
                <li className="flex items-start gap-2"><span>•</span><span>파일(이미지, PDF 등)은 NAS에 자동 백업됩니다</span></li>
              </ul>
            </div>
          </div>
        )}

        {/* ── Tab: 페이지 ───────────────────────────────────────────────── */}
        {activeTab === 'pages' && (
          <div className="flex gap-6 h-[calc(100vh-220px)]">
            {/* Pages List */}
            <div className="w-72 flex-shrink-0 bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">페이지 목록</h2>
                <button
                  onClick={loadPages}
                  className="text-slate-400 hover:text-white transition-colors"
                  title="새로고침"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {pagesLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <svg className="w-6 h-6 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                ) : pages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-sm">
                    <span className="text-2xl mb-2">📭</span>
                    <span>동기화된 페이지가 없습니다</span>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {pages.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => loadPageDetail(page)}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-800/60 transition-colors ${
                          selectedPage?.id === page.id ? 'bg-indigo-600/20 border-l-2 border-indigo-500' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base flex-shrink-0">
                            {page.icon && page.icon.startsWith('http') ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={page.icon} alt="" className="w-4 h-4 rounded" />
                            ) : page.icon ? page.icon : '📄'}
                          </span>
                          <span className="text-sm text-slate-200 truncate font-medium">{page.title || '(제목 없음)'}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 ml-6">{formatDate(page.last_edited_time)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Page Detail */}
            <div className="flex-1 bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden flex flex-col">
              {!selectedPage ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <span className="text-4xl mb-3">👈</span>
                  <span className="text-sm">왼쪽에서 페이지를 선택하세요</span>
                </div>
              ) : (
                <>
                  {/* Page Header */}
                  <div className="px-6 py-4 border-b border-slate-700/50">
                    {selectedPage.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedPage.cover}
                        alt="cover"
                        className="w-full h-32 object-cover rounded-lg mb-4"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{selectedPage.icon || '📄'}</span>
                        <h2 className="text-xl font-bold text-white">{selectedPage.title || '(제목 없음)'}</h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewMode('render')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            viewMode === 'render' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          렌더링
                        </button>
                        <button
                          onClick={() => setViewMode('markdown')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            viewMode === 'markdown' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          Markdown
                        </button>
                        {selectedPage.url && (
                          <a
                            href={selectedPage.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 hover:text-white transition-colors"
                          >
                            Notion에서 열기 ↗
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      수정: {formatDate(selectedPage.last_edited_time)} · 동기화: {formatDate(selectedPage.synced_at)}
                    </div>
                  </div>

                  {/* Page Content */}
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    {pageDetailLoading ? (
                      <div className="flex items-center justify-center h-32">
                        <svg className="w-6 h-6 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </div>
                    ) : viewMode === 'markdown' ? (
                      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">{pageMarkdown || '(마크다운 없음)'}</pre>
                    ) : pageBlocks.length === 0 ? (
                      <div className="text-slate-500 text-sm text-center py-8">블록이 없습니다</div>
                    ) : (
                      <div className="max-w-3xl">
                        {pageBlocks.map((block) => (
                          <BlockRenderer key={block.id} block={block} />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: 데이터베이스 ─────────────────────────────────────────── */}
        {activeTab === 'databases' && (
          <div className="flex gap-6 h-[calc(100vh-220px)]">
            {/* Databases List */}
            <div className="w-72 flex-shrink-0 bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">데이터베이스 목록</h2>
                <button
                  onClick={loadDatabases}
                  className="text-slate-400 hover:text-white transition-colors"
                  title="새로고침"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {dbsLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <svg className="w-6 h-6 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                ) : databases.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-sm">
                    <span className="text-2xl mb-2">🗃️</span>
                    <span>동기화된 DB가 없습니다</span>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {databases.map((db) => (
                      <button
                        key={db.id}
                        onClick={() => loadDbItems(db)}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-800/60 transition-colors ${
                          selectedDb?.id === db.id ? 'bg-indigo-600/20 border-l-2 border-indigo-500' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base flex-shrink-0">🗃️</span>
                          <span className="text-sm text-slate-200 truncate font-medium">{db.title || '(제목 없음)'}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 ml-6">{formatDate(db.synced_at)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Database Items */}
            <div className="flex-1 bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden flex flex-col">
              {!selectedDb ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <span className="text-4xl mb-3">👈</span>
                  <span className="text-sm">왼쪽에서 데이터베이스를 선택하세요</span>
                </div>
              ) : (
                <>
                  <div className="px-6 py-4 border-b border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🗃️</span>
                      <div>
                        <h2 className="text-xl font-bold text-white">{selectedDb.title || '(제목 없음)'}</h2>
                        {selectedDb.description && (
                          <p className="text-sm text-slate-400 mt-0.5">{selectedDb.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      {dbItems.length}개 항목 · 동기화: {formatDate(selectedDb.synced_at)}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4">
                    {dbItemsLoading ? (
                      <div className="flex items-center justify-center h-32">
                        <svg className="w-6 h-6 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </div>
                    ) : dbItems.length === 0 ? (
                      <div className="text-slate-500 text-sm text-center py-8">항목이 없습니다</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {dbItems.map((item) => (
                          <div
                            key={item.id}
                            className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-colors"
                          >
                            {item.cover && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.cover}
                                alt=""
                                className="w-full h-24 object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                            <div className="p-3">
                              <div className="flex items-center gap-2 mb-2">
                                {item.icon && (
                                  <span className="text-base flex-shrink-0">{item.icon}</span>
                                )}
                                <h3 className="font-semibold text-slate-100 truncate">{item.title || '(제목 없음)'}</h3>
                              </div>
                              {/* Properties */}
                              <div className="space-y-1">
                                {Object.entries(item.properties || {})
                                  .slice(0, 4)
                                  .map(([key, value]) => {
                                    const v = value as Record<string, unknown>;
                                    let displayVal = '';
                                    if (v.type === 'select' && v.select) {
                                      displayVal = (v.select as Record<string, string>).name || '';
                                    } else if (v.type === 'multi_select' && Array.isArray(v.multi_select)) {
                                      displayVal = (v.multi_select as Record<string, string>[]).map((s) => s.name).join(', ');
                                    } else if (v.type === 'date' && v.date) {
                                      displayVal = (v.date as Record<string, string>).start || '';
                                    } else if (v.type === 'number' && v.number !== null) {
                                      displayVal = String(v.number);
                                    } else if (v.type === 'checkbox') {
                                      displayVal = v.checkbox ? '✓' : '✗';
                                    } else if (v.type === 'rich_text' && Array.isArray(v.rich_text)) {
                                      displayVal = (v.rich_text as Record<string, unknown>[]).map((t) => (t as Record<string, string>).plain_text || '').join('');
                                    } else if (v.type === 'title' && Array.isArray(v.title)) {
                                      displayVal = (v.title as Record<string, unknown>[]).map((t) => (t as Record<string, string>).plain_text || '').join('');
                                    }
                                    if (!displayVal) return null;
                                    return (
                                      <div key={key} className="flex items-center gap-2 text-xs">
                                        <span className="text-slate-500 truncate max-w-20">{key}</span>
                                        <span className="text-slate-300 truncate">{displayVal}</span>
                                      </div>
                                    );
                                  })}
                              </div>
                              <div className="text-xs text-slate-600 mt-2">{formatDate(item.last_edited_time)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
