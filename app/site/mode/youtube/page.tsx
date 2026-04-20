'use client';

import { useState } from 'react';

export default function YoutubeDownloadPage() {
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState('best');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleDownload() {
    if (!url.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/mode/youtube/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, quality }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage(data.message || '다운로드가 시작되었습니다.');
      } else {
        setStatus('error');
        setMessage(data.error || '오류가 발생했습니다.');
      }
    } catch {
      setStatus('error');
      setMessage('서버 연결에 실패했습니다.');
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">📥 YouTube 다운로드</h1>
        <p className="text-gray-400 text-sm">유튜브 영상을 시놀로지 NAS에 직접 저장합니다</p>
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">YouTube URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">화질</label>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="best">최고화질</option>
            <option value="1080">1080p</option>
            <option value="720">720p</option>
            <option value="480">480p</option>
            <option value="audio">음원만 (mp3)</option>
          </select>
        </div>

        <button
          onClick={handleDownload}
          disabled={!url.trim() || status === 'loading'}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {status === 'loading' ? '⏳ 다운로드 중...' : '다운로드 시작'}
        </button>

        {message && (
          <div
            className={`text-sm px-3 py-2 rounded-lg ${
              status === 'success'
                ? 'bg-green-900/40 text-green-400 border border-green-700'
                : 'bg-red-900/40 text-red-400 border border-red-700'
            }`}
          >
            {message}
          </div>
        )}
      </div>

      {/* NAS 저장 경로 안내 */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm text-gray-400">
        <p className="font-medium text-gray-300 mb-1">NAS 저장 경로</p>
        <code className="text-purple-300">/volume1/homes/urjent/youtube_downloads/</code>
      </div>
    </div>
  );
}
