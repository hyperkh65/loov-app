'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { ScheduleEvent, EventType, EVENT_TYPE_LABEL, EVENT_TYPE_COLOR, ANIMAL_EMOJI } from '@/lib/types';
import { supabase } from '@/lib/supabase';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = Array(firstDay).fill(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function pad(n: number) { return n.toString().padStart(2, '0'); }

function AddEventModal({ onClose, defaultDate }: { onClose: () => void; defaultDate?: string }) {
  const { addScheduleEvent, employees } = useStore();
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: defaultDate || new Date().toISOString().slice(0, 10),
    time: '',
    endTime: '',
    type: 'meeting' as EventType,
    assignedEmployeeIds: [] as string[],
    isAllDay: false,
    color: '',
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    addScheduleEvent({ id: crypto.randomUUID(), ...form });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">일정 추가</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">제목 *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              placeholder="회의, 마감, 통화..." autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">유형</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
                {Object.entries(EVENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">날짜</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">시작 시간</label>
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">종료 시간</label>
              <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">메모</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
              rows={2} placeholder="추가 설명..." />
          </div>
          {employees.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">참여 직원</label>
              <div className="flex flex-wrap gap-2">
                {employees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox"
                      checked={form.assignedEmployeeIds.includes(emp.id)}
                      onChange={(e) => setForm({
                        ...form,
                        assignedEmployeeIds: e.target.checked
                          ? [...form.assignedEmployeeIds, emp.id]
                          : form.assignedEmployeeIds.filter((id) => id !== emp.id),
                      })}
                      className="rounded" />
                    {ANIMAL_EMOJI[emp.animal]} {emp.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium">취소</button>
          <button onClick={handleSubmit} disabled={!form.title.trim()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold">
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const { scheduleEvents, removeScheduleEvent, employees } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  // Google Calendar 상태
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  const calDays = getCalendarDays(viewYear, viewMonth);
  const today = `${viewYear}-${pad(viewMonth + 1)}-${pad(now.getDate())}`;

  // URL 파라미터로 Google 연결 상태 확인
  useEffect(() => {
    const connected = searchParams.get('google_connected');
    const error = searchParams.get('google_error');
    if (connected) {
      setSyncMessage('✅ Google Calendar가 연결되었습니다!');
      setTimeout(() => setSyncMessage(''), 4000);
      router.replace('/dashboard/schedule');
    }
    if (error) {
      setSyncMessage(`❌ 연결 실패: ${error}`);
      setTimeout(() => setSyncMessage(''), 4000);
      router.replace('/dashboard/schedule');
    }
  }, [searchParams, router]);

  // Google 연결 상태 확인
  useEffect(() => {
    async function checkGoogleConnection() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('bossai_google_tokens')
        .select('email')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setGoogleConnected(true);
        setGoogleEmail(data.email || '');
      }
    }
    checkGoogleConnection();
  }, []);

  const handleGoogleConnect = () => {
    window.location.href = '/api/google/connect';
  };

  const handleGoogleDisconnect = async () => {
    await fetch('/api/google/disconnect', { method: 'POST' });
    setGoogleConnected(false);
    setGoogleEmail('');
    setSyncMessage('Google Calendar 연결이 해제되었습니다.');
    setTimeout(() => setSyncMessage(''), 3000);
  };

  const handleSync = async (direction: 'both' | 'import' | 'export' = 'both') => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const res = await fetch('/api/google/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`✅ ${data.message}`);
        if (data.imported > 0) {
          // 새로고침하여 가져온 이벤트 표시
          window.location.reload();
        }
      } else {
        setSyncMessage(`❌ 동기화 실패: ${data.error}`);
      }
    } catch {
      setSyncMessage('❌ 동기화 중 오류가 발생했습니다.');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  };

  const getEventsForDay = (day: number) => {
    const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
    return scheduleEvents.filter((e) => e.date === dateStr);
  };

  const selectedEvents = selectedDate
    ? scheduleEvents.filter((e) => e.date === selectedDate).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    : [];

  const upcomingEvents = scheduleEvents
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
    .slice(0, 10);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-black text-gray-900">📅 스케줄</h1>
            <p className="text-sm text-gray-400 hidden sm:block">업무 일정 및 팀 스케줄 관리</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Google Calendar 연결 버튼 */}
            {!googleConnected ? (
              <button
                onClick={handleGoogleConnect}
                className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs px-3 py-2 rounded-xl transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z" fill="#4285F4"/>
                  <text x="6" y="16" fontSize="10" fill="white">G</text>
                </svg>
                <span className="hidden sm:inline">Google 연결</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 rounded-xl">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  {googleEmail || 'Google 연결됨'}
                </div>
                <button
                  onClick={() => handleSync('both')}
                  disabled={syncing}
                  className="text-xs bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 px-3 py-1.5 rounded-xl disabled:opacity-60 transition-colors"
                >
                  {syncing ? '동기화 중...' : '🔄 동기화'}
                </button>
                <button
                  onClick={handleGoogleDisconnect}
                  className="text-xs text-gray-400 hover:text-red-400 px-2 py-1.5 rounded-xl hover:bg-red-50 transition-colors"
                >
                  해제
                </button>
              </div>
            )}
            <button onClick={() => { setSelectedDate(today); setShowAdd(true); }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 md:px-4 py-2 rounded-xl font-bold text-sm">
              + 추가
            </button>
          </div>
        </div>
        {syncMessage && (
          <div className={`mt-2 text-xs px-3 py-2 rounded-xl ${
            syncMessage.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {syncMessage}
          </div>
        )}
      </header>

      <div className="p-4 md:p-6">
        {/* Google Calendar 배너 (미연결 시) */}
        {!googleConnected && (
          <div className="mb-5 bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-blue-800 text-sm">📅 Google Calendar 연동</div>
              <div className="text-xs text-blue-600 mt-0.5">Google Calendar와 연동하면 일정을 자동으로 동기화할 수 있습니다.</div>
            </div>
            <button
              onClick={handleGoogleConnect}
              className="flex-shrink-0 bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-blue-500 transition-colors"
            >
              연결하기
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* 캘린더 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {/* 월 네비게이션 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                <button onClick={() => { const d = new Date(viewYear, viewMonth - 1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }}
                  className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-50">‹</button>
                <h2 className="font-bold text-gray-900">{viewYear}년 {viewMonth + 1}월</h2>
                <button onClick={() => { const d = new Date(viewYear, viewMonth + 1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }}
                  className="text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-50">›</button>
              </div>

              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 border-b border-gray-50">
                {DAYS.map((d, i) => (
                  <div key={d} className={`py-2 text-center text-xs font-semibold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
                    {d}
                  </div>
                ))}
              </div>

              {/* 날짜 그리드 */}
              <div className="grid grid-cols-7">
                {calDays.map((day, i) => {
                  if (day === null) return <div key={`empty-${i}`} className="aspect-square border-r border-b border-gray-50/50" />;
                  const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
                  const events = getEventsForDay(day);
                  const isToday = dateStr === today;
                  const isSelected = dateStr === selectedDate;

                  return (
                    <button key={day}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`aspect-square border-r border-b border-gray-50/50 p-1 text-left flex flex-col hover:bg-indigo-50/50 transition-colors ${
                        isSelected ? 'bg-indigo-50' : ''
                      }`}>
                      <span className={`text-xs w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full font-medium ${
                        isToday ? 'bg-indigo-600 text-white font-black' :
                        i % 7 === 0 ? 'text-red-400' :
                        i % 7 === 6 ? 'text-blue-400' : 'text-gray-700'
                      }`}>{day}</span>
                      <div className="flex-1 overflow-hidden mt-0.5 hidden sm:block">
                        {events.slice(0, 2).map((e) => (
                          <div key={e.id} className={`text-[9px] truncate px-1 py-0.5 rounded mb-0.5 border ${EVENT_TYPE_COLOR[e.type]}`}>
                            {e.time && `${e.time} `}{e.title}
                          </div>
                        ))}
                        {events.length > 2 && (
                          <div className="text-[9px] text-gray-400 px-1">+{events.length - 2}개</div>
                        )}
                      </div>
                      {/* 모바일: 점 표시 */}
                      {events.length > 0 && (
                        <div className="sm:hidden flex gap-0.5 mt-0.5">
                          {events.slice(0, 3).map((e) => (
                            <span key={e.id} className="w-1 h-1 rounded-full bg-indigo-400" />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 선택된 날짜 이벤트 */}
            {selectedDate && (
              <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900 text-sm">
                    {new Date(selectedDate + 'T00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
                  </h3>
                  <button onClick={() => setShowAdd(true)}
                    className="text-sm text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50">
                    + 추가
                  </button>
                </div>
                {selectedEvents.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">일정 없음</p>
                ) : (
                  <div className="space-y-2">
                    {selectedEvents.map((event) => (
                      <div key={event.id} className={`border rounded-xl p-3 ${EVENT_TYPE_COLOR[event.type]}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-sm">{event.title}</div>
                            {event.time && (
                              <div className="text-xs opacity-70 mt-0.5">
                                {event.time}{event.endTime ? ` ~ ${event.endTime}` : ''}
                              </div>
                            )}
                            {event.description && <p className="text-xs mt-1 opacity-70">{event.description}</p>}
                          </div>
                          <button onClick={() => removeScheduleEvent(event.id)} className="text-xs opacity-50 hover:opacity-100">×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 오른쪽 - 다가오는 일정 */}
          <div className="space-y-4">
            {googleConnected && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="text-sm font-bold text-gray-900 mb-3">🔄 Google Calendar 동기화</div>
                <div className="space-y-2">
                  <button
                    onClick={() => handleSync('import')}
                    disabled={syncing}
                    className="w-full text-xs bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 py-2 rounded-xl disabled:opacity-60 transition-colors"
                  >
                    ↓ Google에서 가져오기
                  </button>
                  <button
                    onClick={() => handleSync('export')}
                    disabled={syncing}
                    className="w-full text-xs bg-green-50 text-green-700 border border-green-100 hover:bg-green-100 py-2 rounded-xl disabled:opacity-60 transition-colors"
                  >
                    ↑ Google로 내보내기
                  </button>
                  <button
                    onClick={() => handleSync('both')}
                    disabled={syncing}
                    className="w-full text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 py-2 rounded-xl disabled:opacity-60 transition-colors font-semibold"
                  >
                    ↕ 양방향 동기화
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">다가오는 일정</h3>
              {upcomingEvents.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">📅</div>
                  <p className="text-sm text-gray-400">예정된 일정이 없습니다</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map((event) => {
                    const emps = employees.filter((e) => event.assignedEmployeeIds.includes(e.id));
                    return (
                      <div key={event.id} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          event.type === 'deadline' ? 'bg-red-400' :
                          event.type === 'meeting' ? 'bg-blue-400' :
                          event.type === 'call' ? 'bg-green-400' : 'bg-gray-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-800 truncate">{event.title}</div>
                          <div className="text-xs text-gray-400">
                            {new Date(event.date + 'T00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                            {event.time && ` ${event.time}`}
                          </div>
                          {emps.length > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              {emps.map((e) => <span key={e.id} className="text-xs">{ANIMAL_EMOJI[e.animal]}</span>)}
                            </div>
                          )}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${EVENT_TYPE_COLOR[event.type]}`}>
                          {EVENT_TYPE_LABEL[event.type]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAdd && <AddEventModal onClose={() => setShowAdd(false)} defaultDate={selectedDate || undefined} />}
    </div>
  );
}
