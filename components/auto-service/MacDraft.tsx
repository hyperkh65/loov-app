'use client';
import { useEffect, useState, useCallback } from 'react';

type Item = { id: string; platform: 'naver' | 'tistory'; blog: string | null; mode: 'publish' | 'draft'; status: 'pending' | 'running' | 'saved' | 'failed'; message: string | null };
const NAME = { naver: '네이버', tistory: '티스토리' } as const;
const LABEL = (it: Item) => ({ pending: '대기 중(Mac이 곧 처리)', running: it.mode === 'draft' ? '임시저장 중…' : '발행 중…', saved: it.mode === 'draft' ? '임시저장 완료 — 직접 발행해 주세요' : '발행 완료', failed: '실패' })[it.status];

export default function MacDraft({ articleId }: { articleId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [ai, setAi] = useState(true);
  const [draftOnly, setDraftOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const d = await fetch(`/api/blog-queue?article_id=${articleId}`).then(r => r.json()).catch(() => null);
    if (d?.items) setItems(d.items);
  }, [articleId]);

  useEffect(() => {                       // 처음 열 때 한 번 불러오기(비동기 콜백 안에서 상태를 갱신)
    let alive = true;
    fetch(`/api/blog-queue?article_id=${articleId}`).then(r => r.json()).then(d => { if (alive && d?.items) setItems(d.items); }).catch(() => {});
    return () => { alive = false; };
  }, [articleId]);
  useEffect(() => {                       // 진행 중인 요청이 있으면 5초마다 새로고침
    if (!items.some(i => i.status === 'pending' || i.status === 'running')) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [items, load]);

  const send = async (platform: 'naver' | 'tistory') => {
    setBusy(platform); setErr('');
    const d = await fetch('/api/blog-queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ article_id: articleId, platform, ai_mark: ai, mode: draftOnly ? 'draft' : 'publish' }) }).then(r => r.json()).catch(() => ({ error: '요청 실패' }));
    if (d.error) setErr(d.error);
    await load(); setBusy(null);
  };

  const latest = (p: 'naver' | 'tistory') => items.find(i => i.platform === p);
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
      <p className="text-sm font-medium text-gray-800">💻 Mac으로 발행 (네이버 · 티스토리)</p>
      <p className="text-xs text-gray-500">사진은 각 사이트 서버에 올리고 첫 사진을 대표로 지정한 뒤 바로 발행합니다. Mac이 켜져 있어야 합니다.</p>
      <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={ai} onChange={e => setAi(e.target.checked)} /> 네이버 사진에 &quot;AI 활용 표시&quot; 켜기</label>
      <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={draftOnly} onChange={e => setDraftOnly(e.target.checked)} /> 발행하지 않고 임시저장만</label>
      <div className="flex gap-2">
        {(['naver', 'tistory'] as const).map(p => {
          const it = latest(p); const active = it && (it.status === 'pending' || it.status === 'running');
          return (
            <button key={p} onClick={() => send(p)} disabled={!!busy || !!active}
              className="flex-1 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-100 disabled:opacity-50">
              {busy === p ? '요청 중…' : `${NAME[p]}로 ${draftOnly ? '임시저장' : '발행'}`}
            </button>
          );
        })}
      </div>
      {(['naver', 'tistory'] as const).map(p => { const it = latest(p); return it ? (
        <p key={p} className={`text-xs ${it.status === 'failed' ? 'text-red-600' : it.status === 'saved' ? 'text-green-700' : 'text-gray-600'}`}>
          {NAME[p]}: {LABEL(it)}{it.status === 'failed' && it.message ? ` — ${it.message}` : ''}{it.status === 'saved' && it.message?.match(/https?:\/\/\S+/) ? <> — <a className="underline" href={it.message.match(/https?:\/\/\S+/)![0]} target="_blank" rel="noreferrer">글 보기</a></> : null}
        </p>) : null; })}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
