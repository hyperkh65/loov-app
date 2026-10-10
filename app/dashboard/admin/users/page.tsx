'use client';

import { useEffect, useState, useCallback } from 'react';

type Plan = 'free' | 'pro' | 'business';

interface UserRow {
  user_id: string;
  email: string;
  joined_at: string;
  last_sign_in: string | null;
  plan: Plan;
  plan_start_at: string | null;
  plan_expires_at: string | null;
  plan_billing_day: number;
  plan_memo: string;
  settings_updated_at: string | null;
}

const PLAN_COLORS: Record<Plan, string> = {
  free: 'bg-gray-600 text-gray-200',
  pro: 'bg-blue-600 text-white',
  business: 'bg-purple-600 text-white',
};

function formatDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
}

function toInputDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<UserRow>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 403) {
        showToast('접근 권한이 없습니다');
        return;
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      showToast('유저 목록 로딩 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const startEdit = (u: UserRow) => {
    setEditing(u.user_id);
    setEditForm({
      plan: u.plan,
      plan_start_at: u.plan_start_at,
      plan_expires_at: u.plan_expires_at,
      plan_billing_day: u.plan_billing_day || 1,
      plan_memo: u.plan_memo || '',
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditForm({});
  };

  const saveEdit = async (userId: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, ...editForm }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('저장 완료');
        setEditing(null);
        await loadUsers();
      } else {
        showToast(data.error || '저장 실패');
      }
    } catch {
      showToast('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.plan.includes(search)
  );

  const counts = {
    total: users.length,
    free: users.filter(u => u.plan === 'free').length,
    pro: users.filter(u => u.plan === 'pro').length,
    business: users.filter(u => u.plan === 'business').length,
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">👥 회원 관리</h1>
        <button onClick={loadUsers} className="text-sm text-gray-400 hover:text-white transition">
          새로고침
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '전체', value: counts.total, color: 'text-white' },
          { label: 'Free', value: counts.free, color: 'text-gray-400' },
          { label: 'Pro', value: counts.pro, color: 'text-blue-400' },
          { label: 'Business', value: counts.business, color: 'text-purple-400' },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 검색 */}
      <input
        type="text"
        placeholder="이메일 또는 플랜 검색..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500"
      />

      {/* 유저 테이블 */}
      <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400 text-xs">
              <th className="text-left px-4 py-3">이메일</th>
              <th className="text-left px-4 py-3">플랜</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">시작일</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">만료일</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">결제일</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">가입일</th>
              <th className="text-right px-4 py-3">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <>
                <tr key={u.user_id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition">
                  <td className="px-4 py-3 text-white">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[u.plan]}`}>
                      {u.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{formatDate(u.plan_start_at)}</td>
                  <td className="px-4 py-3 text-gray-400 hidden md:table-cell">{formatDate(u.plan_expires_at)}</td>
                  <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">
                    {u.plan !== 'free' ? `매월 ${u.plan_billing_day}일` : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">{formatDate(u.joined_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {editing === u.user_id ? (
                      <span className="text-gray-500 text-xs">편집 중</span>
                    ) : (
                      <button
                        onClick={() => startEdit(u)}
                        className="text-xs text-blue-400 hover:text-blue-300 transition"
                      >
                        설정
                      </button>
                    )}
                  </td>
                </tr>

                {/* 인라인 편집 폼 */}
                {editing === u.user_id && (
                  <tr key={`edit-${u.user_id}`} className="bg-gray-700/40 border-b border-gray-700">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {/* 플랜 */}
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">플랜</label>
                          <select
                            value={editForm.plan || 'free'}
                            onChange={e => setEditForm(f => ({ ...f, plan: e.target.value as Plan }))}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm outline-none"
                          >
                            <option value="free">Free</option>
                            <option value="pro">Pro</option>
                            <option value="business">Business</option>
                          </select>
                        </div>

                        {/* 시작일 */}
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">시작일</label>
                          <input
                            type="date"
                            value={toInputDate(editForm.plan_start_at ?? null)}
                            onChange={e => setEditForm(f => ({ ...f, plan_start_at: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm outline-none"
                          />
                        </div>

                        {/* 만료일 */}
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">만료일</label>
                          <input
                            type="date"
                            value={toInputDate(editForm.plan_expires_at ?? null)}
                            onChange={e => setEditForm(f => ({ ...f, plan_expires_at: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm outline-none"
                          />
                        </div>

                        {/* 매월 결제일 */}
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">매월 결제일</label>
                          <input
                            type="number"
                            min={1}
                            max={28}
                            value={editForm.plan_billing_day || 1}
                            onChange={e => setEditForm(f => ({ ...f, plan_billing_day: parseInt(e.target.value) || 1 }))}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm outline-none"
                          />
                        </div>

                        {/* 메모 */}
                        <div className="col-span-2 md:col-span-4">
                          <label className="text-xs text-gray-400 block mb-1">메모 (입금자명, 연락처 등)</label>
                          <input
                            type="text"
                            value={editForm.plan_memo || ''}
                            onChange={e => setEditForm(f => ({ ...f, plan_memo: e.target.value }))}
                            placeholder="예: 홍길동 / 010-1234-5678 / 2026-04-07 입금확인"
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => saveEdit(u.user_id)}
                          disabled={saving}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition disabled:opacity-50"
                        >
                          {saving ? '저장 중...' : '저장'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition"
                        >
                          취소
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  회원이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
