'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const PIN = '0506';
const CHUNK_SIZE = 20 * 1024 * 1024; // 20MB 청크

interface VideoFile {
  name: string;
  size: number;
  modTime: number;
}

function fmtSize(b: number) {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(0) + ' MB';
  return (b / 1e3).toFixed(0) + ' KB';
}

function fmtDate(ts: number) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function fmtExt(name: string) {
  return (name.split('.').pop() || '').toUpperCase();
}

// ── PIN 패드 ──────────────────────────────────────────────
function PinPad({ onSuccess }: { onSuccess: () => void }) {
  const [digits, setDigits] = useState('');
  const [shake, setShake] = useState(false);

  const press = (d: string) => {
    if (d === '⌫') { setDigits(p => p.slice(0, -1)); return; }
    const next = digits + d;
    if (next.length > 4) return;
    setDigits(next);
    if (next.length === 4) {
      if (next === PIN) {
        sessionStorage.setItem('videoPin', PIN);
        onSuccess();
      } else {
        setShake(true);
        setTimeout(() => { setDigits(''); setShake(false); }, 600);
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] select-none">
      <div className="text-6xl mb-6">🎬</div>
      <h1 className="text-white text-2xl font-bold mb-1">동영상 보관함</h1>
      <p className="text-gray-500 text-sm mb-10">비밀번호를 입력하세요</p>

      {/* 도트 */}
      <div className={`flex gap-5 mb-10 transition-all ${shake ? 'animate-bounce' : ''}`}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
            digits.length > i
              ? shake ? 'bg-red-500 border-red-500' : 'bg-white border-white scale-110'
              : 'border-gray-600'
          }`} />
        ))}
      </div>

      {/* 키패드 */}
      <div className="grid grid-cols-3 gap-4">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
          <button key={i}
            onClick={() => d !== '' && press(d)}
            disabled={d === ''}
            className={`w-20 h-20 rounded-full text-2xl font-semibold transition-all active:scale-95 ${
              d === '' ? 'invisible' :
              d === '⌫' ? 'text-gray-400 hover:bg-white/10 active:bg-white/20' :
              'text-white bg-white/10 hover:bg-white/20 active:bg-white/30'
            }`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────
export default function VideosPage() {
  const [authed, setAuthed] = useState(false);
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState<VideoFile | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number; speed: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem('videoPin') === PIN) setAuthed(true);
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/videos/list', { headers: { 'x-video-pin': PIN } });
      if (r.ok) setFiles((await r.json()).files || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (authed) loadFiles(); }, [authed, loadFiles]);

  const handleUpload = async (file: File) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let startTime = Date.now();
    let uploadedBytes = 0;

    setUploadProgress({ name: file.name, pct: 0, speed: '...' });

    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const form = new FormData();
        form.append('chunk', chunk);
        form.append('filename', file.name);
        form.append('chunkIndex', String(i));
        form.append('totalChunks', String(totalChunks));
        form.append('pin', PIN);

        const chunkStart = Date.now();
        const r = await fetch('/api/videos/upload', { method: 'POST', body: form });
        if (!r.ok) throw new Error(await r.text());

        uploadedBytes += (end - start);
        const elapsed = (Date.now() - chunkStart) / 1000;
        const speed = elapsed > 0 ? `${((end - start) / elapsed / 1024 / 1024).toFixed(1)} MB/s` : '';
        const pct = Math.round(((i + 1) / totalChunks) * 100);
        setUploadProgress({ name: file.name, pct, speed });
      }
      void (startTime + uploadedBytes); // suppress unused warning
      await loadFiles();
    } catch (e) {
      alert('업로드 실패: ' + String(e));
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const doDelete = async (name: string) => {
    await fetch('/api/videos/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: name, pin: PIN }),
    });
    setConfirmDelete(null);
    await loadFiles();
  };

  const streamUrl = (name: string) =>
    `/api/videos/stream?file=${encodeURIComponent(name)}&pin=${PIN}`;

  if (!authed) {
    return (
      <div className="bg-gray-950 min-h-screen text-white">
        <PinPad onSuccess={() => setAuthed(true)} />
      </div>
    );
  }

  return (
    <div className="bg-gray-950 min-h-screen text-white p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">🎬 동영상 보관함</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {files.length}개 · NAS USB ({'/volumeUSB1/usbshare/videos'})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadFiles()}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10">
            ↺
          </button>
          <button
            onClick={() => { setAuthed(false); sessionStorage.removeItem('videoPin'); }}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10"
            title="잠금">
            🔒
          </button>
          <label className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-4 py-2 rounded-xl cursor-pointer font-semibold text-sm transition-all">
            ↑ 업로드
            <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          </label>
        </div>
      </div>

      {/* 업로드 진행 */}
      {uploadProgress && (
        <div className="mb-6 bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-sm text-gray-300 truncate max-w-xs">{uploadProgress.name}</span>
            </div>
            <div className="text-right">
              <span className="text-blue-400 font-bold">{uploadProgress.pct}%</span>
              {uploadProgress.speed && (
                <span className="text-gray-500 text-xs ml-2">{uploadProgress.speed}</span>
              )}
            </div>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-2 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress.pct}%` }}
            />
          </div>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="text-4xl animate-spin">⏳</div>
        </div>
      )}

      {/* 비어있음 */}
      {!loading && files.length === 0 && (
        <div className="text-center py-24">
          <div className="text-7xl mb-4">🎬</div>
          <p className="text-gray-400 text-lg">동영상이 없습니다</p>
          <p className="text-gray-600 text-sm mt-1">업로드 버튼으로 파일을 추가하세요</p>
        </div>
      )}

      {/* 동영상 그리드 */}
      {!loading && files.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {files.map(f => (
            <div key={f.name}
              onClick={() => setPlaying(f)}
              className="group bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 hover:border-gray-600 hover:bg-gray-800 transition-all cursor-pointer"
            >
              {/* 썸네일 영역 */}
              <div className="aspect-video bg-black flex items-center justify-center relative overflow-hidden">
                {/* 미니 프리뷰 (작은 파일 ~ 10MB만) */}
                {f.size < 10 * 1024 * 1024 ? (
                  <video
                    src={streamUrl(f.name)}
                    muted preload="metadata"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-3xl">🎬</span>
                    <span className="text-xs text-gray-600 font-mono">{fmtExt(f.name)}</span>
                  </div>
                )}
                {/* 플레이 오버레이 */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl">
                    ▶
                  </div>
                </div>
              </div>

              {/* 파일 정보 */}
              <div className="p-3">
                <p className="text-sm font-medium truncate leading-tight" title={f.name}>
                  {f.name}
                </p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-gray-500">{fmtSize(f.size)}</span>
                  <span className="text-xs text-gray-700">{fmtDate(f.modTime)}</span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(f.name); }}
                  className="mt-2 text-xs text-red-500/70 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}

          {/* 업로드 카드 */}
          <label className="aspect-video flex flex-col items-center justify-center border-2 border-dashed border-gray-800 rounded-2xl cursor-pointer hover:border-blue-500/60 hover:bg-blue-950/20 transition-all group">
            <span className="text-3xl text-gray-700 group-hover:text-blue-400 transition-colors">+</span>
            <span className="text-xs text-gray-700 group-hover:text-blue-400 mt-1 transition-colors">동영상 추가</span>
            <input type="file" accept="video/*" className="hidden"
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          </label>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-gray-700">
            <h3 className="text-white font-bold text-lg mb-2">파일 삭제</h3>
            <p className="text-gray-400 text-sm mb-1 break-all">{confirmDelete}</p>
            <p className="text-red-400 text-sm mb-6">이 파일을 NAS에서 완전히 삭제합니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm">
                취소
              </button>
              <button onClick={() => doDelete(confirmDelete)}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-semibold">
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 비디오 플레이어 모달 */}
      {playing && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          {/* 상단 바 */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-gray-400 text-sm flex-shrink-0">{fmtExt(playing.name)}</span>
              <span className="text-white text-sm font-medium truncate">{playing.name}</span>
              <span className="text-gray-600 text-xs flex-shrink-0">{fmtSize(playing.size)}</span>
            </div>
            <button
              onClick={() => setPlaying(null)}
              className="ml-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white flex-shrink-0"
            >
              ✕
            </button>
          </div>

          {/* 비디오 */}
          <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
            <video
              key={playing.name}
              src={streamUrl(playing.name)}
              controls
              autoPlay
              playsInline
              className="max-w-full max-h-full"
              style={{ maxHeight: 'calc(100vh - 60px)' }}
              onError={() => alert('재생 오류: 파일을 불러올 수 없습니다.')}
            />
          </div>
        </div>
      )}
    </div>
  );
}
