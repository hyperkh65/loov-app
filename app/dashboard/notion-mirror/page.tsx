'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncJob {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  result?: { pagesCount?: number; blocksCount?: number; filesCount?: number; errors?: string[] };
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

// ─── Block Renderer (Notion 스타일) ──────────────────────────────────────────

function richTextToJsx(richText: unknown[]): React.ReactNode {
  if (!Array.isArray(richText)) return null;
  return richText.map((t: unknown, i: number) => {
    const token = t as Record<string, unknown>;
    const text = (token.plain_text as string) || '';
    const ann = (token.annotations as Record<string, unknown>) || {};
    const color = (ann.color as string) || 'default';

    const colorMap: Record<string, string> = {
      red: 'text-red-600', blue: 'text-blue-600', green: 'text-green-600',
      yellow: 'text-yellow-600', orange: 'text-orange-500', purple: 'text-purple-600',
      pink: 'text-pink-600', brown: 'text-amber-700', gray: 'text-gray-500',
      red_background: 'bg-red-100', blue_background: 'bg-blue-100',
      green_background: 'bg-green-100', yellow_background: 'bg-yellow-100',
      orange_background: 'bg-orange-100', purple_background: 'bg-purple-100',
      pink_background: 'bg-pink-100', gray_background: 'bg-gray-100',
    };
    const colorClass = color !== 'default' ? (colorMap[color] || '') : '';

    let node: React.ReactNode = text;
    if (ann.code) node = <code key={i} className="bg-[#f1f1ef] text-[#eb5757] font-mono text-[85%] px-1.5 py-0.5 rounded">{node}</code>;
    if (ann.bold) node = <strong key={i} className="font-semibold">{node}</strong>;
    if (ann.italic) node = <em key={i}>{node}</em>;
    if (ann.strikethrough) node = <del key={i}>{node}</del>;
    if (ann.underline) node = <span key={i} className="underline">{node}</span>;
    if (token.href) node = <a key={i} href={token.href as string} className="text-blue-600 underline decoration-blue-300 hover:decoration-blue-600" target="_blank" rel="noopener noreferrer">{node}</a>;
    if (colorClass && !(ann.code)) node = <span key={i} className={colorClass}>{node}</span>;
    return <span key={i}>{node}</span>;
  });
}

const CALLOUT_COLORS: Record<string, { bg: string; border: string }> = {
  blue_background:   { bg: 'bg-blue-50',   border: 'border-blue-100' },
  yellow_background: { bg: 'bg-yellow-50', border: 'border-yellow-100' },
  green_background:  { bg: 'bg-green-50',  border: 'border-green-100' },
  red_background:    { bg: 'bg-red-50',    border: 'border-red-100' },
  purple_background: { bg: 'bg-purple-50', border: 'border-purple-100' },
  orange_background: { bg: 'bg-orange-50', border: 'border-orange-100' },
  pink_background:   { bg: 'bg-pink-50',   border: 'border-pink-100' },
  gray_background:   { bg: 'bg-gray-100',  border: 'border-gray-200' },
  default:           { bg: 'bg-gray-100',  border: 'border-gray-200' },
};

function BlockRenderer({ block, listIndex = 0 }: { block: NotionBlock; listIndex?: number }) {
  const { type, content, depth } = block;
  const data = content as Record<string, unknown>;
  const rt = (data.rich_text as unknown[]) || [];
  const indentPx = depth > 0 ? depth * 24 : 0;
  const textCls = 'text-[#37352f] text-[15px] leading-[1.75]';

  switch (type) {
    case 'paragraph': {
      const inner = richTextToJsx(rt);
      return (
        <p style={{ paddingLeft: indentPx }} className={`${textCls} my-[2px] min-h-[1.75em]`}>
          {inner || <span>&#8203;</span>}
        </p>
      );
    }
    case 'heading_1':
      return (
        <h1 style={{ paddingLeft: indentPx }} className="text-[1.875rem] font-bold text-[#37352f] mt-[1.4em] mb-1 leading-tight">
          {richTextToJsx(rt)}
        </h1>
      );
    case 'heading_2':
      return (
        <h2 style={{ paddingLeft: indentPx }} className="text-[1.5rem] font-bold text-[#37352f] mt-[1.1em] mb-1 leading-tight border-b border-[#e9e9e7] pb-1">
          {richTextToJsx(rt)}
        </h2>
      );
    case 'heading_3':
      return (
        <h3 style={{ paddingLeft: indentPx }} className="text-[1.25rem] font-semibold text-[#37352f] mt-[0.8em] mb-0.5 leading-tight">
          {richTextToJsx(rt)}
        </h3>
      );
    case 'bulleted_list_item':
      return (
        <div style={{ paddingLeft: indentPx + 24 }} className={`${textCls} relative my-[2px]`}>
          <span className="absolute text-[#9b9b9b]" style={{ left: indentPx + 4, top: '0.15em', fontSize: '1.2em' }}>•</span>
          {richTextToJsx(rt)}
        </div>
      );
    case 'numbered_list_item':
      return (
        <div style={{ paddingLeft: indentPx + 28 }} className={`${textCls} relative my-[2px]`}>
          <span className="absolute text-[#37352f] text-[14px]" style={{ left: indentPx, top: '1px', minWidth: 24, textAlign: 'right' }}>
            {listIndex}.
          </span>
          {richTextToJsx(rt)}
        </div>
      );
    case 'to_do': {
      const checked = data.checked as boolean;
      return (
        <div style={{ paddingLeft: indentPx }} className={`flex items-start gap-2 ${textCls} my-[2px]`}>
          <div className={`mt-[3px] w-[18px] h-[18px] rounded-sm border-2 flex-shrink-0 flex items-center justify-center ${
            checked ? 'bg-[#2383e2] border-[#2383e2]' : 'border-[#d3d3d3]'
          }`}>
            {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <span className={checked ? 'line-through text-[#9b9b9b]' : ''}>{richTextToJsx(rt)}</span>
        </div>
      );
    }
    case 'quote':
      return (
        <blockquote style={{ paddingLeft: indentPx + 16 }} className={`${textCls} border-l-[3px] border-[#37352f] pl-4 my-1`}>
          {richTextToJsx(rt)}
        </blockquote>
      );
    case 'code': {
      const lang = (data.language as string) || '';
      const codeText = (rt as unknown[]).map((t: unknown) => ((t as Record<string, unknown>).plain_text as string) || '').join('');
      return (
        <div className="my-3 rounded-sm overflow-hidden border border-[#e9e9e7]">
          {lang && <div className="bg-[#f7f6f3] text-[#9b9b9b] text-[11px] font-mono px-4 py-1.5 border-b border-[#e9e9e7]">{lang}</div>}
          <pre className="bg-[#f7f6f3] px-5 py-4 overflow-x-auto text-[13px] font-mono text-[#37352f] leading-relaxed whitespace-pre-wrap">
            <code>{codeText}</code>
          </pre>
        </div>
      );
    }
    case 'callout': {
      const icon = data.icon as Record<string, unknown>;
      const emoji = icon?.type === 'emoji' ? (icon.emoji as string) : '💡';
      const color = (data.color as string) || 'gray_background';
      const cc = CALLOUT_COLORS[color] || CALLOUT_COLORS.default;
      return (
        <div className={`flex gap-3 rounded-md border p-4 my-2 ${cc.bg} ${cc.border}`}>
          <span className="text-xl flex-shrink-0 leading-[1.75]">{emoji}</span>
          <span className={`${textCls} flex-1`}>{richTextToJsx(rt)}</span>
        </div>
      );
    }
    case 'divider':
      return <hr className="border-[#e9e9e7] my-6" />;
    case 'image': {
      const url = data.type === 'external'
        ? (data.external as Record<string, string>)?.url
        : (data.file as Record<string, string>)?.url;
      const caption = richTextToJsx((data.caption as unknown[]) || []);
      return (
        <figure className="my-4">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="max-w-full rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          )}
          {(data.caption as unknown[])?.length > 0 && (
            <figcaption className="text-[12px] text-[#9b9b9b] mt-1.5 text-center">{caption}</figcaption>
          )}
        </figure>
      );
    }
    case 'video': {
      const url = data.type === 'external'
        ? (data.external as Record<string, string>)?.url
        : (data.file as Record<string, string>)?.url;
      if (!url) return null;
      const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
      if (isYoutube) {
        const vid = url.includes('youtu.be') ? url.split('/').pop()?.split('?')[0] : new URL(url).searchParams.get('v');
        return (
          <div className="my-4 aspect-video">
            <iframe src={`https://www.youtube.com/embed/${vid}`} className="w-full h-full rounded-sm" allowFullScreen />
          </div>
        );
      }
      return (
        <div className="my-4"><video src={url} controls className="max-w-full rounded-sm" /></div>
      );
    }
    case 'file': {
      const url = data.type === 'external'
        ? (data.external as Record<string, string>)?.url
        : (data.file as Record<string, string>)?.url;
      const caption = richTextToJsx((data.caption as unknown[]) || []);
      return (
        <div className="my-2">
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[14px] text-[#37352f] hover:bg-[#f1f1ef] rounded px-2 py-1 transition-colors border border-[#e9e9e7]">
            <span>📎</span><span className="underline">{caption || '파일'}</span>
          </a>
        </div>
      );
    }
    case 'embed': {
      const url = data.url as string;
      return (
        <div className="my-3 border border-[#e9e9e7] rounded-sm p-3 text-[13px] text-[#9b9b9b] flex items-center gap-2">
          <span>🔗</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate">{url}</a>
        </div>
      );
    }
    case 'bookmark': {
      const url = (data.url as string) || '';
      return (
        <div className="my-2 border border-[#e9e9e7] rounded-sm hover:bg-[#f7f6f3] transition-colors">
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3">
            <span>🔖</span>
            <span className="text-[14px] text-blue-600 underline truncate">{url}</span>
          </a>
        </div>
      );
    }
    case 'toggle': {
      const inner = richTextToJsx(rt);
      return (
        <details className="my-1 group" style={{ paddingLeft: indentPx }}>
          <summary className={`cursor-pointer ${textCls} flex items-center gap-1.5 hover:bg-[#f1f1ef] rounded px-1 py-0.5 -mx-1 list-none`}>
            <span className="text-[#9b9b9b] text-xs transition-transform group-open:rotate-90 inline-block">▶</span>
            {inner}
          </summary>
          <div className="ml-5 mt-1 border-l border-[#e9e9e7] pl-3 text-[14px] text-[#9b9b9b]">
            (하위 블록 내용은 동기화 후 표시됩니다)
          </div>
        </details>
      );
    }
    case 'table_of_contents':
      return <div className="my-2 text-[13px] text-[#9b9b9b] border border-[#e9e9e7] rounded-sm px-3 py-2">📑 목차</div>;
    case 'child_database': {
      const title = (data.title as string) || 'Database';
      return (
        <div className="my-2 flex items-center gap-2 border border-[#e9e9e7] rounded-sm px-3 py-2.5 hover:bg-[#f7f6f3] transition-colors">
          <span>🗃️</span>
          <span className="text-[14px] font-medium text-[#37352f]">{title}</span>
          <span className="text-[11px] text-[#9b9b9b] bg-[#f1f1ef] px-2 py-0.5 rounded ml-auto">데이터베이스</span>
        </div>
      );
    }
    case 'child_page': {
      const title = (data.title as string) || 'Page';
      return (
        <div className="my-1 flex items-center gap-2 hover:bg-[#f1f1ef] rounded px-1 py-0.5 -mx-1 cursor-pointer">
          <span className="text-base">📄</span>
          <span className="text-[14px] text-[#37352f]">{title}</span>
        </div>
      );
    }
    default:
      return null;
  }
}

function renderBlocks(blocks: NotionBlock[]): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let olCount = 0;
  for (const block of blocks) {
    if (block.type === 'numbered_list_item') { olCount++; } else { olCount = 0; }
    result.push(<BlockRenderer key={block.id} block={block} listIndex={olCount} />);
  }
  return result;
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

                {currentJob.status === 'done' && currentJob.result?.errors && currentJob.result.errors.length > 0 && (
                  <details className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                    <summary className="text-xs font-semibold text-yellow-400 cursor-pointer">
                      ⚠️ 일부 항목 오류 ({currentJob.result.errors.length}건) — 클릭해서 보기
                    </summary>
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {currentJob.result.errors.map((err, i) => (
                        <div key={i} className="text-xs text-yellow-300 font-mono break-all border-b border-yellow-500/10 pb-1">{err}</div>
                      ))}
                    </div>
                  </details>
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

            {/* Page Detail - Notion 스타일 화이트 뷰어 */}
            <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
              {!selectedPage ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <span className="text-5xl mb-4">📄</span>
                  <span className="text-sm font-medium text-gray-500">왼쪽에서 페이지를 선택하세요</span>
                </div>
              ) : (
                <>
                  {/* 툴바 */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-[#fafafa]">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span>수정: {formatDate(selectedPage.last_edited_time)}</span>
                      <span>·</span>
                      <span>동기화: {formatDate(selectedPage.synced_at)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setViewMode('render')}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'render' ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                        미리보기
                      </button>
                      <button onClick={() => setViewMode('markdown')}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'markdown' ? 'bg-gray-200 text-gray-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                        Markdown
                      </button>
                      {selectedPage.url && (
                        <a href={selectedPage.url} target="_blank" rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded text-xs font-medium text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          Notion
                        </a>
                      )}
                    </div>
                  </div>

                  {/* 페이지 본문 */}
                  <div className="flex-1 overflow-y-auto">
                    {pageDetailLoading ? (
                      <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <svg className="w-6 h-6 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <span className="text-sm text-gray-400">로딩 중...</span>
                      </div>
                    ) : viewMode === 'markdown' ? (
                      <div className="p-8">
                        <pre className="text-[13px] text-gray-700 font-mono whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-4 border border-gray-100">{pageMarkdown || '(마크다운 없음)'}</pre>
                      </div>
                    ) : (
                      <div>
                        {/* 커버 이미지 */}
                        {selectedPage.cover && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={selectedPage.cover} alt="cover"
                            className="w-full h-[200px] object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}

                        {/* 아이콘 + 제목 */}
                        <div className="px-12 pt-8 pb-2 max-w-[900px] mx-auto">
                          {selectedPage.icon && (
                            <div className={`text-5xl mb-3 ${selectedPage.cover ? '-mt-8' : ''}`}>
                              {selectedPage.icon.startsWith('http') ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={selectedPage.icon} alt="" className="w-12 h-12 rounded" />
                              ) : selectedPage.icon}
                            </div>
                          )}
                          <h1 className="text-[2.5rem] font-bold text-[#37352f] leading-tight tracking-tight mb-6">
                            {selectedPage.title || '(제목 없음)'}
                          </h1>
                        </div>

                        {/* 블록 콘텐츠 */}
                        {pageBlocks.length === 0 ? (
                          <div className="px-12 pb-8 text-gray-400 text-sm max-w-[900px] mx-auto">내용이 없습니다</div>
                        ) : (
                          <div className="px-12 pb-16 max-w-[900px] mx-auto">
                            {renderBlocks(pageBlocks)}
                          </div>
                        )}
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
