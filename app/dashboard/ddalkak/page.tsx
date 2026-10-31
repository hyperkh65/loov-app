'use client';
// 딸깍 라이선스 관리(운영자): 번호 발급 · 목록 · 중지
import { useEffect, useState } from 'react';

interface Lic { id: string; code_hint: string; plan: string; status: string; email: string | null; activated_at: string | null; expires_at: string | null; max_devices: number; memo: string | null; created_at: string; devices: { name: string; last: string }[] }
const STATUS: Record<string, string> = { unused: '미사용', active: '사용 중', revoked: '중지됨' };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('ko-KR') : '-');

export default function DdalkakLicensePage() {
  const [plans, setPlans] = useState<Record<string, { label: string; months: number }>>({});
  const [items, setItems] = useState<Lic[]>([]);
  const [plan, setPlan] = useState('m3');
  const [count, setCount] = useState(1);
  const [memo, setMemo] = useState('');
  const [issued, setIssued] = useState<{ label: string; codes: string[] } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await fetch('/api/ddalkak/admin');
    const d = await r.json();
    if (!r.ok) return setMsg(d.error === '권한 없음' ? '운영자 계정으로 로그인해 주세요' : d.error || '불러오지 못했어요');
    setPlans(d.plans); setItems(d.items); setMsg('');
  };
  useEffect(() => { load(); }, []);

  const issue = async () => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/ddalkak/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'issue', plan, count, memo }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) return setMsg(d.error || '발급 실패');
    setIssued({ label: d.label, codes: d.codes }); load();
  };
  const revoke = async (id: string) => {
    if (!confirm('이 번호의 사용을 중지할까요? 사용 중인 앱은 다음 갱신 때 막혀요.')) return;
    await fetch('/api/ddalkak/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke', id }) });
    load();
  };
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => setMsg('복사했어요'));

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold">🔑 딸깍 라이선스</h1>
      {msg && <p className="text-sm text-blue-700">{msg}</p>}

      <section className="border rounded-2xl p-4 space-y-3 bg-white">
        <h2 className="font-semibold">번호 발급</h2>
        <div className="grid grid-cols-2 gap-2">
          <select value={plan} onChange={e => setPlan(e.target.value)} className="border rounded-xl px-3 py-2">
            {Object.entries(plans).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="number" min={1} max={100} value={count} onChange={e => setCount(+e.target.value)} className="border rounded-xl px-3 py-2" placeholder="개수" />
        </div>
        <input value={memo} onChange={e => setMemo(e.target.value)} className="w-full border rounded-xl px-3 py-2" placeholder="메모 (예: 홍길동 / 이벤트)" />
        <button onClick={issue} disabled={busy} className="w-full bg-blue-600 text-white rounded-xl py-2 font-semibold disabled:opacity-50">{busy ? '발급 중…' : '발급하기'}</button>
        {issued && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
            <p className="text-sm font-semibold">{issued.label} 번호 {issued.codes.length}개 — <span className="text-red-600">지금만 보여요. 꼭 복사해 두세요</span></p>
            <pre className="text-sm whitespace-pre-wrap select-all">{issued.codes.join('\n')}</pre>
            <button onClick={() => copy(issued.codes.join('\n'))} className="px-3 py-1 border rounded-lg text-sm">전체 복사</button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">발급 목록 ({items.length})</h2>
        {items.map(l => (
          <div key={l.id} className="border rounded-xl p-3 bg-white text-sm space-y-1">
            <div className="flex items-center gap-2">
              <b>…{l.code_hint}</b>
              <span>{plans[l.plan]?.label || l.plan}</span>
              <span className={l.status === 'active' ? 'text-green-700' : l.status === 'revoked' ? 'text-red-600' : 'text-gray-500'}>{STATUS[l.status]}</span>
              {l.status !== 'revoked' && <button onClick={() => revoke(l.id)} className="ml-auto text-xs text-red-600 border border-red-200 rounded-lg px-2 py-1">중지</button>}
            </div>
            <p className="text-gray-600">{l.email || '(아직 등록 전)'} · 만료 {fmt(l.expires_at)} · 발급 {fmt(l.created_at)}{l.memo ? ` · ${l.memo}` : ''}</p>
            {l.devices.length > 0 && <p className="text-gray-500">기기 {l.devices.length}/{l.max_devices}: {l.devices.map(d => `${d.name}(${fmt(d.last)})`).join(', ')}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}
