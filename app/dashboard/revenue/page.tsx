'use client';

import { useEffect, useState } from 'react';

interface Data {
  days: number;
  sites: { host: string; views: number; avgDwell: number }[];
  clicks: { key: string; clicks: number }[];
  coupang: { subId: string; click: number; commission: number }[];
  coupangError: string | null;
}

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;
const subLabel = (s: string) => (s === 'sns' ? 'SNS 댓글 링크' : s === 'wp' ? '워드프레스 CTA' : s);

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto mb-5">
      <table className="w-full text-sm">
        <thead><tr className="text-[11px] text-gray-500 border-b border-gray-100">
          {head.map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="px-3 py-4 text-center text-xs text-gray-400">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              {r.map((c, j) => <td key={j} className={`px-3 py-2 tabular-nums ${j ? 'text-right' : 'text-left text-gray-900'}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RevenuePage() {
  const [days, setDays] = useState(14);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setD(null); setErr('');
    fetch(`/api/revenue?days=${days}`).then(r => r.json()).then(j => j.error ? setErr(j.error) : setD(j)).catch(e => setErr(String(e)));
  }, [days]);

  const totalCommission = d?.coupang.reduce((a, c) => a + c.commission, 0) || 0;
  const totalClicks = d?.coupang.reduce((a, c) => a + c.click, 0) || 0;

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">📈 블로그 수익표</h1>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
          {[7, 14, 30].map(n => <option key={n} value={n}>최근 {n}일</option>)}
        </select>
      </div>
      <p className="text-xs text-gray-500 mb-4">방문·체류시간은 사이트 비콘(봇 제외), 수수료는 쿠팡 파트너스 리포트 기준. 애드센스는 구글 재연동 후 추가.</p>

      {err && <div className="text-sm text-red-600 mb-3">{err}</div>}
      {!d && !err && <div className="text-sm text-gray-400">불러오는 중…</div>}
      {d && (<>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[['쿠팡 수수료', won(totalCommission), 'text-emerald-600'], ['쿠팡 실클릭', totalClicks.toLocaleString(), 'text-blue-600'],
            ['총 방문', d.sites.reduce((a, s) => a + s.views, 0).toLocaleString(), 'text-gray-900']].map(([l, v, c]) => (
            <div key={l} className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
              <div className={`text-xl font-bold ${c}`}>{v}</div>
              <div className="text-[11px] text-gray-500 mt-1">{l}</div>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-bold text-gray-700 mb-2">사이트별 방문 · 체류시간</h2>
        <Table head={['사이트', '방문', '평균 체류']} empty="아직 수집된 방문이 없습니다 (비콘 설치 직후엔 비어 있음)"
          rows={d.sites.map(s => [s.host, s.views.toLocaleString(), s.avgDwell ? `${Math.floor(s.avgDwell / 60)}분 ${s.avgDwell % 60}초` : '-'])} />

        <h2 className="text-sm font-bold text-gray-700 mb-2">쿠팡 파트너스 (링크 종류별)</h2>
        {d.coupangError && <div className="text-xs text-amber-600 mb-2">리포트 조회 실패: {d.coupangError}</div>}
        <Table head={['링크', '클릭', '수수료']} empty="리포트 데이터 없음 (subId 링크는 새로 발행되는 글부터 집계)"
          rows={d.coupang.map(c => [subLabel(c.subId), c.click.toLocaleString(), won(c.commission)])} />

        <h2 className="text-sm font-bold text-gray-700 mb-2">우리 링크(/go) 클릭 — 플랫폼 / 채널</h2>
        <Table head={['플랫폼 / 채널', '클릭']} empty="클릭 없음"
          rows={d.clicks.map(c => [c.key, c.clicks.toLocaleString()])} />
        <p className="text-[11px] text-gray-400">/go 클릭은 미리보기·봇이 섞여 쿠팡 실클릭보다 많게 나올 수 있어요(봇 필터는 이번 배포부터 적용).</p>
      </>)}
    </div>
  );
}
