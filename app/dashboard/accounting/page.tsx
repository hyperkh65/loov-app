'use client';

import { useState, useEffect, useRef, useCallback, DragEvent, Fragment } from 'react';

interface Attachment {
  url: string;
  name: string;
  size: number;
  type: string;
}

interface AccountEntry {
  id: string;
  user_id: string;
  type: 'income' | 'expense';
  amount: number;
  account_category: string;
  description: string | null;
  date: string;
  memo: string | null;
  attachments: Attachment[];
  created_at: string;
  updated_at: string | null;
}

interface MonthStat {
  month: number;
  income: number;
  expense: number;
}

const INCOME_CATEGORIES = [
  { label: '매출', value: '매출', keywords: ['판매', '매출', '수익', '매출액', '영업수입'] },
  { label: '용역수입', value: '용역수입', keywords: ['용역', '서비스', '컨설팅', '강의료', '외주수입', '프로젝트'] },
  { label: '임대수입', value: '임대수입', keywords: ['임대', '월세수입', '임대료수입'] },
  { label: '이자수입', value: '이자수입', keywords: ['이자', '예금이자'] },
  { label: '배당수입', value: '배당수입', keywords: ['배당', '배당금'] },
  { label: '잡수입', value: '잡수입', keywords: ['기타', '잡수입', '환급', '환불'] },
];

const EXPENSE_CATEGORIES = [
  { label: '급여', value: '급여', keywords: ['급여', '월급', '인건비', '알바', '아르바이트', '직원', '임금', '연봉'] },
  { label: '임차료', value: '임차료', keywords: ['임차', '월세', '임대료', '사무실', '렌탈', '리스'] },
  { label: '광고선전비', value: '광고선전비', keywords: ['광고', '마케팅', '홍보', '네이버광고', '구글광고', '인스타', '유튜브광고'] },
  { label: '복리후생비', value: '복리후생비', keywords: ['복리', '식대', '식비', '직원식사', '간식', '커피', '명절'] },
  { label: '접대비', value: '접대비', keywords: ['접대', '거래처', '거래처식사', '거래처선물', '미팅'] },
  { label: '소모품비', value: '소모품비', keywords: ['소모품', '문구', '사무용품', '토너', '용지'] },
  { label: '통신비', value: '통신비', keywords: ['통신', '인터넷', '전화', '핸드폰', '휴대폰', '통화료'] },
  { label: '교통비', value: '교통비', keywords: ['교통', '택시', '주유', '기름', '버스', '지하철', 'KTX', '주차', '통행료'] },
  { label: '외주비', value: '외주비', keywords: ['외주', '프리랜서', '도급', '하청', '개발비', '디자인비'] },
  { label: '수수료', value: '수수료', keywords: ['수수료', '카드수수료', '플랫폼수수료', '은행수수료'] },
  { label: '보험료', value: '보험료', keywords: ['보험', '화재보험', '자동차보험', '4대보험', '산재'] },
  { label: '세금과공과', value: '세금과공과', keywords: ['세금', '부가세', '소득세', '법인세', '재산세', '과태료'] },
  { label: '전기수도세', value: '전기수도세', keywords: ['전기', '수도', '가스', '전기요금', '수도요금', '도시가스'] },
  { label: '수선비', value: '수선비', keywords: ['수선', '수리', '수리비', 'AS', '점검', '유지보수'] },
  { label: '운반비', value: '운반비', keywords: ['운반', '택배', '배달', '배송', '물류', '배송비'] },
  { label: '도서인쇄비', value: '도서인쇄비', keywords: ['도서', '책', '인쇄', '명함', '팜플렛'] },
  { label: '교육훈련비', value: '교육훈련비', keywords: ['교육', '훈련', '강의', '세미나', '연수', '교육비'] },
  { label: '이자비용', value: '이자비용', keywords: ['이자비용', '대출이자', '금융비용'] },
  { label: '잡비', value: '잡비', keywords: ['기타', '잡비', '기타비용', '기타경비'] },
];

function suggestCategory(description: string, type: 'income' | 'expense'): string {
  if (!description.trim()) return '';
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const lower = description.toLowerCase();
  for (const cat of categories) {
    if (cat.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return cat.value;
    }
  }
  return '';
}

function formatAmount(value: string): string {
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toLocaleString('ko-KR');
}

function parseAmount(value: string): number {
  return parseFloat(value.replace(/,/g, '')) || 0;
}

function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

export default function AccountingPage() {
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [monthlyStats, setMonthlyStats] = useState<MonthStat[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AccountEntry | null>(null);

  const [formType, setFormType] = useState<'income' | 'expense'>('income');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formDate, setFormDate] = useState(todayString());
  const [formMemo, setFormMemo] = useState('');
  const [formAttachments, setFormAttachments] = useState<Attachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [suggestedCategory, setSuggestedCategory] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const [expandedAttachments, setExpandedAttachments] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const userChangedCategory = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (month !== null) params.set('month', String(month));
      if (typeFilter !== 'all') params.set('type', typeFilter);

      const res = await fetch(`/api/accounting/entries?${params}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || '불러오기 실패'); return; }
      setEntries(json.items || []);
      setTotalIncome(json.totalIncome || 0);
      setTotalExpense(json.totalExpense || 0);
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }, [year, month, typeFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounting/stats?year=${year}`);
      const json = await res.json();
      if (res.ok) setMonthlyStats(json.monthly || []);
    } catch {}
  }, [year]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Client-side filtering
  const filteredEntries = entries.filter((e) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inDesc = e.description?.toLowerCase().includes(q) ?? false;
      const inMemo = e.memo?.toLowerCase().includes(q) ?? false;
      if (!inDesc && !inMemo) return false;
    }
    if (categoryFilter && e.account_category !== categoryFilter) return false;
    return true;
  });

  const isFiltered = searchQuery || categoryFilter;
  const displayIncome = isFiltered
    ? filteredEntries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
    : totalIncome;
  const displayExpense = isFiltered
    ? filteredEntries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
    : totalExpense;
  const netProfit = displayIncome - displayExpense;

  // Category breakdown from filtered entries
  const categoryTotals = filteredEntries.reduce((acc, e) => {
    if (!acc[e.account_category]) acc[e.account_category] = { income: 0, expense: 0 };
    acc[e.account_category][e.type] += e.amount;
    return acc;
  }, {} as Record<string, { income: number; expense: number }>);

  const incomeByCategory = Object.entries(categoryTotals)
    .filter(([, v]) => v.income > 0)
    .sort((a, b) => b[1].income - a[1].income);
  const expenseByCategory = Object.entries(categoryTotals)
    .filter(([, v]) => v.expense > 0)
    .sort((a, b) => b[1].expense - a[1].expense);

  // Unique categories available in current entries (for filter dropdown)
  const availableCategories = [...new Set(entries.map((e) => e.account_category))].sort();

  // Monthly chart data
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const found = monthlyStats.find((m) => m.month === i + 1);
    return { month: i + 1, income: found?.income || 0, expense: found?.expense || 0 };
  });
  const maxChartVal = Math.max(...chartData.flatMap((d) => [d.income, d.expense]), 1);

  const formCategories = formType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function openAddModal() {
    setEditingEntry(null);
    setFormType('income');
    setFormAmount('');
    setFormDescription('');
    setFormCategory('');
    setFormDate(todayString());
    setFormMemo('');
    setFormAttachments([]);
    setFormError('');
    setSuggestedCategory('');
    userChangedCategory.current = false;
    setShowModal(true);
  }

  function openEditModal(entry: AccountEntry) {
    setEditingEntry(entry);
    setFormType(entry.type);
    setFormAmount(formatAmount(String(entry.amount)));
    setFormDescription(entry.description || '');
    setFormCategory(entry.account_category);
    setFormDate(entry.date);
    setFormMemo(entry.memo || '');
    setFormAttachments(entry.attachments || []);
    setFormError('');
    setSuggestedCategory('');
    userChangedCategory.current = false;
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingEntry(null);
    setFormError('');
  }

  function handleDescriptionChange(val: string) {
    setFormDescription(val);
    const suggestion = suggestCategory(val, formType);
    setSuggestedCategory(suggestion);
    if (suggestion && !userChangedCategory.current) {
      setFormCategory(suggestion);
    }
  }

  function handleTypeChange(t: 'income' | 'expense') {
    setFormType(t);
    setFormCategory('');
    userChangedCategory.current = false;
    const suggestion = suggestCategory(formDescription, t);
    setSuggestedCategory(suggestion);
    if (suggestion) setFormCategory(suggestion);
  }

  function handleCategoryChange(val: string) {
    setFormCategory(val);
    userChangedCategory.current = true;
  }

  async function handleFileUpload(file: File) {
    setUploadingFile(true);
    setFormError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/accounting/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { setFormError(json.error || '파일 업로드 실패'); return; }
      setFormAttachments((prev) => [...prev, { url: json.url, name: json.name, size: json.size, type: json.type }]);
    } catch {
      setFormError('파일 업로드 중 오류가 발생했습니다');
    } finally {
      setUploadingFile(false);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(handleFileUpload);
    e.target.value = '';
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (!files) return;
    Array.from(files).forEach(handleFileUpload);
  }

  function removeAttachment(index: number) {
    setFormAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!formAmount || parseAmount(formAmount) <= 0) { setFormError('금액을 입력해주세요'); return; }
    if (!formCategory) { setFormError('계정과목을 선택해주세요'); return; }
    if (!formDate) { setFormError('날짜를 입력해주세요'); return; }

    setSubmitting(true);
    setFormError('');

    const payload = {
      type: formType,
      amount: parseAmount(formAmount),
      account_category: formCategory,
      description: formDescription || null,
      date: formDate,
      memo: formMemo || null,
      attachments: formAttachments,
    };

    try {
      let res: Response;
      if (editingEntry) {
        res = await fetch('/api/accounting/entries', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingEntry.id, ...payload }),
        });
      } else {
        res = await fetch('/api/accounting/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok) { setFormError(json.error || '저장 실패'); return; }

      closeModal();
      fetchEntries();
      fetchStats();
    } catch {
      setFormError('네트워크 오류가 발생했습니다');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 거래 내역을 삭제하시겠습니까?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/accounting/entries?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { alert(json.error || '삭제 실패'); return; }
      fetchEntries();
      fetchStats();
    } catch {
      alert('삭제 중 오류가 발생했습니다');
    } finally {
      setDeletingId(null);
    }
  }

  function exportCSV() {
    const rows = [['날짜', '유형', '계정과목', '적요', '금액', '메모']];
    filteredEntries.forEach((e) => {
      rows.push([
        e.date,
        e.type === 'income' ? '수입' : '지출',
        e.account_category,
        e.description || '',
        String(e.amount),
        e.memo || '',
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `회계장부_${year}${month ? `_${String(month).padStart(2, '0')}월` : '년'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleAttachments(id: string) {
    setExpandedAttachments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* 헤더 */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📒</span>
            <div>
              <h1 className="text-xl font-black text-white">자동 회계장부</h1>
              <p className="text-xs text-slate-400">수입/지출을 자동으로 분류하고 관리합니다</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              disabled={loading || filteredEntries.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-all disabled:opacity-40"
            >
              <span>📥</span> CSV
            </button>
            <button
              onClick={openAddModal}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
            >
              <span>+</span> 거래 추가
            </button>
          </div>
        </div>

        {/* 연도 + 월 탭 */}
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setYear((y) => y - 1)}
              className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 flex items-center justify-center transition-all font-bold"
            >
              ‹
            </button>
            <span className="text-base font-black text-white min-w-16 text-center">{year}년</span>
            <button
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= currentYear}
              className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 flex items-center justify-center transition-all font-bold disabled:opacity-30"
            >
              ›
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
              <button
                key={m ?? 'all'}
                onClick={() => setMonth(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  month === m
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                {m === null ? '전체' : `${m}월`}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {(['all', 'income', 'expense'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  typeFilter === t
                    ? t === 'income'
                      ? 'bg-emerald-600 text-white'
                      : t === 'expense'
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                {t === 'all' ? '전체 유형' : t === 'income' ? '수입만' : '지출만'}
              </button>
            ))}
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-900/60 border border-emerald-500/20 rounded-2xl p-4">
            <div className="text-xs text-slate-400 mb-1">💰 총 수입</div>
            <div className="text-lg font-black text-emerald-400">₩{formatKRW(displayIncome)}</div>
            {isFiltered && totalIncome !== displayIncome && (
              <div className="text-[10px] text-slate-500 mt-0.5">전체 ₩{formatKRW(totalIncome)}</div>
            )}
          </div>
          <div className="bg-slate-900/60 border border-red-500/20 rounded-2xl p-4">
            <div className="text-xs text-slate-400 mb-1">💸 총 지출</div>
            <div className="text-lg font-black text-red-400">₩{formatKRW(displayExpense)}</div>
            {isFiltered && totalExpense !== displayExpense && (
              <div className="text-[10px] text-slate-500 mt-0.5">전체 ₩{formatKRW(totalExpense)}</div>
            )}
          </div>
          <div className={`bg-slate-900/60 border rounded-2xl p-4 ${netProfit >= 0 ? 'border-indigo-500/20' : 'border-orange-500/20'}`}>
            <div className="text-xs text-slate-400 mb-1">📊 순이익</div>
            <div className={`text-lg font-black ${netProfit >= 0 ? 'text-indigo-400' : 'text-orange-400'}`}>
              {netProfit >= 0 ? '' : '-'}₩{formatKRW(Math.abs(netProfit))}
            </div>
          </div>
        </div>

        {/* 월별 차트 */}
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-bold text-white">{year}년 월별 수입/지출</div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                수입
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
                지출
              </span>
            </div>
          </div>
          <div className="flex items-end gap-1 h-32">
            {chartData.map((d, i) => {
              const incomeH = (d.income / maxChartVal) * 100;
              const expenseH = (d.expense / maxChartVal) * 100;
              const isSelected = month === i + 1;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full flex items-end gap-0.5 h-28 cursor-pointer rounded-t group`}
                    onClick={() => setMonth(month === i + 1 ? null : i + 1)}
                    title={`${i + 1}월 수입 ₩${formatKRW(d.income)} / 지출 ₩${formatKRW(d.expense)}`}
                  >
                    <div
                      className={`flex-1 rounded-t-sm transition-all duration-200 ${isSelected ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'} bg-emerald-500`}
                      style={{ height: `${Math.max(incomeH, 2)}%`, minHeight: d.income > 0 ? '3px' : '0' }}
                    />
                    <div
                      className={`flex-1 rounded-t-sm transition-all duration-200 ${isSelected ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'} bg-red-500`}
                      style={{ height: `${Math.max(expenseH, 2)}%`, minHeight: d.expense > 0 ? '3px' : '0' }}
                    />
                  </div>
                  <div className={`text-[10px] transition-colors ${isSelected ? 'text-white font-bold' : 'text-slate-500'}`}>
                    {i + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 계정과목별 집계 */}
        {(incomeByCategory.length > 0 || expenseByCategory.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {incomeByCategory.length > 0 && typeFilter !== 'expense' && (
              <div className="bg-slate-900/60 border border-emerald-500/10 rounded-2xl p-4">
                <div className="text-sm font-bold text-emerald-400 mb-3">수입 계정과목별</div>
                <div className="space-y-2.5">
                  {incomeByCategory.map(([cat, totals]) => (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <button
                          onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
                          className={`transition-colors ${categoryFilter === cat ? 'text-emerald-300 font-bold' : 'text-slate-300 hover:text-emerald-300'}`}
                        >
                          {cat}
                        </button>
                        <span className="text-emerald-400 font-semibold tabular-nums">
                          ₩{formatKRW(totals.income)}
                          <span className="text-slate-500 font-normal ml-1">
                            ({displayIncome > 0 ? Math.round((totals.income / displayIncome) * 100) : 0}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${displayIncome > 0 ? (totals.income / displayIncome) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {expenseByCategory.length > 0 && typeFilter !== 'income' && (
              <div className="bg-slate-900/60 border border-red-500/10 rounded-2xl p-4">
                <div className="text-sm font-bold text-red-400 mb-3">지출 계정과목별</div>
                <div className="space-y-2.5">
                  {expenseByCategory.map(([cat, totals]) => (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <button
                          onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
                          className={`transition-colors ${categoryFilter === cat ? 'text-red-300 font-bold' : 'text-slate-300 hover:text-red-300'}`}
                        >
                          {cat}
                        </button>
                        <span className="text-red-400 font-semibold tabular-nums">
                          ₩{formatKRW(totals.expense)}
                          <span className="text-slate-500 font-normal ml-1">
                            ({displayExpense > 0 ? Math.round((totals.expense / displayExpense) * 100) : 0}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500 rounded-full transition-all duration-500"
                          style={{ width: `${displayExpense > 0 ? (totals.expense / displayExpense) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 검색 + 카테고리 필터 */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="적요, 메모 검색..."
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-9 pr-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm"
              >
                ✕
              </button>
            )}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none min-w-36"
          >
            <option value="">모든 계정과목</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          {(searchQuery || categoryFilter) && (
            <button
              onClick={() => { setSearchQuery(''); setCategoryFilter(''); }}
              className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-all"
            >
              초기화
            </button>
          )}
          {isFiltered && (
            <div className="flex items-center px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
              {filteredEntries.length}건
            </div>
          )}
        </div>

        {/* 오류 */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 테이블 (데스크탑) */}
        <div className="hidden md:block bg-slate-900/60 border border-slate-700/50 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
              불러오는 중...
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <span className="text-4xl">📭</span>
              <div className="text-sm">
                {isFiltered ? '검색 결과가 없습니다' : '거래 내역이 없습니다'}
              </div>
              {!isFiltered && (
                <button onClick={openAddModal} className="text-indigo-400 text-sm hover:text-indigo-300 transition-colors">
                  + 첫 거래를 추가해보세요
                </button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50 text-xs text-slate-400 font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">날짜</th>
                  <th className="px-4 py-3 text-left">유형</th>
                  <th className="px-4 py-3 text-left">계정과목</th>
                  <th className="px-4 py-3 text-left">적요</th>
                  <th className="px-4 py-3 text-left">메모</th>
                  <th className="px-4 py-3 text-right">금액</th>
                  <th className="px-4 py-3 text-center">첨부</th>
                  <th className="px-4 py-3 text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors group">
                      <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">
                        {entry.date.slice(5).replace('-', '/')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                          entry.type === 'income'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-red-500/15 text-red-400'
                        }`}>
                          {entry.type === 'income' ? '수입' : '지출'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{entry.account_category}</td>
                      <td className="px-4 py-3 text-sm text-slate-400 max-w-[180px] truncate">
                        {entry.description || <span className="text-slate-600">-</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 max-w-[140px] truncate">
                        {entry.memo || <span className="text-slate-700">-</span>}
                      </td>
                      <td className={`px-4 py-3 text-sm font-bold text-right whitespace-nowrap ${
                        entry.type === 'income' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {entry.type === 'income' ? '+' : '-'}₩{formatKRW(entry.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {entry.attachments && entry.attachments.length > 0 ? (
                          <button
                            onClick={() => toggleAttachments(entry.id)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10"
                          >
                            📎 {entry.attachments.length}
                          </button>
                        ) : (
                          <span className="text-slate-700 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditModal(entry)}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            disabled={deletingId === entry.id}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all disabled:opacity-50"
                          >
                            {deletingId === entry.id ? '...' : '삭제'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedAttachments.has(entry.id) && entry.attachments && entry.attachments.length > 0 && (
                      <tr className="bg-slate-800/30 border-b border-slate-800/60">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {entry.attachments.map((att, i) => (
                              <a
                                key={i}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-xs text-slate-300 transition-all group"
                              >
                                <span className="text-sm">
                                  {att.type?.startsWith('image/') ? '🖼️' : '📄'}
                                </span>
                                <span className="max-w-xs truncate group-hover:text-white">{att.name}</span>
                                <span className="text-slate-500 flex-shrink-0">{formatFileSize(att.size)}</span>
                              </a>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 카드 (모바일) */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-3" />
              불러오는 중...
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <span className="text-4xl">📭</span>
              <div className="text-sm">
                {isFiltered ? '검색 결과가 없습니다' : '거래 내역이 없습니다'}
              </div>
              {!isFiltered && (
                <button onClick={openAddModal} className="text-indigo-400 text-sm hover:text-indigo-300">
                  + 첫 거래를 추가해보세요
                </button>
              )}
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <div key={entry.id} className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      entry.type === 'income' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                    }`}>
                      {entry.type === 'income' ? '수입' : '지출'}
                    </span>
                    <span className="text-xs text-slate-400">{entry.account_category}</span>
                  </div>
                  <div className={`text-sm font-black whitespace-nowrap ${
                    entry.type === 'income' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {entry.type === 'income' ? '+' : '-'}₩{formatKRW(entry.amount)}
                  </div>
                </div>
                {entry.description && (
                  <div className="text-sm text-slate-300">{entry.description}</div>
                )}
                {entry.memo && (
                  <div className="text-xs text-slate-500">{entry.memo}</div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{entry.date}</span>
                  <div className="flex items-center gap-2">
                    {entry.attachments && entry.attachments.length > 0 && (
                      <button
                        onClick={() => toggleAttachments(entry.id)}
                        className="text-xs text-indigo-400 font-semibold"
                      >
                        📎 {entry.attachments.length}
                      </button>
                    )}
                    <button
                      onClick={() => openEditModal(entry)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      className="text-xs px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 disabled:opacity-50"
                    >
                      {deletingId === entry.id ? '...' : '삭제'}
                    </button>
                  </div>
                </div>
                {expandedAttachments.has(entry.id) && entry.attachments && entry.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-700/50">
                    {entry.attachments.map((att, i) => (
                      <a
                        key={i}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-700/60 border border-slate-600/50 text-xs text-slate-300"
                      >
                        <span>{att.type?.startsWith('image/') ? '🖼️' : '📄'}</span>
                        <span className="max-w-32 truncate">{att.name}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50 flex-shrink-0">
              <h2 className="text-base font-black text-white">
                {editingEntry ? '거래 수정' : '거래 추가'}
              </h2>
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-all flex items-center justify-center text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800/60 rounded-xl">
                <button
                  onClick={() => handleTypeChange('income')}
                  className={`py-2.5 rounded-lg text-sm font-black transition-all ${
                    formType === 'income'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  💰 수입
                </button>
                <button
                  onClick={() => handleTypeChange('expense')}
                  className={`py-2.5 rounded-lg text-sm font-black transition-all ${
                    formType === 'expense'
                      ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  💸 지출
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">날짜</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">금액 (원)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₩</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formAmount}
                    onChange={(e) => setFormAmount(formatAmount(e.target.value))}
                    placeholder="0"
                    className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-8 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">적요 (거래 내용)</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  placeholder="예: 네이버 광고비 결제"
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">계정과목</label>
                  {suggestedCategory && formCategory === suggestedCategory && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-semibold">
                      자동 분류
                    </span>
                  )}
                </div>
                <select
                  value={formCategory}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors appearance-none"
                >
                  <option value="">계정과목 선택</option>
                  {formCategories.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">메모 (선택)</label>
                <textarea
                  value={formMemo}
                  onChange={(e) => setFormMemo(e.target.value)}
                  placeholder="추가 메모를 입력하세요..."
                  rows={2}
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">첨부파일 (영수증 등)</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl px-4 py-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                    isDragOver
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/40'
                  }`}
                >
                  {uploadingFile ? (
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      업로드 중...
                    </div>
                  ) : (
                    <>
                      <span className="text-2xl">📎</span>
                      <div className="text-xs text-slate-400 text-center">
                        클릭하거나 파일을 끌어다 놓으세요<br />
                        <span className="text-slate-500">최대 50MB</span>
                      </div>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileInput}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  />
                </div>

                {formAttachments.length > 0 && (
                  <div className="space-y-1.5">
                    {formAttachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/50">
                        <span className="text-sm flex-shrink-0">
                          {att.type?.startsWith('image/') ? '🖼️' : '📄'}
                        </span>
                        <span className="text-xs text-slate-300 flex-1 truncate">{att.name}</span>
                        <span className="text-xs text-slate-500 flex-shrink-0">{formatFileSize(att.size)}</span>
                        <button
                          onClick={() => removeAttachment(i)}
                          className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0 text-sm ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {formError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {formError}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-700/50 flex-shrink-0">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-all disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || uploadingFile}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-black transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                  formType === 'income'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/20'
                    : 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/20'
                }`}
              >
                {submitting && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {editingEntry ? '수정 저장' : '거래 추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
