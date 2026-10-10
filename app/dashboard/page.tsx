'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { ANIMAL_EMOJI, ROLE_DEFAULT_SKILLS, ROLE_DEPARTMENT } from '@/lib/types';

// ── 유틸 ─────────────────────────────────────────────
function fmtMoney(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return n.toLocaleString();
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── 작은 통계 카드 ────────────────────────────────────
function StatCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`bg-white rounded-2xl p-5 border ${color} shadow-sm`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {sub && <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{sub}</span>}
      </div>
      <div className="text-2xl font-black text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

// ── 지시사항 입력 폼 ──────────────────────────────────
function QuickDirective() {
  const { employees, addDirective } = useStore();
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'medium' | 'high' | 'urgent'>('medium');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!content.trim()) return;
    setSending(true);
    addDirective({
      id: crypto.randomUUID(),
      title: content.slice(0, 30) + (content.length > 30 ? '...' : ''),
      content,
      targetEmployeeIds: employees.map((e) => e.id),
      priority,
      status: 'pending',
      createdAt: new Date().toISOString(),
      responses: [],
    });
    setContent('');
    setSending(false);
  };

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">👑</span>
        <h3 className="font-bold">대표 지시사항</h3>
        <span className="text-indigo-200 text-sm ml-auto">전체 직원에게 전달</span>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="AI 직원들에게 업무를 지시하세요..."
        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/40 resize-none focus:outline-none focus:border-white/40 mb-3"
        rows={3}
      />
      <div className="flex items-center gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none flex-shrink-0">
          <option value="medium" className="text-gray-900">일반</option>
          <option value="high" className="text-gray-900">높음</option>
          <option value="urgent" className="text-gray-900">긴급</option>
        </select>
        <button
          onClick={handleSend}
          disabled={!content.trim() || sending}
          className="ml-auto bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 px-5 py-2 rounded-xl font-bold text-sm transition-colors flex items-center gap-2">
          {sending ? '전달 중...' : '지시 내리기 →'}
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const {
    employees, directChats, meetings, projects, dailyReports,
    directives, salesLeads, accountingEntries, marketingCampaigns, scheduleEvents,
    companySettings,
  } = useStore();

  // 통계 계산
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthlyIncome = accountingEntries
    .filter((e) => e.type === 'income' && e.date.startsWith(thisMonth))
    .reduce((s, e) => s + e.amount, 0);
  const monthlyExpense = accountingEntries
    .filter((e) => e.type === 'expense' && e.date.startsWith(thisMonth))
    .reduce((s, e) => s + e.amount, 0);

  const activeLeads = salesLeads.filter((l) => !['won', 'lost'].includes(l.status)).length;
  const wonLeads = salesLeads.filter((l) => l.status === 'won').length;
  const totalMessages = directChats.reduce((s, c) => s + c.messages.length, 0);
  const pendingDirectives = directives.filter((d) => d.status === 'pending');

  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = scheduleEvents.filter((e) => e.date === today);

  const recentActivity = directChats
    .flatMap((chat) => {
      const emp = employees.find((e) => e.id === chat.employeeId);
      return chat.messages.slice(-1).map((m) => ({ ...m, employee: emp }));
    })
    .filter((m) => m.employee)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  const activeCampaigns = marketingCampaigns.filter((c) => c.status === 'active').length;

  return (
    <div className="min-h-full">
      {/* 상단 바 */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div>
          <h1 className="text-lg font-black text-gray-900">
            안녕하세요, {companySettings.ceoName || '대표님'} 👋
          </h1>
          <p className="text-sm text-gray-400">
            {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingDirectives.length > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
              지시사항 {pendingDirectives.length}건 대기
            </div>
          )}
          <Link href="/dashboard/employees"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-2">
            <span>+</span> AI 직원 채용
          </Link>
        </div>
      </header>

      <div className="p-6 space-y-6">

        {/* ── 핵심 지표 ─────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon="💰" label="이번달 매출" value={monthlyIncome > 0 ? `₩${fmtMoney(monthlyIncome)}` : '₩0'} sub={monthlyExpense > 0 ? `지출 ₩${fmtMoney(monthlyExpense)}` : undefined} color="border-emerald-100" />
          <StatCard icon="📊" label="진행중 영업리드" value={`${activeLeads}건`} sub={wonLeads > 0 ? `수주 ${wonLeads}건` : undefined} color="border-blue-100" />
          <StatCard icon="👥" label="AI 직원" value={`${employees.length}명`} sub={`대화 ${totalMessages}건`} color="border-indigo-100" />
          <StatCard icon="📣" label="활성 캠페인" value={`${activeCampaigns}건`} sub={`총 ${marketingCampaigns.length}건`} color="border-orange-100" />
        </div>

        {/* ── 직원 없을 때 온보딩 ────────────────────────── */}
        {employees.length === 0 && (
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 text-white text-center">
            <div className="text-5xl mb-4">🚀</div>
            <h2 className="text-2xl font-black mb-2">첫 AI 직원을 채용하세요</h2>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              영업, 회계, 마케팅 등 원하는 부서의 AI 직원을 채용하고 업무를 지시해보세요.
            </p>
            <Link href="/dashboard/employees"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold transition-colors">
              👤 AI 직원 채용하기
            </Link>
          </div>
        )}

        {/* ── 메인 2열 레이아웃 ──────────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* 왼쪽 2/3 */}
          <div className="lg:col-span-2 space-y-6">

            {/* 지시사항 입력 */}
            <QuickDirective />

            {/* AI 직원 현황 */}
            {employees.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                  <h2 className="font-bold text-gray-900">AI 직원 현황</h2>
                  <Link href="/dashboard/employees" className="text-sm text-indigo-600 hover:text-indigo-500">전체 보기 →</Link>
                </div>
                <div className="divide-y divide-gray-50">
                  {employees.slice(0, 5).map((emp) => {
                    const chat = directChats.find((c) => c.employeeId === emp.id);
                    const msgCount = chat?.messages.length ?? 0;
                    const lastMsg = chat?.messages.slice(-1)[0];

                    return (
                      <div key={emp.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-lg">
                            {ANIMAL_EMOJI[emp.animal]}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                            emp.status === 'active' ? 'bg-emerald-400' : emp.status === 'busy' ? 'bg-amber-400' : 'bg-gray-300'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-800">{emp.name}</span>
                            <span className="text-xs text-gray-400">{emp.role}</span>
                          </div>
                          {lastMsg && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                              {lastMsg.from === 'user' ? '나: ' : ''}{lastMsg.content}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-300">대화 {msgCount}건</span>
                          <Link href="/dashboard/chat"
                            className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2.5 py-1 rounded-lg transition-colors font-medium">
                            채팅
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {employees.length > 5 && (
                  <div className="px-5 py-3 border-t border-gray-50">
                    <Link href="/dashboard/employees" className="text-sm text-gray-400 hover:text-gray-600">
                      +{employees.length - 5}명 더 보기
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* 영업 파이프라인 미리보기 */}
            {salesLeads.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                  <h2 className="font-bold text-gray-900">📊 영업 파이프라인</h2>
                  <Link href="/dashboard/erp/sales" className="text-sm text-indigo-600 hover:text-indigo-500">영업 ERP →</Link>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-5 gap-2 text-center text-xs">
                    {(['lead', 'contacted', 'proposal', 'negotiating', 'won'] as const).map((status) => {
                      const count = salesLeads.filter((l) => l.status === status).length;
                      const labels: Record<string, string> = { lead: '리드', contacted: '컨택', proposal: '제안', negotiating: '협상', won: '수주' };
                      const colors: Record<string, string> = { lead: 'bg-gray-100 text-gray-600', contacted: 'bg-blue-100 text-blue-600', proposal: 'bg-indigo-100 text-indigo-600', negotiating: 'bg-amber-100 text-amber-600', won: 'bg-emerald-100 text-emerald-600' };
                      return (
                        <div key={status} className={`${colors[status]} rounded-xl py-2`}>
                          <div className="text-lg font-black">{count}</div>
                          <div className="text-[10px] mt-0.5">{labels[status]}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 최근 대화 */}
            {recentActivity.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                  <h2 className="font-bold text-gray-900">최근 대화</h2>
                  <Link href="/dashboard/chat" className="text-sm text-indigo-600 hover:text-indigo-500">채팅 센터 →</Link>
                </div>
                <div className="divide-y divide-gray-50">
                  {recentActivity.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3">
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                        {item.employee ? ANIMAL_EMOJI[item.employee.animal] : '💬'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700">
                            {item.from === 'user' ? '나' : item.employee?.name}
                          </span>
                          <span className="text-[10px] text-gray-300">
                            {new Date(item.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 truncate">{item.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 오른쪽 1/3 */}
          <div className="space-y-6">

            {/* 오늘 스케줄 */}
            <div className="bg-white rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                <h2 className="font-bold text-gray-900">📅 오늘 스케줄</h2>
                <Link href="/dashboard/schedule" className="text-sm text-indigo-600 hover:text-indigo-500">전체 →</Link>
              </div>
              <div className="p-4">
                {todayEvents.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="text-3xl mb-2">📅</div>
                    <p className="text-sm text-gray-400">오늘 일정이 없습니다</p>
                    <Link href="/dashboard/schedule" className="text-xs text-indigo-500 mt-2 inline-block">일정 추가 →</Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {todayEvents.slice(0, 4).map((event) => (
                      <div key={event.id} className="flex items-start gap-2.5 text-sm">
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-2 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-gray-800">{event.title}</div>
                          {event.time && <div className="text-xs text-gray-400">{event.time}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 대기 중 지시사항 */}
            {pendingDirectives.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-100">
                <div className="flex items-center justify-between px-5 py-4 border-b border-amber-50">
                  <h2 className="font-bold text-gray-900">⚡ 대기 중 지시</h2>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{pendingDirectives.length}</span>
                </div>
                <div className="divide-y divide-amber-50/50">
                  {pendingDirectives.slice(0, 3).map((d) => (
                    <Link key={d.id} href="/dashboard/directives" className="block px-5 py-3 hover:bg-amber-50/50 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          d.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                          d.priority === 'high' ? 'bg-orange-100 text-orange-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>{d.priority === 'urgent' ? '긴급' : d.priority === 'high' ? '높음' : '일반'}</span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(d.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 truncate">{d.content}</p>
                    </Link>
                  ))}
                </div>
                {pendingDirectives.length > 3 && (
                  <div className="px-5 py-2 border-t border-amber-50">
                    <Link href="/dashboard/directives" className="text-xs text-amber-600">+{pendingDirectives.length - 3}건 더 보기</Link>
                  </div>
                )}
              </div>
            )}

            {/* 마케팅 현황 */}
            <div className="bg-white rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                <h2 className="font-bold text-gray-900">📣 마케팅 현황</h2>
                <Link href="/dashboard/marketing" className="text-sm text-indigo-600 hover:text-indigo-500">허브 →</Link>
              </div>
              <div className="p-4">
                {marketingCampaigns.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="text-3xl mb-2">📣</div>
                    <p className="text-sm text-gray-400">진행중 캠페인 없음</p>
                    <Link href="/dashboard/marketing" className="text-xs text-indigo-500 mt-2 inline-block">캠페인 시작 →</Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {marketingCampaigns.slice(0, 4).map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          c.status === 'active' ? 'bg-emerald-400' :
                          c.status === 'scheduled' ? 'bg-blue-400' : 'bg-gray-300'
                        }`} />
                        <span className="truncate text-gray-700 flex-1">{c.name}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{c.platform}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 빠른 링크 */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: '/dashboard/erp/accounting', icon: '💰', label: '회계 입력' },
                { href: '/dashboard/erp/sales', icon: '📊', label: '영업 리드' },
                { href: '/dashboard/sns', icon: '🌐', label: 'SNS 관리' },
                { href: '/dashboard/settings', icon: '⚙️', label: 'AI 설정' },
              ].map((item) => (
                <Link key={item.href} href={item.href}
                  className="bg-white border border-gray-100 rounded-xl p-3 text-center hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group">
                  <div className="text-2xl mb-1">{item.icon}</div>
                  <div className="text-xs font-medium text-gray-600 group-hover:text-indigo-600">{item.label}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
