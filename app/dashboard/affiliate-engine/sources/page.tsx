'use client';

import { useEffect, useState, useCallback } from 'react';

interface Source {
  id: string;
  name: string;
  source_type: string;
  country: string | null;
  categories: string[];
  discovery_method: string;
  official_api_available: boolean;
  authentication_required: boolean;
  enabled: boolean;
  priority: number;
  usage_mode: string;
  media_download_allowed: boolean;
  commercial_use_status: string;
  connector_status: string;
  health_status: string;
  notes: string | null;
  created_at: string;
}

const USAGE_MODES = ['TREND_SIGNAL_ONLY', 'PRODUCT_DISCOVERY', 'LICENSED_MEDIA', 'AFFILIATE_MATCHING', 'CREATIVE_REFERENCE'];
const CONNECTOR_STATUSES = ['CONNECTED', 'REQUIRES_API_KEY', 'REFERENCE_ONLY', 'FUTURE_CONNECTOR'];
const SOURCE_TYPES = ['social_trend', 'ecommerce', 'stock_media', 'supplier', 'manual'];

const CONNECTOR_BADGE: Record<string, string> = {
  CONNECTED: 'bg-emerald-100 text-emerald-700',
  REQUIRES_API_KEY: 'bg-amber-100 text-amber-700',
  REFERENCE_ONLY: 'bg-gray-100 text-gray-600',
  FUTURE_CONNECTOR: 'bg-blue-100 text-blue-600',
};
const HEALTH_BADGE: Record<string, string> = {
  UP: 'bg-emerald-100 text-emerald-700',
  DEGRADED: 'bg-amber-100 text-amber-700',
  DOWN: 'bg-red-100 text-red-700',
  AUTH_REQUIRED: 'bg-amber-100 text-amber-700',
  RATE_LIMITED: 'bg-amber-100 text-amber-700',
  CHANGED: 'bg-red-100 text-red-700',
  DISABLED: 'bg-gray-100 text-gray-500',
};

const emptyForm = {
  name: '', source_type: 'social_trend', country: '', usage_mode: 'REFERENCE_ONLY',
  connector_status: 'REFERENCE_ONLY', commercial_use_status: 'UNKNOWN', notes: '',
  discovery_method: 'MANUAL_IMPORT', priority: 50, media_download_allowed: false,
};

export default function AffiliateSourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/affiliate-engine/sources');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '불러오기 실패');
      setSources(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleEnabled(s: Source) {
    setSources(prev => prev.map(x => x.id === s.id ? { ...x, enabled: !x.enabled } : x));
    await fetch('/api/affiliate-engine/sources', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, enabled: !s.enabled }),
    });
  }

  async function remove(id: string) {
    if (!confirm('이 소스를 삭제할까요?')) return;
    await fetch('/api/affiliate-engine/sources', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setSources(prev => prev.filter(x => x.id !== id));
  }

  async function submitForm() {
    if (!form.name.trim()) { alert('이름을 입력하세요'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/affiliate-engine/sources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setSources(prev => [data, ...prev]);
      setForm(emptyForm);
      setShowForm(false);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">🔌 소스 레지스트리</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-xl font-semibold"
        >
          {showForm ? '닫기' : '+ 소스 추가'}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        제휴 엔진이 상품/트렌드를 발굴할 소스 목록. CONNECTED만 실제로 자동 실행되고,
        나머지는 REFERENCE_ONLY(수동 URL 입력만) 또는 REQUIRES_API_KEY(키 설정 전까지 비활성)로 표시됩니다.
      </p>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 mb-4">{error}</div>}

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 space-y-3">
          <input
            placeholder="소스 이름 (예: TikTok Creative Center)"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.source_type} onChange={e => setForm(f => ({ ...f, source_type: e.target.value }))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
              {SOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="국가 (KR/GLOBAL 등)" value={form.country}
              onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">usage_mode</label>
              <select value={form.usage_mode} onChange={e => setForm(f => ({ ...f, usage_mode: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                {USAGE_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">connector_status</label>
              <select value={form.connector_status} onChange={e => setForm(f => ({ ...f, connector_status: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                {CONNECTOR_STATUSES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <textarea placeholder="메모 (약관/제약/향후 연동 계획 등)" value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
          <button onClick={submitForm} disabled={saving}
            className="w-full py-2 bg-blue-500 text-white text-sm rounded-xl font-semibold disabled:opacity-50">
            {saving ? '저장 중...' : '추가'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">불러오는 중...</div>
      ) : sources.length === 0 ? (
        <div className="text-center text-gray-400 py-12 text-sm">등록된 소스가 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {sources.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{s.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {s.source_type}{s.country ? ` · ${s.country}` : ''} · 우선순위 {s.priority}
                  </div>
                </div>
                <button
                  onClick={() => toggleEnabled(s)}
                  className={`shrink-0 px-3 py-1 text-xs rounded-full font-semibold ${s.enabled ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}
                >
                  {s.enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${CONNECTOR_BADGE[s.connector_status] || 'bg-gray-100 text-gray-600'}`}>
                  {s.connector_status}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                  {s.usage_mode}
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${HEALTH_BADGE[s.health_status] || 'bg-gray-100 text-gray-600'}`}>
                  {s.health_status}
                </span>
                {s.media_download_allowed && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
                    미디어 다운로드 가능
                  </span>
                )}
              </div>

              {s.notes && <p className="text-xs text-gray-500 mt-2 leading-relaxed">{s.notes}</p>}

              <div className="flex justify-end mt-2">
                <button onClick={() => remove(s.id)} className="text-xs text-red-500">삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
