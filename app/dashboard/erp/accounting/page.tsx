'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { AccountingEntry, INCOME_CATEGORIES, EXPENSE_CATEGORIES, ANIMAL_EMOJI } from '@/lib/types';

function fmtMoney(n: number) {
  return `₩${n.toLocaleString()}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
}

// ── 항목 추가 모달 ────────────────────────────────────
function AddEntryModal({ onClose }: { onClose: () => void }) {
  const { addAccountingEntry, employees } = useStore();
  const [form, setForm] = useState({
    type: 'income' as 'income' | 'expense',
    category: '',
    description: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    assignedEmployeeId: '',
    invoiceNumber: '',
    isRecurring: false,
    tags: '',
  });

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleSubmit = () => {
    if (!form.description.trim() || !form.amount) return;
    addAccountingEntry({
      id: crypto.randomUUID(),
      type: form.type,
      category: form.category || categories[0],
      description: form.description,
      amount: parseInt(form.amount) || 0,
      date: form.date,
      assignedEmployeeId: form.assignedEmployeeId || undefined,
      invoiceNumber: form.invoiceNumber || undefined,
      isRecurring: form.isRecurring,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">회계 항목 추가</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* 수입/지출 탭 */}
        <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-4">
          <button onClick={() => setForm({ ...form, type: 'income', category: '' })}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${form.type === 'income' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            + 수입
          </button>
          <button onClick={() => setForm({ ...form, type: 'expense', category: '' })}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${form.type === 'expense' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            - 지출
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">카테고리</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">날짜</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">내용 *</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              placeholder="항목 설명..." />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">금액 (원) *</label>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              placeholder="1000000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">인보이스 번호</label>
              <input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                placeholder="INV-001" />
            </div>
            {employees.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">담당 직원</label>
                <select value={form.assignedEmployeeId} onChange={(e) => setForm({ ...form, assignedEmployeeId: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">없음</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isRecurring} onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
              className="rounded" />
            <span className="text-sm text-gray-600">반복 항목 (매월)</span>
          </label>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">취소</button>
          <button onClick={handleSubmit} disabled={!form.description.trim() || !form.amount}
            className={`flex-1 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold transition-colors ${
              form.type === 'income' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-500 hover:bg-red-400'
            }`}>
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountingERPPage() {
  const { accountingEntries, removeAccountingEntry, employees } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

  const monthEntries = accountingEntries.filter((e) => e.date.startsWith(filterMonth));
  const filtered = filterType === 'all' ? monthEntries : monthEntries.filter((e) => e.type === filterType);

  const income = monthEntries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const expense = monthEntries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const profit = income - expense;

  // 카테고리별 집계
  const categoryMap: Record<string, { income: number; expense: number }> = {};
  monthEntries.forEach((e) => {
    if (!categoryMap[e.category]) categoryMap[e.category] = { income: 0, expense: 0 };
    categoryMap[e.category][e.type] += e.amount;
  });
  const topCategories = Object.entries(categoryMap)
    .sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense))
    .slice(0, 5);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">💰 회계 ERP</h1>
            <p className="text-sm text-gray-400">수입/지출 관리 및 재무 보고</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            <button onClick={() => setShowAdd(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold text-sm">
              + 항목 추가
            </button>
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* 월간 요약 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-emerald-100 p-5">
            <div className="text-sm text-gray-500 mb-1">총 수입</div>
            <div className="text-2xl font-black text-emerald-600">{fmtMoney(income)}</div>
            <div className="text-xs text-gray-400 mt-1">
              {monthEntries.filter((e) => e.type === 'income').length}건
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-red-100 p-5">
            <div className="text-sm text-gray-500 mb-1">총 지출</div>
            <div className="text-2xl font-black text-red-500">{fmtMoney(expense)}</div>
            <div className="text-xs text-gray-400 mt-1">
              {monthEntries.filter((e) => e.type === 'expense').length}건
            </div>
          </div>
          <div className={`bg-white rounded-2xl border p-5 ${profit >= 0 ? 'border-blue-100' : 'border-orange-100'}`}>
            <div className="text-sm text-gray-500 mb-1">순이익</div>
            <div className={`text-2xl font-black ${profit >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
              {profit >= 0 ? '' : '-'}{fmtMoney(Math.abs(profit))}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {income > 0 ? `마진율 ${Math.round((profit / income) * 100)}%` : '수입 없음'}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* 거래 내역 */}
          <div className="lg:col-span-2">
            {/* 필터 탭 */}
            <div className="flex gap-2 mb-4">
              {[['all', '전체'], ['income', '수입'], ['expense', '지출']].map(([v, l]) => (
                <button key={v} onClick={() => setFilterType(v as typeof filterType)}
                  className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                    filterType === v ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>{l}</button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 py-24 text-center">
                <div className="text-5xl mb-4">💰</div>
                <h2 className="text-xl font-bold text-gray-700 mb-2">이번달 거래 내역이 없습니다</h2>
                <button onClick={() => setShowAdd(true)} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm mt-2">
                  + 항목 추가
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">날짜</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">카테고리</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">내용</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">금액</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.sort((a, b) => b.date.localeCompare(a.date)).map((entry) => {
                      const emp = employees.find((e) => e.id === entry.assignedEmployeeId);
                      return (
                        <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(entry.date)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                              entry.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                            }`}>{entry.category}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-gray-800 font-medium">{entry.description}</div>
                            {emp && <div className="text-xs text-gray-400 flex items-center gap-1">{ANIMAL_EMOJI[emp.animal]} {emp.name}</div>}
                            {entry.invoiceNumber && <div className="text-xs text-gray-400">#{entry.invoiceNumber}</div>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold ${entry.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                              {entry.type === 'income' ? '+' : '-'}{fmtMoney(entry.amount)}
                            </span>
                            {entry.isRecurring && <div className="text-[10px] text-gray-400">반복</div>}
                          </td>
                          <td className="px-4 py-3">
                            <button onClick={() => removeAccountingEntry(entry.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 카테고리 분석 */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">카테고리별 집계</h3>
              {topCategories.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">데이터 없음</p>
              ) : (
                <div className="space-y-3">
                  {topCategories.map(([cat, vals]) => {
                    const total = vals.income + vals.expense;
                    const maxVal = Math.max(...topCategories.map(([, v]) => v.income + v.expense));
                    const pct = maxVal > 0 ? (total / maxVal) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-gray-700 font-medium truncate">{cat}</span>
                          <span className="text-gray-500 text-xs ml-2 flex-shrink-0">{fmtMoney(total)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 세금 알림 */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <h3 className="font-bold text-amber-800 mb-3">📋 세금 일정 안내</h3>
              <div className="space-y-2 text-sm">
                {[
                  { label: '부가세 신고', date: '1월 25일 / 7월 25일' },
                  { label: '종합소득세', date: '5월 31일' },
                  { label: '4대보험료', date: '매월 10일' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-amber-700">{item.label}</span>
                    <span className="text-amber-500 text-xs">{item.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAdd && <AddEntryModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
