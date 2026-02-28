'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { ScheduleEvent, EventType, EVENT_TYPE_LABEL, EVENT_TYPE_COLOR, ANIMAL_EMOJI } from '@/lib/types';

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
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
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

  const calDays = getCalendarDays(viewYear, viewMonth);
  const today = `${viewYear}-${pad(viewMonth + 1)}-${pad(now.getDate())}`;

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
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">📅 스케줄</h1>
            <p className="text-sm text-gray-400">업무 일정 및 팀 스케줄 관리</p>
          </div>
          <button onClick={() => { setSelectedDate(today); setShowAdd(true); }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold text-sm">
            + 일정 추가
          </button>
        </div>
      </header>

      <div className="p-6">
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
                      <span className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                        isToday ? 'bg-indigo-600 text-white font-black' :
                        i % 7 === 0 ? 'text-red-400' :
                        i % 7 === 6 ? 'text-blue-400' : 'text-gray-700'
                      }`}>{day}</span>
                      <div className="flex-1 overflow-hidden mt-0.5">
                        {events.slice(0, 2).map((e) => (
                          <div key={e.id} className={`text-[9px] truncate px-1 py-0.5 rounded mb-0.5 border ${EVENT_TYPE_COLOR[e.type]}`}>
                            {e.time && `${e.time} `}{e.title}
                          </div>
                        ))}
                        {events.length > 2 && (
                          <div className="text-[9px] text-gray-400 px-1">+{events.length - 2}개</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 선택된 날짜 이벤트 */}
            {selectedDate && (
              <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900">
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
