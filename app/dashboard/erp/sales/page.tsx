'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { SalesLead, LeadStatus, LEAD_STATUS_LABEL, LEAD_STATUS_COLOR, ANIMAL_EMOJI } from '@/lib/types';

const STATUSES: LeadStatus[] = ['lead', 'contacted', 'proposal', 'negotiating', 'won', 'lost'];

function fmtMoney(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만원`;
  return `${n.toLocaleString()}원`;
}

// ── 리드 추가 모달 ────────────────────────────────────
function AddLeadModal({ onClose }: { onClose: () => void }) {
  const { addSalesLead, employees } = useStore();
  const [form, setForm] = useState({
    companyName: '', contactName: '', contactEmail: '', phone: '',
    status: 'lead' as LeadStatus, value: '', assignedEmployeeId: '', notes: '',
  });

  const handleSubmit = () => {
    if (!form.companyName.trim()) return;
    addSalesLead({
      id: crypto.randomUUID(),
      ...form,
      value: parseInt(form.value) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">새 영업 리드 추가</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">회사명 *</label>
            <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              placeholder="(주)예시기업" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">담당자명</label>
              <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                placeholder="홍길동" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">연락처</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                placeholder="010-0000-0000" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">이메일</label>
            <input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              placeholder="example@company.com" type="email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">현황</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                {STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">예상 금액 (원)</label>
              <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                placeholder="5000000" type="number" />
            </div>
          </div>
          {employees.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">담당 직원</label>
              <select value={form.assignedEmployeeId} onChange={(e) => setForm({ ...form, assignedEmployeeId: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                <option value="">배정 없음</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">메모</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
              rows={3} placeholder="미팅 내용, 특이사항 등..." />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            취소
          </button>
          <button onClick={handleSubmit} disabled={!form.companyName.trim()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SalesERPPage() {
  const { salesLeads, updateSalesLead, removeSalesLead, employees } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  const filtered = filterStatus === 'all' ? salesLeads : salesLeads.filter((l) => l.status === filterStatus);

  const totalValue = salesLeads.filter((l) => l.status === 'won').reduce((s, l) => s + l.value, 0);
  const pipelineValue = salesLeads.filter((l) => !['won', 'lost'].includes(l.status)).reduce((s, l) => s + l.value, 0);

  return (
    <div className="min-h-full">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">📊 영업 ERP</h1>
            <p className="text-sm text-gray-400">영업 파이프라인 및 리드 관리</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setViewMode('kanban')} className={`px-3 py-1.5 text-sm transition-colors ${viewMode === 'kanban' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>칸반</button>
              <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 text-sm transition-colors ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>목록</button>
            </div>
            <button onClick={() => setShowAdd(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors">
              + 리드 추가
            </button>
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* 통계 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: '전체 리드', value: salesLeads.length, color: 'text-gray-900' },
            { label: '진행 중', value: salesLeads.filter((l) => !['won', 'lost'].includes(l.status)).length, color: 'text-blue-600' },
            { label: '수주 금액', value: totalValue > 0 ? fmtMoney(totalValue) : '₩0', color: 'text-emerald-600' },
            { label: '파이프라인', value: pipelineValue > 0 ? fmtMoney(pipelineValue) : '₩0', color: 'text-indigo-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-sm text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        {salesLeads.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-gray-100">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-xl font-bold text-gray-700 mb-2">첫 영업 리드를 추가하세요</h2>
            <p className="text-gray-400 mb-6">잠재 고객 정보를 등록하고 AI 영업팀장이 관리하도록 지시하세요.</p>
            <button onClick={() => setShowAdd(true)} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">
              + 리드 추가하기
            </button>
          </div>
        ) : viewMode === 'kanban' ? (
          /* 칸반 뷰 */
          <div className="grid grid-cols-6 gap-3 overflow-x-auto">
            {STATUSES.map((status) => {
              const leads = salesLeads.filter((l) => l.status === status);
              const columnValue = leads.reduce((s, l) => s + l.value, 0);
              return (
                <div key={status} className="min-w-[180px]">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${LEAD_STATUS_COLOR[status]}`}>
                      {LEAD_STATUS_LABEL[status]}
                    </span>
                    <span className="text-xs text-gray-400">{leads.length}</span>
                  </div>
                  <div className="space-y-2">
                    {leads.map((lead) => {
                      const emp = employees.find((e) => e.id === lead.assignedEmployeeId);
                      return (
                        <div key={lead.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm hover:shadow-md transition-shadow">
                          <div className="font-semibold text-sm text-gray-800 mb-1 truncate">{lead.companyName}</div>
                          {lead.contactName && <div className="text-xs text-gray-400 mb-1">{lead.contactName}</div>}
                          {lead.value > 0 && (
                            <div className="text-xs font-bold text-emerald-600 mb-2">{fmtMoney(lead.value)}</div>
                          )}
                          {emp && (
                            <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-2">
                              <span>{ANIMAL_EMOJI[emp.animal]}</span>
                              <span>{emp.name}</span>
                            </div>
                          )}
                          <select
                            value={lead.status}
                            onChange={(e) => updateSalesLead(lead.id, { status: e.target.value as LeadStatus })}
                            className="w-full text-[10px] border border-gray-100 rounded-lg px-1.5 py-1 text-gray-500 focus:outline-none">
                            {STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
                          </select>
                        </div>
                      );
                    })}
                    {leads.length === 0 && (
                      <div className="text-center py-4 text-xs text-gray-300 border-2 border-dashed border-gray-100 rounded-xl">
                        없음
                      </div>
                    )}
                  </div>
                  {columnValue > 0 && (
                    <div className="mt-2 text-xs text-center text-gray-400 font-medium">
                      합계 {fmtMoney(columnValue)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* 목록 뷰 */
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">회사명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">담당자</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">현황</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">금액</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">담당직원</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((lead) => {
                  const emp = employees.find((e) => e.id === lead.assignedEmployeeId);
                  return (
                    <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-gray-800">{lead.companyName}</div>
                        {lead.contactEmail && <div className="text-xs text-gray-400">{lead.contactEmail}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-gray-700">{lead.contactName || '-'}</div>
                        {lead.phone && <div className="text-xs text-gray-400">{lead.phone}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        <select
                          value={lead.status}
                          onChange={(e) => updateSalesLead(lead.id, { status: e.target.value as LeadStatus })}
                          className={`text-xs font-bold px-2 py-1 rounded-lg border focus:outline-none ${LEAD_STATUS_COLOR[lead.status]}`}>
                          {STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABEL[s]}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-emerald-600">
                          {lead.value > 0 ? fmtMoney(lead.value) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {emp ? (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <span>{ANIMAL_EMOJI[emp.animal]}</span>
                            <span>{emp.name}</span>
                          </div>
                        ) : <span className="text-xs text-gray-300">미배정</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => removeSalesLead(lead.id)} className="text-red-400 hover:text-red-600 text-xs transition-colors">
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
