'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { CEODirective, Department, ANIMAL_EMOJI } from '@/lib/types';

const PRIORITY_LABEL = { low: '일반', medium: '보통', high: '높음', urgent: '긴급' };
const PRIORITY_COLOR = {
  low:    'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-600',
  high:   'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600',
};
const STATUS_LABEL = { pending: '대기', acknowledged: '확인됨', in_progress: '진행중', completed: '완료' };
const STATUS_COLOR = {
  pending:      'bg-amber-100 text-amber-700',
  acknowledged: 'bg-blue-100 text-blue-700',
  in_progress:  'bg-indigo-100 text-indigo-700',
  completed:    'bg-emerald-100 text-emerald-700',
};

export default function DirectivesPage() {
  const { employees, directives, addDirective, updateDirective, addDirectiveResponse } = useStore();
  const [form, setForm] = useState({
    title: '',
    content: '',
    priority: 'medium' as CEODirective['priority'],
    targetEmployeeIds: [] as string[],
    targetAll: true,
    deadline: '',
  });
  const [filter, setFilter] = useState<'all' | CEODirective['status']>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const handleSubmit = () => {
    if (!form.content.trim()) return;
    addDirective({
      id: crypto.randomUUID(),
      title: form.title || form.content.slice(0, 30) + (form.content.length > 30 ? '...' : ''),
      content: form.content,
      targetEmployeeIds: form.targetAll ? employees.map((e) => e.id) : form.targetEmployeeIds,
      priority: form.priority,
      status: 'pending',
      createdAt: new Date().toISOString(),
      deadline: form.deadline || undefined,
      responses: [],
    });
    setForm({ title: '', content: '', priority: 'medium', targetEmployeeIds: [], targetAll: true, deadline: '' });
  };

  const handleAddResponse = (directiveId: string) => {
    if (!replyContent.trim()) return;
    const emp = employees[0];
    if (!emp) return;
    addDirectiveResponse(directiveId, {
      employeeId: emp.id,
      employeeName: emp.name,
      content: replyContent,
      timestamp: new Date().toISOString(),
    });
    setReplyContent('');
  };

  const filtered = filter === 'all' ? directives : directives.filter((d) => d.status === filter);

  const counts = {
    pending:      directives.filter((d) => d.status === 'pending').length,
    acknowledged: directives.filter((d) => d.status === 'acknowledged').length,
    in_progress:  directives.filter((d) => d.status === 'in_progress').length,
    completed:    directives.filter((d) => d.status === 'completed').length,
  };

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div>
          <h1 className="text-lg font-black text-gray-900">📋 대표 지시사항</h1>
          <p className="text-sm text-gray-400">AI 직원들에게 업무를 지시하고 진행 상황을 추적하세요</p>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* 지시 입력 */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">👑</span>
            <h2 className="font-bold">새 지시사항</h2>
          </div>
          <div className="space-y-3">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40"
              placeholder="제목 (선택사항)" />
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40 resize-none"
              rows={3} placeholder="직원들에게 지시할 업무 내용을 입력하세요..." />

            <div className="flex items-center gap-3 flex-wrap">
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as CEODirective['priority'] })}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                <option value="low" className="text-gray-900">일반</option>
                <option value="medium" className="text-gray-900">보통</option>
                <option value="high" className="text-gray-900">높음</option>
                <option value="urgent" className="text-gray-900">긴급</option>
              </select>

              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />

              {employees.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                  <input type="checkbox" checked={form.targetAll} onChange={(e) => setForm({ ...form, targetAll: e.target.checked })}
                    className="rounded" />
                  전체 직원에게
                </label>
              )}

              <button onClick={handleSubmit} disabled={!form.content.trim()}
                className="ml-auto bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white px-5 py-2 rounded-xl font-bold text-sm">
                지시 내리기 →
              </button>
            </div>

            {/* 직원 개별 선택 */}
            {!form.targetAll && employees.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {employees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-1.5 text-sm text-white/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.targetEmployeeIds.includes(emp.id)}
                      onChange={(e) => setForm({
                        ...form,
                        targetEmployeeIds: e.target.checked
                          ? [...form.targetEmployeeIds, emp.id]
                          : form.targetEmployeeIds.filter((id) => id !== emp.id),
                      })}
                      className="rounded"
                    />
                    {ANIMAL_EMOJI[emp.animal]} {emp.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 현황 요약 */}
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(STATUS_LABEL).map(([status, label]) => (
            <button key={status}
              onClick={() => setFilter(filter === status ? 'all' : status as CEODirective['status'])}
              className={`rounded-xl p-3 text-center transition-all border ${
                filter === status ? 'border-indigo-300 bg-indigo-50' : 'bg-white border-gray-100 hover:border-gray-200'
              }`}>
              <div className="text-xl font-black text-gray-900">{counts[status as keyof typeof counts]}</div>
              <div className={`text-xs font-medium mt-0.5 px-2 py-0.5 rounded-full ${STATUS_COLOR[status as keyof typeof STATUS_COLOR]}`}>{label}</div>
            </button>
          ))}
        </div>

        {/* 필터 */}
        <div className="flex gap-2">
          {(['all', 'pending', 'in_progress', 'completed'] as const).map((v) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                filter === v ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
              }`}>
              {v === 'all' ? '전체' : STATUS_LABEL[v]}
            </button>
          ))}
        </div>

        {/* 지시사항 목록 */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
            <div className="text-5xl mb-4">📋</div>
            <h2 className="text-xl font-bold text-gray-700 mb-2">지시사항이 없습니다</h2>
            <p className="text-gray-400 text-sm">위에서 첫 번째 지시사항을 작성해보세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((directive) => {
              const isExpanded = expandedId === directive.id;
              const targetEmps = employees.filter((e) => directive.targetEmployeeIds.includes(e.id));

              return (
                <div key={directive.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[directive.priority]}`}>
                            {PRIORITY_LABEL[directive.priority]}
                          </span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[directive.status]}`}>
                            {STATUS_LABEL[directive.status]}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(directive.createdAt).toLocaleDateString('ko-KR')}
                          </span>
                          {directive.deadline && (
                            <span className="text-xs text-red-400">마감: {directive.deadline}</span>
                          )}
                        </div>
                        {directive.title && (
                          <h3 className="font-bold text-gray-900 mb-1">{directive.title}</h3>
                        )}
                        <p className={`text-sm text-gray-600 ${!isExpanded && 'line-clamp-2'}`}>{directive.content}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* 상태 변경 */}
                        <select value={directive.status}
                          onChange={(e) => updateDirective(directive.id, { status: e.target.value as CEODirective['status'] })}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none">
                          <option value="pending">대기</option>
                          <option value="acknowledged">확인됨</option>
                          <option value="in_progress">진행중</option>
                          <option value="completed">완료</option>
                        </select>
                        <button onClick={() => setExpandedId(isExpanded ? null : directive.id)}
                          className="text-gray-400 hover:text-gray-600 text-xs">
                          {isExpanded ? '접기' : '펼치기'}
                        </button>
                      </div>
                    </div>

                    {/* 타겟 직원 */}
                    {targetEmps.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-50">
                        <span className="text-xs text-gray-400">대상:</span>
                        {targetEmps.map((emp) => (
                          <span key={emp.id} className="text-xs bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                            {ANIMAL_EMOJI[emp.animal]} {emp.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 확장 - 응답 */}
                  {isExpanded && (
                    <div className="border-t border-gray-50 px-5 py-4 bg-gray-50/50">
                      <h4 className="text-xs font-semibold text-gray-500 mb-3">직원 응답</h4>
                      {directive.responses.length === 0 ? (
                        <p className="text-xs text-gray-400 mb-3">아직 응답이 없습니다</p>
                      ) : (
                        <div className="space-y-2 mb-3">
                          {directive.responses.map((r, i) => (
                            <div key={i} className="bg-white rounded-xl border border-gray-100 p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-gray-700">{r.employeeName}</span>
                                <span className="text-[10px] text-gray-400">{new Date(r.timestamp).toLocaleTimeString('ko-KR')}</span>
                              </div>
                              <p className="text-sm text-gray-600">{r.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {employees.length > 0 && (
                        <div className="flex gap-2">
                          <input value={replyContent} onChange={(e) => setReplyContent(e.target.value)}
                            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none"
                            placeholder="직원 응답 추가 (시뮬레이션)..." />
                          <button onClick={() => handleAddResponse(directive.id)}
                            className="bg-indigo-600 text-white px-3 py-2 rounded-xl text-sm font-medium">
                            추가
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
