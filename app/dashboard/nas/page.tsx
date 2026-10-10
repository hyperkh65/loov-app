'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface NasFile {
  name: string;
  isDir: boolean;
  size: number;
  modTime: number;
}

const ROOT = '/volume1/homes/urjent/loov';

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function formatDate(ts: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getFileIcon(name: string, isDir: boolean): string {
  if (isDir) return '📁';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return '🎬';
  if (['mp3', 'wav', 'aac', 'flac'].includes(ext)) return '🎵';
  if (['pdf'].includes(ext)) return '📄';
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return '📦';
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'sh', 'json', 'yaml', 'yml'].includes(ext)) return '💻';
  if (['txt', 'md', 'csv', 'log'].includes(ext)) return '📝';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊';
  if (['docx', 'doc'].includes(ext)) return '📃';
  return '📄';
}

export default function NasPage() {
  const [path, setPath] = useState(ROOT);
  const [files, setFiles] = useState<NasFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 폴더 만들기
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  // 이름 바꾸기
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  // 업로드
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const loadFiles = useCallback(async (p: string) => {
    setLoading(true);
    setError('');
    setSelected(new Set());
    try {
      const res = await fetch(`/api/nas/files?path=${encodeURIComponent(p)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setFiles(data.files || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles(path);
  }, [path, loadFiles]);

  // 경로 이동
  const navigate = (dir: string) => {
    const newPath = path.replace(/\/$/, '') + '/' + dir;
    setPath(newPath);
  };

  // 상위 폴더
  const goUp = () => {
    if (path === ROOT) return;
    const parent = path.substring(0, path.lastIndexOf('/')) || ROOT;
    setPath(parent.startsWith(ROOT) ? parent : ROOT);
  };

  // 경로 빵조각 (breadcrumb)
  const breadcrumbs = (): { label: string; path: string }[] => {
    const parts = path.replace(ROOT, '').split('/').filter(Boolean);
    const crumbs = [{ label: '🏠 NAS', path: ROOT }];
    let cur = ROOT;
    for (const p of parts) {
      cur = cur + '/' + p;
      crumbs.push({ label: p, path: cur });
    }
    return crumbs;
  };

  // 폴더 생성
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/nas/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path + '/' + newFolderName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewFolderName('');
      setShowNewFolder(false);
      loadFiles(path);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '폴더 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  // 삭제
  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택된 ${selected.size}개 항목을 삭제하시겠습니까?`)) return;
    for (const name of selected) {
      const file = files.find(f => f.name === name);
      if (!file) continue;
      try {
        await fetch('/api/nas/folder', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: path + '/' + name, isDir: file.isDir }),
        });
      } catch { /* ignore */ }
    }
    setSelected(new Set());
    loadFiles(path);
  };

  // 이름 변경
  const startRename = (name: string) => {
    setRenaming(name);
    setRenameVal(name);
  };

  const doRename = async () => {
    if (!renaming || !renameVal.trim() || renameVal === renaming) {
      setRenaming(null);
      return;
    }
    try {
      const res = await fetch('/api/nas/folder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPath: path + '/' + renaming,
          newPath: path + '/' + renameVal.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRenaming(null);
      loadFiles(path);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '이름 변경 실패');
    }
  };

  // 다운로드
  const download = (name: string) => {
    const filePath = path + '/' + name;
    window.open(`/api/nas/download?path=${encodeURIComponent(filePath)}`, '_blank');
  };

  // 업로드
  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const form = new FormData();
    form.append('dir', path);
    for (const f of fileList) form.append('files', f);
    setUploadProgress(`업로드 중... (${fileList.length}개)`);
    try {
      const res = await fetch('/api/nas/upload', { method: 'POST', body: form });
      const data = await res.json();
      const ok = (data.results || []).filter((r: { ok: boolean }) => r.ok).length;
      setUploadProgress(`✅ ${ok}/${fileList.length}개 완료`);
      loadFiles(path);
      setTimeout(() => setUploadProgress(''), 3000);
    } catch {
      setUploadProgress('❌ 업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
          🖥️ <span>시놀로지 NAS</span>
          <span className="text-xs text-gray-400 font-normal">(loov 폴더)</span>
        </h1>
        <div className="h-4 w-px bg-gray-200" />
        {/* breadcrumb */}
        <div className="flex items-center gap-1 text-sm flex-wrap">
          {breadcrumbs().map((bc, i) => (
            <span key={bc.path} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300">/</span>}
              <button
                onClick={() => setPath(bc.path)}
                className={`px-2 py-0.5 rounded-lg hover:bg-gray-100 transition-colors ${
                  bc.path === path ? 'font-semibold text-blue-600 bg-blue-50' : 'text-gray-600'
                }`}
              >
                {bc.label}
              </button>
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => loadFiles(path)} disabled={loading}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50">
            🔄
          </button>
          <button onClick={() => setShowNewFolder(true)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-medium">
            + 폴더
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="px-3 py-1.5 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg font-medium disabled:opacity-50">
            ⬆ 업로드
          </button>
          {selected.size > 0 && (
            <button onClick={deleteSelected}
              className="px-3 py-1.5 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium">
              🗑 삭제 ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex justify-between">
          <span>❌ {error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* 폴더 만들기 */}
      {showNewFolder && (
        <div className="mx-4 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2">
          <span className="text-sm font-medium text-blue-700">📁 새 폴더:</span>
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
            placeholder="폴더 이름 입력..."
            className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
          <button onClick={createFolder} disabled={creating}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {creating ? '생성중...' : '만들기'}
          </button>
          <button onClick={() => setShowNewFolder(false)}
            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">취소</button>
        </div>
      )}

      {/* 업로드 progress */}
      {uploadProgress && (
        <div className="mx-4 mt-3 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
          {uploadProgress}
        </div>
      )}

      {/* 파일 목록 */}
      <div
        className={`flex-1 overflow-auto px-4 py-3 ${dragOver ? 'bg-blue-50' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
      >
        {dragOver && (
          <div className="border-2 border-dashed border-blue-400 rounded-xl p-8 text-center text-blue-500 font-semibold mb-3">
            ⬆ 여기에 파일을 드롭하세요
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <div className="text-center">
              <div className="text-3xl mb-2">⏳</div>
              <p>로딩중...</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {/* 상위 폴더 */}
            {path !== ROOT && (
              <button onClick={goUp}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 text-gray-500 text-sm">
                <span className="text-base">⬆️</span>
                <span className="font-medium">..</span>
                <span className="text-gray-400 text-xs ml-auto">상위 폴더</span>
              </button>
            )}

            {files.length === 0 && (
              <div className="py-16 text-center text-gray-400">
                <div className="text-4xl mb-2">📂</div>
                <p>폴더가 비어 있습니다</p>
                <p className="text-xs mt-1">파일을 드래그하거나 업로드 버튼을 눌러주세요</p>
              </div>
            )}

            {files.map((f, i) => (
              <div
                key={f.name}
                className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${
                  selected.has(f.name) ? 'bg-blue-50' : ''
                }`}
              >
                {/* 체크박스 */}
                <input
                  type="checkbox"
                  checked={selected.has(f.name)}
                  onChange={() => toggleSelect(f.name)}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 accent-blue-600 cursor-pointer flex-shrink-0"
                />

                {/* 아이콘 */}
                <span className="text-xl flex-shrink-0">{getFileIcon(f.name, f.isDir)}</span>

                {/* 이름 */}
                <div className="flex-1 min-w-0">
                  {renaming === f.name ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onBlur={doRename}
                      onKeyDown={e => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenaming(null); }}
                      className="w-full border border-blue-400 rounded-lg px-2 py-0.5 text-sm focus:outline-none"
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <button
                      className="text-sm font-medium text-gray-900 hover:text-blue-600 text-left truncate max-w-full block"
                      onClick={() => f.isDir ? navigate(f.name) : void 0}
                    >
                      {f.name}
                    </button>
                  )}
                </div>

                {/* 크기 */}
                <span className="text-xs text-gray-400 w-20 text-right flex-shrink-0">
                  {f.isDir ? '' : formatSize(f.size)}
                </span>

                {/* 날짜 */}
                <span className="text-xs text-gray-400 w-28 text-right flex-shrink-0 hidden md:block">
                  {formatDate(f.modTime)}
                </span>

                {/* 액션 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!f.isDir && (
                    <button
                      onClick={() => download(f.name)}
                      title="다운로드"
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm">
                      ⬇
                    </button>
                  )}
                  <button
                    onClick={() => startRename(f.name)}
                    title="이름 변경"
                    className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors text-sm">
                    ✏️
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`"${f.name}" 을(를) 삭제하시겠습니까?`)) return;
                      await fetch('/api/nas/folder', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: path + '/' + f.name, isDir: f.isDir }),
                      });
                      loadFiles(path);
                    }}
                    title="삭제"
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm">
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 상태 바 */}
      <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between text-xs text-gray-500">
        <span>{files.length}개 항목 {selected.size > 0 && `· ${selected.size}개 선택됨`}</span>
        <span className="text-gray-400">{path}</span>
      </div>

      {/* 숨김 파일 input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => uploadFiles(e.target.files)}
      />
    </div>
  );
}
