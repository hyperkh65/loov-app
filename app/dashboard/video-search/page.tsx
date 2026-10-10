'use client';

import { useCallback, useEffect, useState } from 'react';

interface Job {
  id: string;
  input: string;
  status: 'queued' | 'running' | 'done' | 'error';
  result: { file: string; title?: string; site?: string; thumbnail?: string; uploader?: string; duration?: number; size?: number } | null;
  error: string | null;
  created_at: string;
}

const STATUS: Record<Job['status'], { label: string; cls: string }> = {
  queued: { label: '대기', cls: 'bg-gray-700 text-gray-200' },
  running: { label: '받는 중', cls: 'bg-blue-600 text-white animate-pulse' },
  done: { label: '완료', cls: 'bg-green-600 text-white' },
  error: { label: '실패', cls: 'bg-red-600 text-white' },
};

export default function VideoCollectPage() {
  const [text, setText] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/video-jobs');
    if (r.ok) setJobs(await r.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const submit = async () => {
    setBusy(true);
    setMsg('');
    const urls = text.split(/\s+/).filter(Boolean);
    const r = await fetch('/api/video-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls }) });
    const j = await r.json();
    setMsg(r.ok ? `${j.queued}개 등록됨` : j.error || '실패');
    if (r.ok) { setText(''); load(); }
    setBusy(false);
  };

  const remove = async (id: string) => {
    await fetch('/api/video-jobs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    load();
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 text-gray-100">
      <div>
        <h1 className="text-xl font-bold">🎬 영상 수집</h1>
        <p className="text-sm text-gray-400 mt-1">도우인·샤오홍슈·Bilibili·TikTok 등 영상 URL을 붙여넣으면 NAS(hy64)가 받아둡니다. 참고·소재 수집용이며 출처 URL이 기록됩니다.</p>
      </div>

      <div className="space-y-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          placeholder="영상 URL을 한 줄에 하나씩 (공백·줄바꿈 구분, 한 번에 30개까지)"
          className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm outline-none focus:border-blue-500"
        />
        <div className="flex items-center gap-3">
          <button onClick={submit} disabled={busy || !text.trim()} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-semibold">
            {busy ? '등록 중…' : '다운로드'}
          </button>
          {msg && <span className="text-sm text-gray-400">{msg}</span>}
        </div>
      </div>

      <ul className="space-y-2">
        {jobs.length === 0 && <li className="text-sm text-gray-500">아직 작업이 없습니다.</li>}
        {jobs.map(j => (
          <li key={j.id} className="flex gap-3 items-center bg-gray-900 border border-gray-800 rounded-xl p-3">
            {j.result?.thumbnail
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={j.result.thumbnail} alt="" referrerPolicy="no-referrer" className="w-20 h-12 object-cover rounded bg-gray-800 shrink-0" />
              : <div className="w-20 h-12 rounded bg-gray-800 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{j.result?.title || j.input}</div>
              <div className="text-xs text-gray-500 truncate">
                {[j.result?.site, j.result?.uploader, j.result?.size ? `${(j.result.size / 1048576).toFixed(1)}MB` : null].filter(Boolean).join(' · ')}
                {j.result && ' · '}<a href={j.input} target="_blank" rel="noreferrer" className="hover:underline">원본</a>
              </div>
              {j.error && <div className="text-xs text-red-400 mt-0.5 break-all">{j.error}</div>}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${STATUS[j.status].cls}`}>{STATUS[j.status].label}</span>
            {j.status === 'done' && <a href={`/api/video-jobs/file?id=${j.id}`} className="text-sm px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 shrink-0">저장</a>}
            <button onClick={() => remove(j.id)} className="text-gray-500 hover:text-red-400 shrink-0" aria-label="삭제">✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
