'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Source {
  id: string;
  connector_status: string;
  enabled: boolean;
  health_status: string;
}

const PHASES = [
  { n: 1, label: '저장소 감사', status: 'done' },
  { n: 2, label: 'DB 스키마 + 소스 레지스트리', status: 'done' },
  { n: 3, label: '발굴 엔진 (Discovery)', status: 'todo' },
  { n: 4, label: '상품 정규화 + 스코어링', status: 'todo' },
  { n: 5, label: '쿠팡 매칭 워크플로우', status: 'todo' },
  { n: 6, label: '미디어 권리 엔진', status: 'todo' },
  { n: 7, label: '크리에이티브 분석', status: 'todo' },
  { n: 8, label: '영상 생성', status: 'todo' },
  { n: 9, label: '자동 QA', status: 'todo' },
  { n: 10, label: '관리자 승인 흐름', status: 'todo' },
  { n: 11, label: '발행 어댑터', status: 'todo' },
  { n: 12, label: '성과 분석', status: 'todo' },
  { n: 13, label: '학습 루프', status: 'todo' },
  { n: 14, label: '엔드투엔드 검증', status: 'todo' },
];

export default function AffiliateEngineDashboard() {
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => {
    fetch('/api/affiliate-engine/sources').then(r => r.json()).then(d => setSources(Array.isArray(d) ? d : []));
  }, []);

  const connected = sources.filter(s => s.connector_status === 'CONNECTED').length;
  const enabled = sources.filter(s => s.enabled).length;
  const unhealthy = sources.filter(s => s.health_status !== 'UP').length;

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24">
      <h1 className="text-xl font-bold text-gray-900 mb-1">🧭 제휴 엔진</h1>
      <p className="text-xs text-gray-500 mb-4">
        제휴 상품 발굴 + 숏폼 콘텐츠 자동화 시스템. 현재 Phase 2까지 구축됨 — 아래 로드맵 참고.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-emerald-600">{connected}</div>
          <div className="text-[11px] text-gray-500 mt-1">연동됨(CONNECTED)</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{enabled}</div>
          <div className="text-[11px] text-gray-500 mt-1">활성화된 소스</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{unhealthy}</div>
          <div className="text-[11px] text-gray-500 mt-1">이상 신호</div>
        </div>
      </div>

      <Link href="/dashboard/affiliate-engine/sources"
        className="block bg-blue-500 text-white text-center text-sm font-semibold rounded-xl py-2.5 mb-6">
        소스 레지스트리 관리 →
      </Link>

      <h2 className="text-sm font-bold text-gray-700 mb-2">구축 로드맵 (Phase 1~14)</h2>
      <div className="space-y-1.5">
        {PHASES.map(p => (
          <div key={p.n} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${p.status === 'done' ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {p.status === 'done' ? '✓' : p.n}
            </span>
            <span className={`text-sm ${p.status === 'done' ? 'text-gray-900' : 'text-gray-400'}`}>{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
