'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';

interface UploadResult {
  uploadId: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  notionPageId: string;
  notionUrl: string;
  fileName: string;
}

interface UploadRecord {
  id: string;
  original_name: string;
  file_type: string;
  category: string | null;
  ai_title: string | null;
  summary: string | null;
  tags: string[];
  notion_page_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

const FILE_TYPE_COLOR: Record<string, string> = {
  PDF: 'bg-red-100 text-red-700',
  Word: 'bg-blue-100 text-blue-700',
  Excel: 'bg-green-100 text-green-700',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  processing: '처리 중',
  done: '완료',
  error: '오류',
};

export default function NotionPage() {
  const { companySettings } = useStore();
  const provider = companySettings.globalAIConfig?.provider ?? 'gemini';
  const aiApiKey = companySettings.globalAIConfig?.apiKey ?? '';

  const [connected, setConnected] = useState<boolean | null>(null);
  const [databaseName, setDatabaseName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [history, setHistory] = useState<UploadRecord[]>([]);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkStatus = useCallback(async () => {
    const res = await fetch('/api/notion/status');
    if (res.ok) {
      const data = await res.json();
      setConnected(data.connected);
      setDatabaseName(data.databaseName ?? '');
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/notion/history?limit=20');
    if (res.ok) {
      const data = await res.json();
      setHistory(data.uploads ?? []);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    loadHistory();
  }, [checkStatus, loadHistory]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const allowed = fileArray.filter((f) => {
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
    loadHistory();
  }, [provider, aiApiKey, loadHistory]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div>
          <h1 className="text-lg font-black text-gray-900">📔 Notion 연동</h1>
          <p className="text-sm text-gray-400">파일을 업로드하면 AI가 분석하여 Notion에 자동 저장합니다</p>
        </div>
      </header>

      <div className="p-6 space-y-6 max-w-4xl">
        {/* Connection status */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${connected === true ? 'bg-emerald-400' : connected === false ? 'bg-red-400' : 'bg-gray-300'}`} />
              <div>
                <div className="font-semibold text-gray-800 text-sm">
                  {connected === true ? `연결됨 — ${databaseName}` : connected === false ? 'Notion 미연결' : '연결 확인 중...'}
                </div>
                {connected === false && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    <a href="/dashboard/settings" className="text-indigo-600 underline">설정 &gt; Notion 연동</a>에서 API 키와 DB ID를 입력해주세요.
                  </p>
                )}
              </div>
            </div>
            <button onClick={checkStatus} className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors">
              새로고침
            </button>
          </div>
        </div>

        {/* Upload zone */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
            dragging
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
          } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <div className="text-4xl mb-3">{uploading ? '⏳' : '📁'}</div>
          <p className="font-bold text-gray-700">
            {uploading ? 'AI 분석 중...' : '파일을 드래그하거나 클릭하여 업로드'}
          </p>
          <p className="text-sm text-gray-400 mt-1">PDF · Word(.doc, .docx) · Excel(.xls, .xlsx, .csv) · 최대 20MB</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Latest results */}
        {results.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-bold text-gray-900">최근 분석 결과</h2>
            {results.map((r) => (
              <div key={r.uploadId} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{r.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FILE_TYPE_COLOR[r.notionPageId ? 'PDF' : 'PDF'] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{r.fileName}</p>
                  </div>
                  <a
                    href={r.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Notion에서 보기 →
                  </a>
                </div>
                <p className="text-sm text-gray-600 mb-3">{r.summary}</p>
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.tags.map((tag) => (
                      <span key={tag} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload history */}
        {history.length > 0 && (
          <div>
            <h2 className="font-bold text-gray-900 mb-3">업로드 기록</h2>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">파일명</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">유형</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">제목</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">카테고리</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">상태</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">날짜</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 max-w-[160px] truncate text-gray-700" title={row.original_name}>
                        {row.original_name}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FILE_TYPE_COLOR[row.file_type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {row.file_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[160px] truncate text-gray-700" title={row.ai_title ?? ''}>
                        {row.ai_title ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{row.category ?? '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${
                          row.status === 'done' ? 'text-emerald-600' :
                          row.status === 'error' ? 'text-red-600' :
                          row.status === 'processing' ? 'text-amber-600' : 'text-gray-400'
                        }`}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(row.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3">
                        {row.notion_page_id && (
                          <a
                            href={`https://www.notion.so/${row.notion_page_id.replace(/-/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:underline"
                          >
                            보기
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Guide */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5">
          <h3 className="font-bold text-gray-900 mb-3">💡 Notion DB 준비 방법</h3>
          <ol className="space-y-1.5 text-sm text-gray-700 list-decimal list-inside">
            <li>Notion에서 새 데이터베이스를 생성합니다.</li>
            <li>아래 컬럼을 추가합니다: <span className="font-mono text-xs bg-white px-1 rounded">Name</span>(제목), <span className="font-mono text-xs bg-white px-1 rounded">카테고리</span>(선택), <span className="font-mono text-xs bg-white px-1 rounded">파일명</span>(텍스트), <span className="font-mono text-xs bg-white px-1 rounded">유형</span>(선택), <span className="font-mono text-xs bg-white px-1 rounded">요약</span>(텍스트), <span className="font-mono text-xs bg-white px-1 rounded">태그</span>(다중 선택), <span className="font-mono text-xs bg-white px-1 rounded">날짜</span>(날짜)</li>
            <li>통합(Integration)을 생성하고 데이터베이스에 연결 권한을 부여합니다.</li>
            <li><a href="/dashboard/settings" className="text-indigo-600 underline">설정 &gt; Notion 연동</a>에서 API 키와 DB ID를 입력합니다.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
