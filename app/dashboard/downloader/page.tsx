'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const PASS = '0506';
const AUTH_KEY = 'dl_auth_v1';
const DL_URL = 'http://hy64.synology.me:58000';

interface FileInfo {
  name: string;
  size: number;
  sizeMB: string;
  date: string;
  hasSrt: boolean;
}

function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);

  const check = () => {
    if (input === PASS) { sessionStorage.setItem(AUTH_KEY, '1'); onAuth(); }
    else { setShake(true); setInput(''); setTimeout(() => setShake(false), 600); }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className={`bg-gray-900 border border-gray-700 rounded-2xl p-8 w-80 space-y-5 ${shake ? 'animate-bounce' : ''}`}>
        <div className="text-center">
          <div className="text-4xl mb-2">🔒</div>
          <h2 className="text-white font-bold text-lg">다운로더</h2>
          <p className="text-gray-400 text-sm mt-1">비밀번호를 입력하세요</p>
        </div>
        <input
          type="password"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && check()}
          className="w-full bg-gray-800 text-white text-center text-2xl tracking-[0.5em] border border-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500"
          placeholder="••••"
          autoFocus
          maxLength={8}
        />
        <button
          onClick={check}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-xl transition-colors"
        >
          입장
        </button>
      </div>
    </div>
  );
}

function formatSize(mb: string) {
  const n = parseFloat(mb);
  if (n >= 1024) return `${(n / 1024).toFixed(1)} GB`;
  return `${n} MB`;
}

function VideoPlayer({ file, onClose }: { file: FileInfo; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [srt, setSrt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState('');
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const streamUrl = `/api/downloader/stream?file=${encodeURIComponent(file.name)}`;

  useEffect(() => {
    if (file.hasSrt) loadSrt();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    if (srt) {
      const blob = new Blob([srt], { type: 'text/vtt; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      setTrackUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [srt]);

  const loadSrt = async () => {
    const res = await fetch(`/api/downloader/subtitle?file=${encodeURIComponent(file.name)}`).then(r => r.json());
    if (res.srt) setSrt(srtToVtt(res.srt));
  };

  const generateSub = async () => {
    setGenerating(true);
    setGenMsg('오디오 추출 중...');
    try {
      const res = await fetch('/api/downloader/subtitle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      }).then(r => r.json());
      if (res.error) { setGenMsg('❌ ' + res.error); }
      else { setSrt(srtToVtt(res.srt)); setGenMsg('✅ 자막 생성 완료!'); }
    } catch (e) {
      setGenMsg('❌ ' + String(e));
    }
    setGenerating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-white text-sm font-medium truncate max-w-lg">{file.name}</span>
        <div className="flex items-center gap-2">
          {!srt && (
            <button
              onClick={e => { e.stopPropagation(); generateSub(); }}
              disabled={generating}
              className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-50"
            >
              {generating ? '🔄 생성 중...' : '💬 자막 생성'}
            </button>
          )}
          {genMsg && <span className="text-xs text-gray-300">{genMsg}</span>}
          <a
            href={streamUrl}
            download={file.name}
            className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
            onClick={e => e.stopPropagation()}
          >
            ⬇ 다운로드
          </a>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        <video
          ref={videoRef}
          src={streamUrl}
          controls
          autoPlay
          className="max-w-full max-h-full rounded-lg"
          crossOrigin="anonymous"
        >
          {trackUrl && <track kind="subtitles" src={trackUrl} srcLang="ja" label="자막" default />}
        </video>
      </div>
    </div>
  );
}

function srtToVtt(srt: string): string {
  return 'WEBVTT\n\n' + srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}

function FileList() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<FileInfo | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadFiles = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/downloader/files').then(r => r.json());
    setFiles(res.files || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const deleteFile = async (f: FileInfo) => {
    if (!confirm(`"${f.name}" 삭제할까요?`)) return;
    setDeleting(f.name);
    await fetch('/api/downloader/files', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: f.name }) });
    await loadFiles();
    setDeleting(null);
  };

  const filtered = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  const totalGB = files.reduce((s, f) => s + parseFloat(f.sizeMB), 0) / 1024;

  return (
    <div className="h-full flex flex-col">
      {playing && <VideoPlayer file={playing} onClose={() => setPlaying(null)} />}
      <div className="flex items-center gap-3 p-3 border-b border-gray-800 shrink-0">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="파일명 검색..."
          className="flex-1 bg-gray-800 text-white text-sm rounded-xl px-3 py-2 border border-gray-700 focus:outline-none focus:border-blue-500"
        />
        <span className="text-gray-400 text-xs shrink-0">{files.length}개 · {totalGB.toFixed(2)} GB</span>
        <button onClick={loadFiles} className="text-xs px-3 py-2 bg-gray-800 text-gray-300 rounded-xl border border-gray-700 hover:bg-gray-700">
          🔄 새로고침
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-3xl mb-2 animate-spin">⟳</div>
            <p>파일 목록 로딩 중...</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-4xl mb-2">📂</div>
            <p>{search ? '검색 결과 없음' : '다운로드된 파일이 없습니다'}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.map(f => (
            <div key={f.name} className="bg-gray-800 rounded-xl p-3 flex items-center gap-3 hover:bg-gray-750 border border-gray-700">
              <div className="text-2xl shrink-0">🎬</div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{f.name}</p>
                <p className="text-gray-400 text-xs mt-0.5">{formatSize(f.sizeMB)} · {f.date}</p>
                {f.hasSrt && <span className="text-xs bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded mt-0.5 inline-block">💬 자막 있음</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setPlaying(f)}
                  className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium"
                >
                  ▶ 재생
                </button>
                <a
                  href={`/api/downloader/stream?file=${encodeURIComponent(f.name)}`}
                  download={f.name}
                  className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                >
                  ⬇
                </a>
                <button
                  onClick={() => deleteFile(f)}
                  disabled={deleting === f.name}
                  className="text-xs px-2 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-300 rounded-lg disabled:opacity-50"
                >
                  {deleting === f.name ? '...' : '🗑'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DownloaderPage() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<'download' | 'files'>('download');

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) === '1') setAuthed(true);
  }, []);

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;

  return (
    <div className="flex flex-col bg-gray-950" style={{ height: 'calc(100vh - 60px)' }}>
      {/* 탭 헤더 */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 shrink-0 border-b border-gray-800">
        {[
          { id: 'download', label: '🌐 다운로드', desc: '새 영상 받기' },
          { id: 'files',    label: '📁 파일 목록', desc: '재생 · 삭제 · 자막' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'download' | 'files')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id
                ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <a
          href={DL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-600 hover:text-gray-400 px-2 py-1 mb-1"
        >
          ↗ 별도 탭
        </a>
        <button
          onClick={() => { sessionStorage.removeItem(AUTH_KEY); setAuthed(false); }}
          className="text-xs text-gray-600 hover:text-gray-400 px-2 py-1 mb-1"
        >
          🔒 잠금
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-hidden">
        {tab === 'download' ? (
          <iframe
            src={DL_URL}
            className="w-full h-full border-none"
            title="Downloader"
          />
        ) : (
          <FileList />
        )}
      </div>
    </div>
  );
}
