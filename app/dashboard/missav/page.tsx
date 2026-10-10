'use client';

import { useState, useEffect } from 'react';

const DEFAULT_URL = 'http://hy64.synology.me:58000';
const STORAGE_KEY = 'missav_dlp_url';

export default function MissavPage() {
  const [url, setUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
    setUrl(saved);
    setInputUrl(saved);
  }, []);

  const saveUrl = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setUrl(trimmed);
    setEditing(false);
  };

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 60px)' }}>
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <span className="text-lg">🎥</span>
        <span className="font-semibold text-gray-800">MissAV Downloader</span>
        <span className="text-xs text-gray-400 ml-1">Docker Web UI</span>
        <div className="flex-1" />
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveUrl()}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1 w-72 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="http://NAS_IP:58000"
              autoFocus
            />
            <button
              onClick={saveUrl}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
            >
              저장
            </button>
            <button
              onClick={() => { setInputUrl(url); setEditing(false); }}
              className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            >
              취소
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-mono">{url}</span>
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            >
              URL 변경
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            >
              새 탭 열기 ↗
            </a>
          </div>
        )}
      </div>

      {/* iframe */}
      {url && (
        <iframe
          key={url}
          src={url}
          className="flex-1 w-full border-none"
          allow="fullscreen"
          title="MissAV Downloader"
        />
      )}
    </div>
  );
}
