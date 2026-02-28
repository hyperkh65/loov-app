'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { ANIMAL_EMOJI, ROLE_BADGE, DEPARTMENT_COLOR, AI_PROVIDER_INFO, AIProvider, AIProviderConfig, SUBSCRIPTION_PLANS } from '@/lib/types';
import HireModal from '@/components/HireModal';

export default function EmployeesPage() {
  const { employees, removeEmployee, updateEmployeeAI, companySettings } = useStore();
  const [isHireOpen, setIsHireOpen] = useState(false);
  const { addEmployee } = useStore();
  const [editingAI, setEditingAI] = useState<string | null>(null);
  const [aiForm, setAiForm] = useState<{ provider: AIProvider; apiKey: string; model: string }>({
    provider: 'claude', apiKey: '', model: 'claude-sonnet-4-6',
  });

  const plan = SUBSCRIPTION_PLANS.find((p) => p.tier === companySettings.subscriptionTier);
  const maxEmployees = plan?.maxEmployees ?? 1;
  const canHire = employees.length < maxEmployees;

  const handleSaveAI = (employeeId: string) => {
    const config: AIProviderConfig = {
      provider: aiForm.provider,
      apiKey: aiForm.apiKey,
      model: aiForm.model,
    };
    updateEmployeeAI(employeeId, config);
    setEditingAI(null);
  };

  const handleEditAI = (employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    if (emp?.aiConfig) {
      setAiForm({
        provider: emp.aiConfig.provider,
        apiKey: emp.aiConfig.apiKey,
        model: emp.aiConfig.model || '',
      });
    } else {
      setAiForm({ provider: 'claude', apiKey: '', model: 'claude-sonnet-4-6' });
    }
    setEditingAI(employeeId);
  };

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">👥 AI 직원 관리</h1>
            <p className="text-sm text-gray-400">
              직원 {employees.length}/{maxEmployees}명 · {companySettings.subscriptionTier} 플랜
            </p>
          </div>
          <button
            onClick={() => setIsHireOpen(true)}
            disabled={!canHire}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-bold text-sm">
            + 직원 채용
          </button>
        </div>
      </header>

      <div className="p-6">
        {!canHire && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="font-bold text-amber-800">직원 한도 도달</span>
              <span className="text-amber-600 text-sm ml-2">{companySettings.subscriptionTier} 플랜 최대 {maxEmployees}명</span>
            </div>
            <a href="/dashboard/settings" className="text-sm text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors">
              플랜 업그레이드 →
            </a>
          </div>
        )}

        {employees.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-gray-100">
            <div className="text-6xl mb-4">👥</div>
            <h2 className="text-xl font-bold text-gray-700 mb-2">아직 AI 직원이 없습니다</h2>
            <p className="text-gray-400 text-sm mb-6">영업, 회계, 마케팅 등 원하는 부서의 AI 직원을 채용하세요.</p>
            <button onClick={() => setIsHireOpen(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold">
              첫 직원 채용하기
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {employees.map((emp) => {
              const isEditingThisAI = editingAI === emp.id;
              const providerInfo = emp.aiConfig ? AI_PROVIDER_INFO[emp.aiConfig.provider] : null;

              return (
                <div key={emp.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                  {/* 직원 헤더 */}
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-2xl">
                            {ANIMAL_EMOJI[emp.animal]}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                            emp.status === 'active' ? 'bg-emerald-400' : emp.status === 'busy' ? 'bg-amber-400' : 'bg-gray-300'
                          }`} />
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{emp.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${ROLE_BADGE[emp.role]}`}>{emp.role}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${DEPARTMENT_COLOR[emp.department]}`}>{emp.department}</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => removeEmployee(emp.id)}
                        className="text-red-400 hover:text-red-600 text-xs transition-colors">해고</button>
                    </div>

                    {/* 스킬 */}
                    <div className="flex flex-wrap gap-1 mb-4">
                      {emp.skills.slice(0, 4).map((skill) => (
                        <span key={skill} className="text-[10px] bg-gray-50 border border-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {skill}
                        </span>
                      ))}
                      {emp.skills.length > 4 && (
                        <span className="text-[10px] text-gray-400">+{emp.skills.length - 4}개</span>
                      )}
                    </div>

                    {/* AI 설정 */}
                    <div className="border-t border-gray-50 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500">AI 설정</span>
                        <button onClick={() => isEditingThisAI ? setEditingAI(null) : handleEditAI(emp.id)}
                          className="text-xs text-indigo-600 hover:text-indigo-500">
                          {isEditingThisAI ? '취소' : emp.aiConfig ? '수정' : '설정'}
                        </button>
                      </div>

                      {isEditingThisAI ? (
                        <div className="space-y-2">
                          <select value={aiForm.provider}
                            onChange={(e) => setAiForm({ ...aiForm, provider: e.target.value as AIProvider, model: AI_PROVIDER_INFO[e.target.value as AIProvider].models[0] || '' })}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none">
                            {Object.entries(AI_PROVIDER_INFO).map(([key, info]) => (
                              <option key={key} value={key}>{info.label}</option>
                            ))}
                          </select>
                          {AI_PROVIDER_INFO[aiForm.provider].models.length > 0 && (
                            <select value={aiForm.model}
                              onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none">
                              {AI_PROVIDER_INFO[aiForm.provider].models.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          )}
                          <input value={aiForm.apiKey}
                            onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none font-mono"
                            placeholder={AI_PROVIDER_INFO[aiForm.provider].placeholder}
                            type="password" />
                          <button onClick={() => handleSaveAI(emp.id)}
                            className="w-full bg-indigo-600 text-white py-1.5 rounded-lg text-xs font-bold">
                            저장
                          </button>
                        </div>
                      ) : emp.aiConfig ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                            <span>{AI_PROVIDER_INFO[emp.aiConfig.provider].label}</span>
                          </div>
                          {emp.aiConfig.model && (
                            <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                              {emp.aiConfig.model}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 flex items-center gap-1">
                          <span className="w-2 h-2 bg-gray-200 rounded-full" />
                          AI 미설정 (글로벌 설정 사용)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 하단 액션 */}
                  <div className="border-t border-gray-50 px-5 py-3 flex items-center gap-2">
                    <a href="/dashboard/chat" className="flex-1 text-center text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 py-2 rounded-lg font-medium transition-colors">
                      💬 채팅
                    </a>
                    <a href="/dashboard/directives" className="flex-1 text-center text-xs bg-gray-50 hover:bg-gray-100 text-gray-600 py-2 rounded-lg font-medium transition-colors">
                      📋 지시
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isHireOpen && (
        <HireModal onHire={(employee) => { addEmployee(employee); setIsHireOpen(false); }} onClose={() => setIsHireOpen(false)} />
      )}
    </div>
  );
}
