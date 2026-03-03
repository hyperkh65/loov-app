'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import {
  ANIMAL_EMOJI, ANIMAL_PERSONALITY,
  ROLE_BADGE, DEPARTMENT_COLOR,
  AI_PROVIDER_INFO, AIProvider, AIProviderConfig,
  SUBSCRIPTION_PLANS, Employee,
} from '@/lib/types';
import HireModal from '@/components/HireModal';

// ── 직원 AI 설정 인라인 ────────────────────────────────
function EmployeeAIConfig({ emp }: { emp: Employee }) {
  const { updateEmployee, updateEmployeeAI, companySettings } = useStore();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<{ provider: AIProvider; apiKey: string; model: string }>({
    provider: emp.aiConfig?.provider || companySettings.globalAIConfig?.provider || 'gemini',
    apiKey: emp.aiConfig?.apiKey || '',
    model: emp.aiConfig?.model || companySettings.globalAIConfig?.model || 'gemini-2.0-flash',
  });

  const openEdit = () => {
    setForm({
      provider: emp.aiConfig?.provider || companySettings.globalAIConfig?.provider || 'gemini',
      apiKey: emp.aiConfig?.apiKey || '',
      model: emp.aiConfig?.model || companySettings.globalAIConfig?.model || 'gemini-2.0-flash',
    });
    setEditing(true);
  };

  const handleSave = () => {
    const config: AIProviderConfig = { provider: form.provider, apiKey: form.apiKey, model: form.model };
    updateEmployeeAI(emp.id, config);
    setSaved(true);
    setTimeout(() => { setSaved(false); setEditing(false); }, 1200);
  };

  const handleClear = () => {
    updateEmployee(emp.id, { aiConfig: undefined });
    setEditing(false);
  };

  const hasIndividual = !!emp.aiConfig?.apiKey;

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasIndividual ? 'bg-emerald-400' : 'bg-gray-200'}`} />
          {hasIndividual ? (
            <span className="text-gray-600">
              {AI_PROVIDER_INFO[emp.aiConfig!.provider].label.split(' ')[0]}
              {emp.aiConfig!.model && (
                <span className="text-gray-400 ml-1">· {emp.aiConfig!.model}</span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">글로벌 설정 사용</span>
          )}
        </div>
        <button
          onClick={openEdit}
          className="text-xs text-indigo-600 hover:text-indigo-500 border border-indigo-200 hover:border-indigo-300 px-2 py-0.5 rounded-lg transition-colors"
        >
          {hasIndividual ? '수정' : '설정'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 bg-indigo-50/60 rounded-xl p-3 border border-indigo-100">
      {/* 공급자 */}
      <div className="grid grid-cols-3 gap-1">
        {(['gemini', 'claude', 'gpt4o'] as AIProvider[]).map((p) => (
          <button key={p}
            onClick={() => setForm({ ...form, provider: p, model: AI_PROVIDER_INFO[p].models[0] || '' })}
            className={`py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
              form.provider === p
                ? 'border-indigo-400 bg-white text-indigo-700'
                : 'border-transparent bg-white/60 text-gray-500 hover:bg-white'
            }`}>
            {AI_PROVIDER_INFO[p].label.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* 모델 */}
      {AI_PROVIDER_INFO[form.provider].models.length > 0 && (
        <select value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400 bg-white">
          {AI_PROVIDER_INFO[form.provider].models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}

      {/* API 키 */}
      <input
        type="password"
        value={form.apiKey}
        onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
        placeholder={AI_PROVIDER_INFO[form.provider].placeholder}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-400 bg-white"
      />

      {/* 버튼 */}
      <div className="flex gap-1.5">
        <button onClick={handleSave}
          disabled={!form.apiKey.trim()}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 ${
            saved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}>
          {saved ? '✓ 저장됨' : '저장'}
        </button>
        {hasIndividual && (
          <button onClick={handleClear}
            className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-500 hover:bg-gray-100 bg-white">
            초기화
          </button>
        )}
        <button onClick={() => setEditing(false)}
          className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-500 hover:bg-gray-100 bg-white">
          취소
        </button>
      </div>
    </div>
  );
}

// ── 직원 개인 지시사항 ──────────────────────────────────
function EmployeeCustomInstructions({ emp }: { emp: Employee }) {
  const { updateEmployee } = useStore();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(emp.customInstructions || '');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    updateEmployee(emp.id, { customInstructions: value.trim() || undefined });
    setSaved(true);
    setTimeout(() => { setSaved(false); setEditing(false); }, 1200);
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 truncate flex-1 mr-2">
          {emp.customInstructions ? `"${emp.customInstructions.slice(0, 40)}${emp.customInstructions.length > 40 ? '…' : ''}"` : '개인 지시사항 없음'}
        </span>
        <button
          onClick={() => { setValue(emp.customInstructions || ''); setEditing(true); }}
          className="text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-2 py-0.5 rounded-lg transition-colors flex-shrink-0"
        >
          {emp.customInstructions ? '수정' : '추가'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder={`예: 항상 존댓말 사용, 숫자 데이터는 표로 정리, 마케팅은 인스타그램 중심으로...`}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-400 resize-none"
        autoFocus
      />
      <div className="flex gap-1.5">
        <button onClick={handleSave}
          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
            saved ? 'bg-emerald-500 text-white' : 'bg-gray-800 hover:bg-gray-700 text-white'
          }`}>
          {saved ? '✓ 저장됨' : '저장'}
        </button>
        <button onClick={() => setEditing(false)}
          className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-500 hover:bg-gray-100">
          취소
        </button>
      </div>
    </div>
  );
}

// ── 직원 카드 ──────────────────────────────────────────
function EmployeeCard({ emp }: { emp: Employee }) {
  const { removeEmployee, updateEmployee } = useStore();

  const handleFire = () => {
    if (!confirm(`${emp.name}을(를) 해고하시겠습니까?\n채팅 기록도 함께 삭제됩니다.`)) return;
    removeEmployee(emp.id);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-5">
        {/* 상단: 아바타 + 이름 + 상태 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-2xl flex-shrink-0">
                {ANIMAL_EMOJI[emp.animal]}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                emp.status === 'active' ? 'bg-emerald-400' :
                emp.status === 'busy'   ? 'bg-amber-400' : 'bg-gray-300'
              }`} />
            </div>
            <div>
              <div className="font-bold text-gray-900 text-sm">{emp.name}</div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${ROLE_BADGE[emp.role]}`}>
                  {emp.role}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${DEPARTMENT_COLOR[emp.department]}`}>
                  {emp.department}
                </span>
              </div>
            </div>
          </div>
          <button onClick={handleFire}
            className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors">
            해고
          </button>
        </div>

        {/* 성격 */}
        <p className="text-[11px] text-gray-400 leading-relaxed mb-3 line-clamp-2">
          {ANIMAL_PERSONALITY[emp.animal]}
        </p>

        {/* 스킬 */}
        <div className="flex flex-wrap gap-1 mb-3">
          {emp.skills.slice(0, 4).map((skill) => (
            <span key={skill} className="text-[10px] bg-gray-50 border border-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {skill}
            </span>
          ))}
          {emp.skills.length > 4 && (
            <span className="text-[10px] text-gray-400">+{emp.skills.length - 4}개</span>
          )}
        </div>

        {/* 업무 통계 */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          {[
            { v: emp.taskCount, l: '전체 업무', c: 'text-gray-800' },
            { v: emp.completedTaskCount, l: '완료', c: 'text-emerald-600' },
            { v: new Date(emp.hiredAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }), l: '입사일', c: 'text-gray-600' },
          ].map(({ v, l, c }) => (
            <div key={l} className="bg-gray-50 rounded-xl py-2">
              <div className={`text-sm font-black ${c}`}>{v}</div>
              <div className="text-[10px] text-gray-400">{l}</div>
            </div>
          ))}
        </div>

        {/* AI 설정 섹션 */}
        <div className="border-t border-gray-50 pt-3 space-y-3">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">AI 설정</div>
          <EmployeeAIConfig emp={emp} />
          <EmployeeCustomInstructions emp={emp} />
        </div>

        {/* 상태 변경 */}
        <div className="mt-3">
          <select
            value={emp.status}
            onChange={(e) => updateEmployee(emp.id, { status: e.target.value as Employee['status'] })}
            className="w-full border border-gray-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-300 bg-gray-50 text-gray-600">
            <option value="active">● 활동 중</option>
            <option value="busy">● 업무 중</option>
            <option value="offline">● 오프라인</option>
          </select>
        </div>
      </div>

      {/* 바로가기 버튼 */}
      <div className="border-t border-gray-50 px-4 py-3 flex gap-2">
        <a href="/dashboard/chat"
          className="flex-1 text-center text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 py-2 rounded-xl font-semibold transition-colors">
          💬 채팅
        </a>
        <a href="/dashboard/directives"
          className="flex-1 text-center text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 py-2 rounded-xl font-semibold transition-colors">
          📋 지시사항
        </a>
      </div>
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────
export default function EmployeesPage() {
  const { employees, addEmployee, companySettings } = useStore();
  const [isHireOpen, setIsHireOpen] = useState(false);

  const plan = SUBSCRIPTION_PLANS.find((p) => p.tier === companySettings.subscriptionTier);
  const maxEmployees = plan?.maxEmployees ?? 1;
  const canHire = employees.length < maxEmployees;
  const hasGlobalAI = !!companySettings.globalAIConfig?.apiKey;
  const withIndividualAI = employees.filter((e) => !!e.aiConfig?.apiKey).length;
  const activeCount = employees.filter((e) => e.status === 'active').length;

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">👥 AI 직원 관리</h1>
            <p className="text-sm text-gray-400">
              {employees.length}/{maxEmployees === 999 ? '∞' : maxEmployees}명 재직 · {withIndividualAI}명 개별 AI 설정
            </p>
          </div>
          <button
            onClick={() => setIsHireOpen(true)}
            disabled={!canHire}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-colors">
            + 직원 채용
          </button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* 요약 통계 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '전체 직원', value: employees.length, color: 'text-gray-800' },
            { label: '활동 중', value: activeCount, color: 'text-emerald-600' },
            { label: '개별 AI 설정', value: withIndividualAI, color: 'text-indigo-600' },
            {
              label: '글로벌 AI',
              value: hasGlobalAI
                ? AI_PROVIDER_INFO[companySettings.globalAIConfig!.provider].label.split(' ')[0]
                : '미설정',
              color: hasGlobalAI ? 'text-emerald-600' : 'text-amber-500',
            },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* 플랜 한도 초과 알림 */}
        {!canHire && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <span className="font-bold text-amber-800 text-sm">직원 한도 도달</span>
              <span className="text-amber-600 text-sm ml-2">현재 플랜: 최대 {maxEmployees}명</span>
            </div>
            <a href="/dashboard/settings"
              className="text-sm text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors font-medium">
              플랜 업그레이드 →
            </a>
          </div>
        )}

        {/* 글로벌 AI 미설정 안내 */}
        {!hasGlobalAI && employees.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-blue-400 text-lg flex-shrink-0">💡</span>
            <p className="text-sm text-blue-700">
              <a href="/dashboard/settings" className="font-bold underline">설정 → AI 설정</a>에서
              글로벌 AI를 등록하면 모든 직원이 AI를 사용할 수 있습니다. 직원별 개별 설정도 가능합니다.
            </p>
          </div>
        )}

        {/* 직원 목록 */}
        {employees.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-gray-100">
            <div className="text-6xl mb-4">🏢</div>
            <h2 className="text-xl font-bold text-gray-700 mb-2">아직 AI 직원이 없습니다</h2>
            <p className="text-gray-400 text-sm mb-6">영업, 회계, 마케팅 등 원하는 부서의 AI 직원을 채용하세요.</p>
            <button onClick={() => setIsHireOpen(true)}
              className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-indigo-500 transition-colors">
              첫 직원 채용하기
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {employees.map((emp) => (
              <EmployeeCard key={emp.id} emp={emp} />
            ))}
          </div>
        )}
      </div>

      {isHireOpen && (
        <HireModal
          onHire={(employee) => { addEmployee(employee); setIsHireOpen(false); }}
          onClose={() => setIsHireOpen(false)}
        />
      )}
    </div>
  );
}
