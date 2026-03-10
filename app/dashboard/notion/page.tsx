'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';

interface UploadResult {
  uploadId: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  fileUrl: string;
  fileType: string;
  notionUrl: string;
  fileName: string;
}

interface UploadRecord {
  id: string;
  original_name: string;
  file_type: string;
  file_size: number | null;
  file_url: string | null;
  category: string | null;
  ai_title: string | null;
  summary: string | null;
  tags: string[];
  notion_page_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

const FILE_TYPE_BADGE: Record<string, string> = {
  PDF:   'bg-red-100 text-red-700 border-red-200',
  Word:  'bg-blue-100 text-blue-700 border-blue-200',
  Excel: 'bg-green-100 text-green-700 border-green-200',
};

const FILE_TYPE_ICON: Record<string, string> = {
  PDF: '📄', Word: '📝', Excel: '📊',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:    { label: '대기',    color: 'text-gray-400' },
  processing: { label: '처리 중', color: 'text-amber-500' },
  done:       { label: '완료',    color: 'text-emerald-600' },
  error:      { label: '오류',    color: 'text-red-500' },
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function NotionPage() {
  const { companySettings } = useStore();
  const provider = companySettings.globalAIConfig?.provider ?? 'gemini';
  const aiApiKey = companySettings.globalAIConfig?.apiKey ?? '';

  const [tab, setTab] = useState<'upload' | 'db'>('upload');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [databaseName, setDatabaseName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState('');
  const [results, setResults] = useState<UploadResult[]>([]);
  const [history, setHistory] = useState<UploadRecord[]>([]);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // DB viewer filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkStatus = useCallback(async () => {
    const res = await fetch('/api/notion/status');
    if (res.ok) {
      const data = await res.json();
      setConnected(data.connected);
      setDatabaseName(data.databaseName ?? '');
    }
  }, []);

  const loadHistory = useCallback(async (q?: { search?: string; type?: string; status?: string }) => {
    const params = new URLSearchParams({ limit: '100' });
    if (q?.search) params.set('search', q.search);
    if (q?.type)   params.set('type', q.type);
    if (q?.status) params.set('status', q.status);
    const res = await fetch(`/api/notion/history?${params}`);
    if (res.ok) {
      const data = await res.json();
      setHistory(data.uploads ?? []);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    loadHistory();
  }, [checkStatus, loadHistory]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadHistory({ search, type: filterType, status: filterStatus });
    }, 300);
  }, [search, filterType, filterStatus, loadHistory]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const allowed = Array.from(files).filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv'].includes(ext);
    });
    if (allowed.length === 0) {
      setError('PDF, Word(.doc/.docx), Excel(.xls/.xlsx/.csv) 파일만 지원합니다.');
      return;
    }
    setUploading(true);
    setError('');

    for (const file of allowed) {
      setUploadingFile(file.name);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('provider', provider);
      fd.append('aiApiKey', aiApiKey);
      try {
        const res = await fetch('/api/notion/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? '업로드 실패');
        } else {
          setResults((prev) => [{ ...data, fileName: file.name }, ...prev]);
        }
      } catch {
        setError('네트워크 오류가 발생했습니다.');
      }
    }

    setUploading(false);
    setUploadingFile('');
    loadHistory({ search, type: filterType, status: filterStatus });
  }, [provider, aiApiKey, loadHistory, search, filterType, filterStatus]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const totalFiles = history.length;
  const doneFiles  = history.filter((h) => h.status === 'done').length;

  return (
    <div className="min-h-full">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">📔 Notion 파일 연동</h1>
            <p className="text-sm text-gray-400">파일 업로드 → AI 분석 → Notion + Storage 자동 저장</p>
          </div>
          {/* Connection badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border ${
            connected === true  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
            connected === false ? 'bg-red-50 border-red-200 text-red-600' :
                                  'bg-gray-50 border-gray-200 text-gray-500'
          }`}>
            <div className={`w-2 h-2 rounded-full ${connected === true ? 'bg-emerald-400' : connected === false ? 'bg-red-400' : 'bg-gray-300'}`} />
            {connected === true ? databaseName || 'Notion 연결됨' : connected === false ? '미연결' : '확인 중...'}
          </div>
        </div>

        {/* Stats bar */}
        {totalFiles > 0 && (
          <div className="mt-3 flex gap-4 text-xs text-gray-500">
            <span>전체 <strong className="text-gray-800">{totalFiles}</strong>개</span>
            <span>완료 <strong className="text-emerald-600">{doneFiles}</strong>개</span>
            <span>오류 <strong className="text-red-500">{history.filter((h) => h.status === 'error').length}</strong>개</span>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex gap-0">
          {([['upload', '⬆️ 업로드'], ['db', '🗂️ 파일 DB']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === v ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {l}
              {v === 'db' && totalFiles > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{totalFiles}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Upload Tab ─── */}
      {tab === 'upload' && (
        <div className="p-6 space-y-6 max-w-3xl">
          {connected === false && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              ⚠️ <a href="/dashboard/settings" className="font-bold underline">설정 &gt; Notion 연동</a>에서 API 키와 DB ID를 먼저 입력해주세요.
            </div>
          )}

          {/* Drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-14 text-center transition-all ${
              dragging
                ? 'border-indigo-400 bg-indigo-50'
                : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
            } ${uploading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
          >
            <input
              ref={fileInputRef}
              type="file" multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
            <div className="text-5xl mb-4">{uploading ? '⏳' : '📁'}</div>
            {uploading ? (
              <>
                <p className="font-bold text-gray-700">AI 분석 중...</p>
                <p className="text-sm text-indigo-500 mt-1 truncate max-w-xs mx-auto">{uploadingFile}</p>
                <div className="mt-4 w-48 h-1.5 bg-gray-200 rounded-full mx-auto overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full animate-pulse w-2/3" />
                </div>
              </>
            ) : (
              <>
                <p className="font-bold text-gray-700 text-lg">파일을 드래그하거나 클릭하여 업로드</p>
                <p className="text-sm text-gray-400 mt-1.5">PDF · Word(.doc, .docx) · Excel(.xls, .xlsx, .csv)</p>
                <p className="text-xs text-gray-300 mt-1">최대 20MB · 여러 파일 동시 가능</p>
              </>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
              <span className="flex-shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Pipeline steps */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { icon: '📁', label: '파일 업로드', desc: 'Supabase Storage 저장' },
              { icon: '🤖', label: 'AI 분류', desc: '제목·카테고리·요약·태그' },
              { icon: '📔', label: 'Notion 저장', desc: 'DB 행 + 원문 + 파일 링크' },
              { icon: '🗂️', label: 'DB 기록', desc: '웹에서 검색·다운로드' },
            ].map((step) => (
              <div key={step.label} className="bg-white border border-gray-100 rounded-xl p-3 text-center">
                <div className="text-2xl mb-1">{step.icon}</div>
                <div className="text-xs font-bold text-gray-700">{step.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{step.desc}</div>
              </div>
            ))}
          </div>

          {/* Recent results */}
          {results.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-bold text-gray-900">방금 분석한 파일</h2>
              {results.map((r) => (
                <div key={r.uploadId} className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg">{FILE_TYPE_ICON[r.fileType] ?? '📄'}</span>
                        <span className="font-bold text-gray-900">{r.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${FILE_TYPE_BADGE[r.fileType] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {r.category}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{r.fileName}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {r.fileUrl && (
                        <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" download
                          className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                          ⬇️ 다운로드
                        </a>
                      )}
                      <a href={r.notionUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors">
                        📔 Notion →
                      </a>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-3 leading-relaxed">{r.summary}</p>
                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── DB Viewer Tab ─── */}
      {tab === 'db' && (
        <div className="p-6 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="파일명, 제목, 카테고리 검색..."
                className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white"
            >
              <option value="">전체 유형</option>
              <option value="PDF">📄 PDF</option>
              <option value="Word">📝 Word</option>
              <option value="Excel">📊 Excel</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white"
            >
              <option value="">전체 상태</option>
              <option value="done">완료</option>
              <option value="processing">처리 중</option>
              <option value="error">오류</option>
            </select>
            <button
              onClick={() => loadHistory({ search, type: filterType, status: filterStatus })}
              className="text-sm border border-gray-200 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
            >
              새로고침
            </button>
          </div>

          {/* File list */}
          {history.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
              <div className="text-4xl mb-3">🗂️</div>
              <p className="text-gray-500 font-medium">파일이 없습니다</p>
              <p className="text-sm text-gray-400 mt-1">업로드 탭에서 파일을 추가하세요.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((row) => {
                const isExpanded = expandedId === row.id;
                const statusCfg = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.pending;
                return (
                  <div key={row.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    {/* Row */}
                    <div
                      className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    >
                      {/* Icon */}
                      <div className="text-2xl flex-shrink-0">{FILE_TYPE_ICON[row.file_type] ?? '📄'}</div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">
                            {row.ai_title || row.original_name}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${FILE_TYPE_BADGE[row.file_type] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {row.file_type}
                          </span>
                          {row.category && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {row.category}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-gray-400 truncate">{row.original_name}</span>
                          <span className="text-xs text-gray-300">{formatBytes(row.file_size)}</span>
                          <span className="text-xs text-gray-300">{new Date(row.created_at).toLocaleDateString('ko-KR')}</span>
                        </div>
                      </div>

                      {/* Status + Actions */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-xs font-semibold ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                        {row.file_url && (
                          <a
                            href={row.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs border border-gray-200 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            ⬇️ 다운로드
                          </a>
                        )}
                        {row.notion_page_id && (
                          <a
                            href={`https://www.notion.so/${row.notion_page_id.replace(/-/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs border border-indigo-200 text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                          >
                            📔 Notion
                          </a>
                        )}
                        <span className="text-gray-300 text-sm">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-gray-50 pt-4 space-y-3">
                        {row.summary && (
                          <div>
                            <div className="text-xs font-semibold text-gray-500 mb-1">AI 요약</div>
                            <p className="text-sm text-gray-700 leading-relaxed">{row.summary}</p>
                          </div>
                        )}
                        {row.tags?.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-gray-500 mb-1">태그</div>
                            <div className="flex flex-wrap gap-1.5">
                              {row.tags.map((tag) => (
                                <span key={tag} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {row.error_message && (
                          <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600">
                            {row.error_message}
                          </div>
                        )}
                        {row.file_url && (
                          <div>
                            <div className="text-xs font-semibold text-gray-500 mb-1">파일 URL</div>
                            <div className="flex items-center gap-2">
                              <input
                                readOnly
                                value={row.file_url}
                                className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 font-mono text-gray-600"
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                              />
                              <button
                                onClick={() => navigator.clipboard.writeText(row.file_url!)}
                                className="text-xs border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                복사
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
