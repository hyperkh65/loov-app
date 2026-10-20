'use client';

import { useEffect, useState, useCallback } from 'react';

interface Job {
  id: string; title: string | null; phrase: string | null; description: string | null; status: 'created' | 'scheduled' | 'uploading' | 'uploaded' | 'failed';
  source: string; scheduled_at: string | null; uploaded_at: string | null; video_id: string | null; video_url: string | null; error: string | null; thumb: string | null; created_at: string; updated_at?: string | null;
}
type Tab = 'hold' | 'created' | 'scheduled' | 'uploaded' | 'manual';
const TABS: { key: Tab; label: string }[] = [
  { key: 'hold', label: '발행 대기' }, { key: 'created', label: '만든 영상' }, { key: 'scheduled', label: '예약 현황' }, { key: 'uploaded', label: '업로드 영상' }, { key: 'manual', label: '수동 업로드' },
];
const ko = (d: string | null) => (d ? new Date(d).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const vid = (j: Job) => j.video_id || j.video_url?.match(/shorts\/([\w-]{6,})/)?.[1] || '';
const BADGE: Record<string, string> = { created: '대기', uploading: '업로드 중', failed: '실패', scheduled: '예약', uploaded: '업로드됨' };

export default function ShortsInboxPage() {
  const [rows, setRows] = useState<Job[] | null>(null);
  const [tab, setTab] = useState<Tab>('hold');
  const load = useCallback(() => { fetch('/api/shorts-inbox/list').then(r => r.json()).then(d => setRows(Array.isArray(d) ? d : [])).catch(() => setRows([])); }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const isHold = (j: Job) => j.source === 'hold' && j.status !== 'uploaded';
  const pick = (t: Tab) => (rows || []).filter(j => t === 'hold' ? isHold(j) : (t === 'created' ? ['created', 'uploading', 'failed'].includes(j.status) : j.status === t) && !(j.source === 'hold' && j.status !== 'uploaded'));
  const count = (t: Tab) => (t === 'manual' ? 0 : pick(t).length);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold mb-1">딸깍 영상 관리</h1>
      <p className="text-sm text-gray-500 mb-4">맥 앱 &quot;숏폼 딸깍&quot;에서 만든 영상, 예약, 업로드 현황이 30초마다 여기에 동기화됩니다.</p>
      <div className="flex gap-2 mb-6 border-b overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600 font-semibold' : 'border-transparent text-gray-500'}`}>
            {t.label}{t.key !== 'manual' && <span className="ml-1 text-xs text-gray-400">{count(t.key)}</span>}
          </button>
        ))}
      </div>

      {tab === 'manual' ? <ManualUpload onDone={() => { load(); setTab('uploaded'); }} /> : rows === null ? <p className="text-gray-400">불러오는 중…</p> : pick(tab).length === 0 ? (
        <p className="text-gray-400">{tab === 'hold' ? '발행 대기 중인 영상이 없어요.' : tab === 'created' ? '대기 중인 영상이 없어요.' : tab === 'scheduled' ? '예약된 영상이 없어요.' : '아직 업로드한 영상이 없어요.'}</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {pick(tab).sort((a, b) => tab === 'scheduled' ? +new Date(a.scheduled_at || 0) - +new Date(b.scheduled_at || 0) : 0).map(j => {
            const v = vid(j), img = v ? `https://i.ytimg.com/vi/${v}/hqdefault.jpg` : j.thumb || '';
            const body = (
              <>
                {j.source === 'hold' && j.video_url?.endsWith('.mp4') ? <video src={j.video_url} controls preload="metadata" className="w-full aspect-[9/16] object-cover bg-black" /> : img ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img} alt="" className="w-full aspect-[9/16] object-cover bg-gray-100" /> : <div className="w-full aspect-[9/16] bg-gray-100" />}
                <div className="p-2 text-sm">
                  <div className="font-medium line-clamp-2">{j.title || j.phrase || j.id}</div>
                  <div className="text-xs mt-1 flex items-center gap-1 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded ${j.status === 'failed' ? 'bg-red-100 text-red-600' : j.status === 'uploaded' ? 'bg-green-100 text-green-700' : j.status === 'scheduled' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{BADGE[j.status]}</span>
                    <span className="text-gray-500">{j.status === 'scheduled' ? `${ko(j.scheduled_at)} 공개` : j.status === 'uploaded' ? ko(j.uploaded_at) : ko(j.created_at)}</span>
                  </div>
                  {tab === 'hold' && <Publish job={j} onDone={load} />}
                  {j.error && <div className="text-xs text-red-500 mt-1 line-clamp-2">{j.error}</div>}
                </div>
              </>
            );
            return j.video_url && tab !== 'hold' ? <a key={j.id} href={j.video_url} target="_blank" rel="noreferrer" className="block rounded-xl border overflow-hidden hover:shadow-md transition">{body}</a>
              : <div key={j.id} className="rounded-xl border overflow-hidden">{body}</div>;
          })}
        </div>
      )}
    </div>
  );
}

function ManualUpload({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const at = String(fd.get('when') || '');
    fd.delete('when');
    if (at) fd.set('publish_at', new Date(at).toISOString());
    setBusy(true); setMsg('업로드 중… (영상 크기에 따라 1~2분)');
    try {
      const r = await fetch('/api/shorts-inbox/manual', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setMsg(''); onDone();
    } catch (err) { setMsg('실패: ' + (err as Error).message); } finally { setBusy(false); }
  }
  const input = 'w-full border rounded-lg px-3 py-2 text-sm';
  return (
    <form onSubmit={submit} className="max-w-xl space-y-3">
      <p className="text-sm text-gray-500">LOOV에 연결된 YouTube 채널로 바로 올립니다. 공개 시각을 넣으면 비공개로 올린 뒤 그 시각에 공개돼요.</p>
      <input type="file" name="video" accept="video/mp4,video/*" required className={input} />
      <input name="title" placeholder="제목" required maxLength={90} className={input} />
      <textarea name="description" placeholder="설명" rows={4} className={input} />
      <input name="tags" placeholder="태그 (쉼표로 구분)" className={input} />
      <label className="block text-sm text-gray-600">예약 공개 시각 (비우면 즉시 공개)
        <input type="datetime-local" name="when" className={input + ' mt-1'} />
      </label>
      <button disabled={busy} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">{busy ? '업로드 중…' : '업로드'}</button>
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </form>
  );
}

function Publish({ job, onDone }: { job: Job; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const stuck = job.status === 'uploading' && !!job.updated_at && Date.now() - new Date(job.updated_at).getTime() > 10 * 60_000;
  async function go() {
    if (!confirm(`"${job.title}"\n\nYouTube · Threads · Instagram(@2dayskr)에 지금 발행할까요?`)) return;
    setBusy(true); setMsg('발행 중… (1~3분)');
    try {
      const r = await fetch('/api/shorts-inbox/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: job.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setMsg(d.ok ? `완료 — YouTube ${d.youtube ? 'O' : 'X'} · SNS ${d.sns}/2 ${d.notes?.length ? '· ' + d.notes.join(' | ') : ''}` : '실패: ' + d.notes.join(' | '));
    } catch (err) { setMsg('실패: ' + (err as Error).message); } finally { setBusy(false); onDone(); }
  }
  return (
    <>
      <div className="text-xs text-gray-500 mt-1 whitespace-pre-line line-clamp-6">{job.description}</div>
      <button disabled={busy || (job.status === 'uploading' && !stuck)} onClick={go} className="mt-2 w-full px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">{busy || (job.status === 'uploading' && !stuck) ? '발행 중…' : stuck ? '다시 발행 (멈춤)' : '발행'}</button>
      {stuck && !busy && <div className="text-xs text-amber-600 mt-1">10분 넘게 멈춰 있어요. 이미 올라간 곳이 있을 수 있으니 유튜브·스레드·인스타를 먼저 확인하고 다시 발행하세요.</div>}
      {msg && <div className="text-xs text-gray-600 mt-1">{msg}</div>}
      {['created', 'failed'].includes(job.status) && !busy && <button onClick={async () => { if (!confirm(`"${job.title}" 카드를 지울까요?`)) return; const r = await fetch('/api/shorts-inbox/publish?id=' + encodeURIComponent(job.id), { method: 'DELETE' }); if (r.ok) onDone(); else setMsg('삭제 실패'); }} className="mt-1 w-full px-3 py-1 rounded-lg text-xs text-gray-500 hover:text-red-600">삭제</button>}
    </>
  );
}
