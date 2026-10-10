'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface VideoItem {
  id: string;
  title: string;
  duration: number;
  channel: string;
  upload_date: string;
  video_file: string;
  thumb_file: string;
  file_size: number;
}

function formatDuration(s: number) {
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatDate(d: string) {
  if (!d || d.length < 8) return '';
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
  return `${(bytes / 1e6).toFixed(0)}MB`;
}

// ── 비밀번호 모달 ──────────────────────────────────────
function PasswordModal({
  onSuccess,
  onClose,
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit() {
    setLoading(true);
    setError('');
    const res = await fetch('/api/mode/youtube/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    setLoading(false);
    if (res.ok) {
      onSuccess();
    } else {
      setError('비밀번호가 틀렸습니다.');
      setPw('');
      inputRef.current?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-white font-bold text-lg mb-1">🔒 비밀번호 입력</h2>
        <p className="text-gray-400 text-sm mb-4">영상 재생을 위해 비밀번호를 입력하세요</p>
        <input
          ref={inputRef}
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="비밀번호"
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm mb-3 focus:outline-none focus:border-purple-500"
        />
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm text-gray-400 bg-gray-800 hover:bg-gray-700"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={!pw || loading}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white"
          >
            {loading ? '확인 중...' : '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 비디오 플레이어 모달 ───────────────────────────────
function VideoPlayer({ video, onClose }: { video: VideoItem; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const src = `/api/mode/youtube/stream?file=${encodeURIComponent(video.video_file)}`;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* 상단 바 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-950/90 border-b border-gray-800">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors p-1"
        >
          ← 목록
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{video.title}</p>
          <p className="text-gray-400 text-xs">{video.channel} · {formatDate(video.upload_date)}</p>
        </div>
      </div>

      {/* 비디오 */}
      <div className="flex-1 flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          className="max-h-full max-w-full w-full"
          style={{ maxHeight: 'calc(100vh - 120px)' }}
        >
          브라우저가 video 태그를 지원하지 않습니다.
        </video>
      </div>
    </div>
  );
}

// ── 비디오 카드 ────────────────────────────────────────
function VideoCard({
  video,
  onClick,
}: {
  video: VideoItem;
  onClick: () => void;
}) {
  const thumbSrc = video.thumb_file
    ? `/api/mode/youtube/thumbnail?file=${encodeURIComponent(video.thumb_file)}`
    : null;

  return (
    <div
      onClick={onClick}
      className="cursor-pointer group"
    >
      {/* 썸네일 */}
      <div className="relative w-full aspect-video bg-gray-800 rounded-xl overflow-hidden mb-2">
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-600">▶</div>
        )}
        {/* 재생 오버레이 */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/0 group-hover:bg-white/90 transition-all flex items-center justify-center">
            <svg className="w-5 h-5 text-black opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        {/* 재생 시간 */}
        {video.duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-mono">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>

      {/* 메타 */}
      <div className="flex gap-2">
        <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
          {video.channel.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium leading-snug line-clamp-2 group-hover:text-purple-300 transition-colors">
            {video.title}
          </p>
          <p className="text-gray-400 text-xs mt-1">{video.channel}</p>
          <p className="text-gray-500 text-xs">
            {formatDate(video.upload_date)}
            {video.file_size > 0 && ` · ${formatSize(video.file_size)}`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ────────────────────────────────────────
export default function YoutubePage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 다운로드
  const [channelInput, setChannelInput] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');
  const [showDownload, setShowDownload] = useState(false);
  const [dlPid, setDlPid] = useState('');
  const [dlLogFile, setDlLogFile] = useState('');
  const [dlLog, setDlLog] = useState<string[]>([]);
  const [dlRunning, setDlRunning] = useState(false);

  // 인증
  const [isAuth, setIsAuth] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingVideo, setPendingVideo] = useState<VideoItem | null>(null);

  // 플레이어
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null);

  const loadVideos = useCallback(async (channel = '') => {
    setLoading(true);
    const params = channel ? `?channel=${encodeURIComponent(channel)}` : '';
    try {
      const res = await fetch(`/api/mode/youtube/videos${params}`);
      if (res.ok) {
        const data = await res.json();
        setVideos(data.videos || []);
        setChannels(data.channels || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/mode/youtube/auth').then((r) => { if (r.ok) setIsAuth(true); });
    loadVideos();
  }, [loadVideos]);

  // 다운로드 진행 폴링
  useEffect(() => {
    if (!dlRunning) return;
    const timer = setInterval(async () => {
      const params = new URLSearchParams();
      if (dlPid) params.set('pid', dlPid);
      if (dlLogFile) params.set('file', dlLogFile);
      const res = await fetch(`/api/mode/youtube/log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDlLog(data.lines || []);
        setDlRunning(data.running);
        if (!data.running) {
          loadVideos(); // 완료되면 목록 갱신
        }
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [dlRunning, dlPid, dlLogFile, loadVideos]);

  async function handleDownload() {
    if (!channelInput.trim()) return;
    setDownloading(true);
    setDownloadMsg('');
    const res = await fetch('/api/mode/youtube/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelInput }),
    });
    const data = await res.json();
    if (res.ok) {
      setDownloadMsg(`다운로드 시작! NAS에서 진행 중...`);
      setDlPid(data.pid || '');
      setDlLogFile(data.logFile || '');
      setDlRunning(true);
    } else {
      setDownloadMsg(data.error || '오류 발생');
    }
    setDownloading(false);
  }

  function handleVideoClick(video: VideoItem) {
    if (!isAuth) {
      setPendingVideo(video);
      setShowPasswordModal(true);
    } else {
      setPlayingVideo(video);
    }
  }

  function handleAuthSuccess() {
    setIsAuth(true);
    setShowPasswordModal(false);
    if (pendingVideo) {
      setPlayingVideo(pendingVideo);
      setPendingVideo(null);
    }
  }

  const filtered = videos.filter((v) =>
    !search || v.title.toLowerCase().includes(search.toLowerCase()) || v.channel.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 헤더 */}
      <div className="sticky top-0 z-40 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <h1 className="text-lg font-bold text-white whitespace-nowrap">📥 YouTube</h1>

          {/* 검색 */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="영상 검색..."
              className="w-full bg-gray-800 border border-gray-700 rounded-full px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* 다운로드 버튼 */}
          <button
            onClick={() => setShowDownload((v) => !v)}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
          >
            ＋ 채널 추가
          </button>
        </div>

        {/* 다운로드 패널 */}
        {showDownload && (
          <div className="max-w-7xl mx-auto mt-3 bg-gray-900 border border-gray-700 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-2">채널 URL 또는 @핸들 입력</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
                placeholder="https://www.youtube.com/@channelname 또는 @channelname"
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
              <button
                onClick={handleDownload}
                disabled={!channelInput.trim() || downloading}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              >
                {downloading ? '⏳ 시작 중...' : '다운로드'}
              </button>
            </div>
            {downloadMsg && (
              <p className="mt-2 text-xs text-green-400">{downloadMsg}</p>
            )}

            {/* 실시간 진행 로그 */}
            {(dlRunning || dlLog.length > 0) && (
              <div className="mt-3 bg-gray-950 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  {dlRunning && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
                  <span className="text-xs text-gray-400 font-medium">
                    {dlRunning ? '다운로드 진행 중...' : '완료'}
                  </span>
                </div>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {dlLog.slice(-15).map((line, i) => (
                    <p key={i} className={`text-xs font-mono ${
                      line.startsWith('DONE') ? 'text-green-400' :
                      line.startsWith('ERR') ? 'text-red-400' :
                      line.startsWith('SKIP') ? 'text-gray-500' :
                      line.startsWith('DL') ? 'text-blue-400' :
                      'text-gray-400'
                    }`}>{line}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 채널 탭 */}
        {channels.length > 1 && (
          <div className="max-w-7xl mx-auto mt-2 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => { setSelectedChannel(''); loadVideos(''); }}
              className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                !selectedChannel ? 'bg-white text-black font-medium' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              전체
            </button>
            {channels.map((ch) => (
              <button
                key={ch}
                onClick={() => { setSelectedChannel(ch); loadVideos(ch); }}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                  selectedChannel === ch ? 'bg-white text-black font-medium' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video bg-gray-800 rounded-xl mb-2" />
                <div className="flex gap-2">
                  <div className="w-9 h-9 bg-gray-800 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-800 rounded w-full" />
                    <div className="h-3 bg-gray-800 rounded w-2/3" />
                    <div className="h-2.5 bg-gray-800 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-lg">
              {videos.length === 0
                ? '다운로드된 영상이 없습니다. 채널을 추가해보세요.'
                : '검색 결과가 없습니다.'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-xs mb-4">총 {filtered.length}개</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
              {filtered.map((v) => (
                <VideoCard key={v.video_file} video={v} onClick={() => handleVideoClick(v)} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* 비밀번호 모달 */}
      {showPasswordModal && (
        <PasswordModal
          onSuccess={handleAuthSuccess}
          onClose={() => { setShowPasswordModal(false); setPendingVideo(null); }}
        />
      )}

      {/* 비디오 플레이어 */}
      {playingVideo && (
        <VideoPlayer video={playingVideo} onClose={() => setPlayingVideo(null)} />
      )}
    </div>
  );
}
