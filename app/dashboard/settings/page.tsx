'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { AIProvider, AI_PROVIDER_INFO, SUBSCRIPTION_PLANS, SubscriptionTier, ANIMAL_EMOJI } from '@/lib/types';

export default function SettingsPage() {
  const { companySettings, updateCompanySettings, employees, updateEmployeeAI } = useStore();
  const [activeTab, setActiveTab] = useState<'ai' | 'company' | 'plan'>('ai');
  const [saved, setSaved] = useState(false);

  // 글로벌 AI 설정 폼
  const [globalAI, setGlobalAI] = useState({
    provider: (companySettings.globalAIConfig?.provider || 'claude') as AIProvider,
    apiKey: companySettings.globalAIConfig?.apiKey || '',
    model: companySettings.globalAIConfig?.model || 'claude-sonnet-4-6',
  });

  // 회사 설정 폼
  const [companyForm, setCompanyForm] = useState({
    companyName: companySettings.companyName,
    ceoName: companySettings.ceoName,
    slogan: companySettings.slogan,
    industry: companySettings.industry,
    brandTone: companySettings.brandTone,
    targetAudience: companySettings.targetAudience,
    hashtags: companySettings.hashtags,
  });

  const handleSaveGlobalAI = () => {
    updateCompanySettings({
      globalAIConfig: {
        provider: globalAI.provider,
        apiKey: globalAI.apiKey,
        model: globalAI.model,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleApplyToAll = () => {
    employees.forEach((emp) => {
      updateEmployeeAI(emp.id, {
        provider: globalAI.provider,
        apiKey: globalAI.apiKey,
        model: globalAI.model,
      });
    });
    updateCompanySettings({
      globalAIConfig: {
        provider: globalAI.provider,
        apiKey: globalAI.apiKey,
        model: globalAI.model,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveCompany = () => {
    updateCompanySettings(companyForm);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const currentPlan = SUBSCRIPTION_PLANS.find((p) => p.tier === companySettings.subscriptionTier);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div>
          <h1 className="text-lg font-black text-gray-900">⚙️ 설정</h1>
          <p className="text-sm text-gray-400">AI 설정, 회사 정보, 구독 플랜 관리</p>
        </div>
      </header>

      <div className="p-6">
        {/* 탭 */}
        <div className="flex gap-2 mb-6 border-b border-gray-100 pb-4">
          {[['ai', '🤖 AI 설정'], ['company', '🏢 회사 정보'], ['plan', '💳 구독 플랜']].map(([v, l]) => (
            <button key={v} onClick={() => setActiveTab(v as typeof activeTab)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>{l}</button>
          ))}
        </div>

        {/* AI 설정 탭 */}
        {activeTab === 'ai' && (
          <div className="space-y-6 max-w-2xl">
            {/* 글로벌 AI 설정 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-5">
                <span className="text-xl">🌐</span>
                <div>
                  <h2 className="font-bold text-gray-900">글로벌 AI 설정</h2>
                  <p className="text-xs text-gray-400">모든 직원에게 기본 적용되는 AI 설정</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">AI 공급자</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(AI_PROVIDER_INFO) as AIProvider[]).map((provider) => (
                      <button key={provider}
                        onClick={() => setGlobalAI({ ...globalAI, provider, model: AI_PROVIDER_INFO[provider].models[0] || '' })}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          globalAI.provider === provider
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                        }`}>
                        <div className="text-xs font-bold text-gray-800 truncate">{AI_PROVIDER_INFO[provider].label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {AI_PROVIDER_INFO[globalAI.provider].models.length > 0 && (
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-1 block">모델 선택</label>
                    <select value={globalAI.model}
                      onChange={(e) => setGlobalAI({ ...globalAI, model: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                      {AI_PROVIDER_INFO[globalAI.provider].models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">API 키</label>
                  <input
                    type="password"
                    value={globalAI.apiKey}
                    onChange={(e) => setGlobalAI({ ...globalAI, apiKey: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-mono"
                    placeholder={AI_PROVIDER_INFO[globalAI.provider].placeholder}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    API 키는 로컬에만 저장되며 외부로 전송되지 않습니다.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button onClick={handleSaveGlobalAI}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
                      saved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}>
                    {saved ? '✓ 저장됨' : '설정 저장'}
                  </button>
                  <button onClick={handleApplyToAll}
                    disabled={!globalAI.apiKey || employees.length === 0}
                    className="flex-1 py-2.5 rounded-xl border border-indigo-300 text-indigo-600 hover:bg-indigo-50 font-bold text-sm disabled:opacity-40 transition-all">
                    전체 직원에 적용 ({employees.length}명)
                  </button>
                </div>
              </div>
            </div>

            {/* 직원별 AI 설정 */}
            {employees.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-xl">👥</span>
                  <div>
                    <h2 className="font-bold text-gray-900">직원별 AI 설정</h2>
                    <p className="text-xs text-gray-400">직원마다 다른 AI 모델을 배치할 수 있습니다</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {employees.map((emp) => {
                    const hasConfig = !!emp.aiConfig?.apiKey;
                    const providerInfo = emp.aiConfig ? AI_PROVIDER_INFO[emp.aiConfig.provider] : null;
                    return (
                      <div key={emp.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-base flex-shrink-0">
                          {ANIMAL_EMOJI[emp.animal]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-800">{emp.name}</div>
                          <div className="text-xs text-gray-400">{emp.role}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasConfig ? (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                              <span>{providerInfo?.label}</span>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">글로벌 설정 사용</div>
                          )}
                          <a href="/dashboard/employees"
                            className="text-xs text-indigo-600 border border-indigo-200 px-2.5 py-1 rounded-lg hover:bg-indigo-50">
                            수정
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI 가이드 */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5">
              <h3 className="font-bold text-gray-900 mb-3">💡 AI 키 발급 방법</h3>
              <div className="space-y-2 text-sm">
                {[
                  { name: 'Claude (Anthropic)', url: 'https://console.anthropic.com', desc: 'Anthropic 콘솔에서 API 키 발급' },
                  { name: 'Gemini (Google)', url: 'https://aistudio.google.com', desc: 'Google AI Studio에서 발급' },
                  { name: 'GPT (OpenAI)', url: 'https://platform.openai.com', desc: 'OpenAI Platform에서 발급' },
                ].map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-indigo-400">→</span>
                    <span className="text-gray-700 font-medium">{item.name}:</span>
                    <span className="text-gray-500 text-xs">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 회사 정보 탭 */}
        {activeTab === 'company' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-bold text-gray-900 mb-2">회사 기본 정보</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">회사명</label>
                  <input value={companyForm.companyName} onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">대표자명</label>
                  <input value={companyForm.ceoName} onChange={(e) => setCompanyForm({ ...companyForm, ceoName: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                    placeholder="홍길동" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">슬로건</label>
                <input value={companyForm.slogan} onChange={(e) => setCompanyForm({ ...companyForm, slogan: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  placeholder="우리 회사의 한 줄 메시지" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">업종</label>
                <input value={companyForm.industry} onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  placeholder="IT 솔루션, 온라인 쇼핑몰..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">브랜드 톤</label>
                <input value={companyForm.brandTone} onChange={(e) => setCompanyForm({ ...companyForm, brandTone: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  placeholder="친근하고 전문적인, 혁신적인..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">타겟 고객</label>
                <input value={companyForm.targetAudience} onChange={(e) => setCompanyForm({ ...companyForm, targetAudience: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  placeholder="20-40대 직장인, 소상공인..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">주요 해시태그</label>
                <input value={companyForm.hashtags} onChange={(e) => setCompanyForm({ ...companyForm, hashtags: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  placeholder="#1인기업 #AI직원 #생산성..." />
              </div>
              <button onClick={handleSaveCompany}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                  saved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}>
                {saved ? '✓ 저장됨' : '정보 저장'}
              </button>
            </div>
          </div>
        )}

        {/* 구독 플랜 탭 */}
        {activeTab === 'plan' && (
          <div>
            <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-500">현재 플랜:</span>
                <span className="ml-2 font-black text-indigo-700">{currentPlan?.name || '무료'}</span>
                <span className="ml-2 text-sm text-gray-500">
                  · AI 직원 {currentPlan?.maxEmployees}명 / 현재 {employees.length}명
                </span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {SUBSCRIPTION_PLANS.map((plan) => {
                const isCurrent = plan.tier === companySettings.subscriptionTier;
                return (
                  <div key={plan.tier}
                    className={`relative bg-white rounded-2xl border-2 p-5 transition-all ${
                      isCurrent ? 'border-indigo-400 shadow-lg shadow-indigo-100' :
                      plan.tier === 'starter' ? 'border-indigo-200' : 'border-gray-100'
                    }`}>
                    {isCurrent && (
                      <div className="absolute -top-2.5 left-4 bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                        현재 플랜
                      </div>
                    )}
                    <h3 className="font-bold text-gray-900 mb-1">{plan.name}</h3>
                    <div className="flex items-end gap-1 mb-1">
                      <span className="text-2xl font-black text-gray-900">
                        {plan.price === 0 ? '무료' : `₩${(plan.price / 10000).toFixed(0)}만`}
                      </span>
                      {plan.price > 0 && <span className="text-gray-400 text-sm mb-0.5">/월</span>}
                    </div>
                    <div className="text-xs text-indigo-600 font-medium mb-4">
                      AI 직원 최대 {plan.maxEmployees === 999 ? '무제한' : `${plan.maxEmployees}명`}
                    </div>
                    <div className="space-y-2 mb-5">
                      {plan.features.map((feat) => (
                        <div key={feat} className="flex items-center gap-1.5 text-xs text-gray-600">
                          <span className="text-emerald-500">✓</span>
                          {feat}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => updateCompanySettings({ subscriptionTier: plan.tier })}
                      disabled={isCurrent}
                      className={`w-full py-2 rounded-xl text-sm font-bold transition-all ${
                        isCurrent
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}>
                      {isCurrent ? '현재 플랜' : plan.price === 0 ? '다운그레이드' : '업그레이드'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Obsidian 백업 */}
            <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">📔</span>
                <div>
                  <h3 className="font-bold text-gray-900">Obsidian 백업</h3>
                  <p className="text-xs text-gray-400">모든 데이터를 Obsidian Vault에 백업합니다</p>
                </div>
              </div>
              <a href="/api/obsidian-export" download="bossai-backup.md"
                className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors">
                📥 Obsidian Vault 내보내기
              </a>
              <p className="text-xs text-gray-400 mt-2">
                마크다운 형식으로 내보낸 후 Obsidian Vault 폴더에 넣으면 됩니다.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
