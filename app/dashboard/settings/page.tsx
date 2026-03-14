'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { AIProvider, AI_PROVIDER_INFO, SUBSCRIPTION_PLANS, SubscriptionTier, ANIMAL_EMOJI } from '@/lib/types';

const PLATFORM_INFO: Record<string, { label: string; icon: string; color: string }> = {
  twitter:  { label: '트위터/X',  icon: '🐦', color: 'from-blue-400 to-blue-600' },
  threads:  { label: '스레드',    icon: '🧵', color: 'from-gray-700 to-black' },
  facebook: { label: '페이스북',  icon: '📘', color: 'from-blue-500 to-blue-700' },
};

interface SNSConnection {
  platform: string;
  platform_username: string;
  platform_display_name: string;
  platform_avatar: string | null;
  is_active: boolean;
}

export default function SettingsPage() {
  const { companySettings, updateCompanySettings, employees, updateEmployeeAI } = useStore();
  const [activeTab, setActiveTab] = useState<'ai' | 'company' | 'plan' | 'sns' | 'notion' | 'google' | 'coupang' | 'apikeys' | 'naver' | 'gallery'>('ai');
  const [snsConnections, setSnsConnections] = useState<SNSConnection[]>([]);

  // Notion settings state
  const [notionApiKey, setNotionApiKey] = useState('');
  const [notionDbId, setNotionDbId] = useState('');
  const [notionSaved, setNotionSaved] = useState(false);
  const [notionStatus, setNotionStatus] = useState<{ connected: boolean; databaseName?: string; reason?: string } | null>(null);

  // Coupang Partners state
  const [coupangAccessKey, setCoupangAccessKey] = useState('');
  const [coupangSecretKey, setCoupangSecretKey] = useState('');
  const [coupangConfigured, setCoupangConfigured] = useState(false);
  const [coupangSaving, setCoupangSaving] = useState(false);
  const [coupangMsg, setCoupangMsg] = useState('');

  // Naver API state
  const [naverKeys, setNaverKeys] = useState({ NAVER_CLIENT_ID: '', NAVER_CLIENT_SECRET: '', NAVER_AD_API_KEY: '', NAVER_AD_SECRET: '', NAVER_AD_CUSTOMER_ID: '' });
  const [naverKeyStatus, setNaverKeyStatus] = useState<Record<string, boolean>>({});
  const [naverSaving, setNaverSaving] = useState(false);
  const [naverMsg, setNaverMsg] = useState('');

  // API 키 관리 state
  const [apiKeys, setApiKeys] = useState({ GEMINI_API_KEY: '', OPENAI_API_KEY: '', CLAUDE_API_KEY: '', PIXABAY_API_KEY: '', PEXELS_API_KEY: '', GOOGLE_TTS_API_KEY: '', N8N_WEBHOOK_SECRET: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({});
  const [apiKeysSaving, setApiKeysSaving] = useState(false);
  const [apiKeysMsg, setApiKeysMsg] = useState('');

  // Gallery settings state
  const [galleryPw, setGalleryPw] = useState('');
  const [galleryPwSet, setGalleryPwSet] = useState(false);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryMsg, setGalleryMsg] = useState('');

  // Google Calendar state
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleOauthConfigured, setGoogleOauthConfigured] = useState(true);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [googleMsg, setGoogleMsg] = useState('');

  useEffect(() => {
    if (activeTab === 'sns') {
      fetch('/api/sns/connections').then((r) => r.ok ? r.json() : []).then(setSnsConnections);
    }
    if (activeTab === 'notion') {
      fetch('/api/notion/settings').then((r) => r.ok ? r.json() : {}).then((d: { databaseId?: string }) => {
        setNotionDbId(d.databaseId ?? '');
      });
      fetch('/api/notion/status').then((r) => r.ok ? r.json() : null).then((d: { connected: boolean; databaseName?: string; reason?: string } | null) => {
        if (d) setNotionStatus(d);
      });
    }
    if (activeTab === 'coupang') {
      fetch('/api/coupang/settings')
        .then((r) => r.ok ? r.json() : {})
        .then((d: { configured?: boolean }) => setCoupangConfigured(!!d.configured));
    }
    if (activeTab === 'apikeys') {
      fetch('/api/app-settings')
        .then((r) => r.ok ? r.json() : {})
        .then((d: { hasKey?: Record<string, boolean> }) => {
          if (d.hasKey) setApiKeyStatus(d.hasKey);
        });
    }
    if (activeTab === 'naver') {
      fetch('/api/app-settings')
        .then((r) => r.ok ? r.json() : {})
        .then((d: { hasKey?: Record<string, boolean> }) => {
          if (d.hasKey) setNaverKeyStatus(d.hasKey);
        });
    }
    if (activeTab === 'gallery') {
      fetch('/api/app-settings')
        .then((r) => r.ok ? r.json() : {})
        .then((d: { hasKey?: Record<string, boolean> }) => {
          setGalleryPwSet(!!d.hasKey?.['GALLERY_SECRET_PASSWORD']);
        });
    }
    if (activeTab === 'google') {
      fetch('/api/google/status')
        .then((r) => r.ok ? r.json() : { connected: false })
        .then((d: { connected: boolean; email?: string; oauthConfigured?: boolean }) => {
          setGoogleConnected(d.connected);
          setGoogleEmail(d.email ?? '');
          setGoogleOauthConfigured(d.oauthConfigured ?? true);
        });
    }
  }, [activeTab]);

  const disconnectSNS = async (platform: string) => {
    if (!confirm(`${PLATFORM_INFO[platform]?.label} 연결을 해제하시겠습니까?`)) return;
    await fetch('/api/sns/connections', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform }) });
    setSnsConnections((prev) => prev.filter((c) => c.platform !== platform));
  };
  const [saved, setSaved] = useState(false);

  // 글로벌 AI 설정 폼
  const [globalAI, setGlobalAI] = useState({
    provider: (companySettings.globalAIConfig?.provider || 'gemini') as AIProvider,
    apiKey: companySettings.globalAIConfig?.apiKey || '',
    model: companySettings.globalAIConfig?.model || 'gemini-2.0-flash',
  });

  // AI 동작 커스터마이징 폼
  const [aiCustom, setAiCustom] = useState({
    responseLanguage: companySettings.responseLanguage || 'ko',
    responseLength: companySettings.responseLength || 'concise',
    globalCustomInstructions: companySettings.globalCustomInstructions || '',
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
    companyBio: companySettings.companyBio || '',
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

  const handleSaveAICustom = () => {
    updateCompanySettings({
      responseLanguage: aiCustom.responseLanguage as 'ko' | 'en' | 'auto',
      responseLength: aiCustom.responseLength as 'concise' | 'normal' | 'detailed',
      globalCustomInstructions: aiCustom.globalCustomInstructions,
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
    updateCompanySettings({ ...companyForm });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveApiKeys = async () => {
    setApiKeysSaving(true); setApiKeysMsg('');
    const r = await fetch('/api/app-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiKeys),
    });
    if (r.ok) {
      setApiKeysMsg('✅ 저장 완료');
      setApiKeys({ GEMINI_API_KEY: '', OPENAI_API_KEY: '', CLAUDE_API_KEY: '', PIXABAY_API_KEY: '', PEXELS_API_KEY: '', GOOGLE_TTS_API_KEY: '', N8N_WEBHOOK_SECRET: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });
      const updated: Record<string, boolean> = { ...apiKeyStatus };
      Object.entries(apiKeys).forEach(([k, v]) => { if (v.trim()) updated[k] = true; });
      setApiKeyStatus(updated);
    } else {
      const errData = await r.json().catch(() => ({})) as { error?: string };
      setApiKeysMsg(`❌ 저장 실패: ${errData.error || r.status}`);
    }
    setApiKeysSaving(false);
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
        <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-100 pb-4">
          {[['ai', '🤖 AI 설정'], ['apikeys', '🔑 API 키'], ['naver', '🟢 네이버 API'], ['company', '🏢 회사 정보'], ['plan', '💳 구독 플랜'], ['sns', '🌐 SNS 연결'], ['notion', '📔 Notion 연동'], ['google', '📅 Google 캘린더'], ['coupang', '🛒 쿠팡파트너스'], ['gallery', '🖼️ 갤러리']].map(([v, l]) => (
            <button key={v} onClick={() => setActiveTab(v as typeof activeTab)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>{l}</button>
          ))}
        </div>

        {/* 네이버 API 탭 */}
        {activeTab === 'naver' && (
          <div className="space-y-6 max-w-2xl">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-900 space-y-2">
              <p className="font-bold">🟢 네이버 API 키 설정</p>
              <p>키워드 도구, 블로그 판독기, 노출 체크, 가격 비교 등 마케팅 기능을 사용하려면 네이버 API 키가 필요합니다.</p>
              <div className="text-xs text-green-700 space-y-1.5">
                <div className="flex gap-2 items-start">
                  <span className="mt-0.5 flex-shrink-0">①</span>
                  <span><strong>오픈 API (Client ID/Secret)</strong>: <a href="https://developers.naver.com/apps" target="_blank" rel="noopener" className="underline">developers.naver.com/apps</a> → 앱 등록 → 검색·데이터랩·쇼핑 권한 추가</span>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="mt-0.5 flex-shrink-0">②</span>
                  <span><strong>검색광고 API</strong>: <a href="https://searchad.naver.com" target="_blank" rel="noopener" className="underline">searchad.naver.com</a> → 도구 → API 관리 (키워드 검색량 조회용)</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-bold text-gray-800">네이버 오픈 API (검색·데이터랩·쇼핑)</h3>
              {([
                { key: 'NAVER_CLIENT_ID', label: 'Client ID', placeholder: '네이버 앱 Client ID' },
                { key: 'NAVER_CLIENT_SECRET', label: 'Client Secret', placeholder: '네이버 앱 Client Secret' },
              ] as const).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                    {naverKeyStatus[key] && <span className="ml-2 text-xs text-green-600 font-normal">✅ 등록됨</span>}
                  </label>
                  <input
                    type="password"
                    value={naverKeys[key]}
                    onChange={e => setNaverKeys(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={naverKeyStatus[key] ? '••••••••••••' : placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-400 focus:border-transparent"
                  />
                </div>
              ))}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-bold text-gray-800">네이버 검색광고 API (키워드 검색량)</h3>
              <p className="text-xs text-gray-500">황금키워드 검색량 조회에 필요. searchad.naver.com에서 발급</p>
              {([
                { key: 'NAVER_AD_API_KEY', label: 'API 고객 ID (Access License)', placeholder: '검색광고 API 고객 ID' },
                { key: 'NAVER_AD_SECRET', label: 'Secret Key', placeholder: '검색광고 Secret Key' },
                { key: 'NAVER_AD_CUSTOMER_ID', label: 'Customer ID', placeholder: '검색광고 Customer ID (숫자)' },
              ] as const).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                    {naverKeyStatus[key] && <span className="ml-2 text-xs text-green-600 font-normal">✅ 등록됨</span>}
                  </label>
                  <input
                    type="password"
                    value={naverKeys[key]}
                    onChange={e => setNaverKeys(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={naverKeyStatus[key] ? '••••••••••••' : placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-400 focus:border-transparent"
                  />
                </div>
              ))}
            </div>

            {naverMsg && (
              <div className={`p-3 rounded-xl text-sm font-medium ${naverMsg.includes('완료') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {naverMsg}
              </div>
            )}
            <button
              onClick={async () => {
                setNaverSaving(true); setNaverMsg('');
                try {
                  const res = await fetch('/api/app-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(naverKeys) });
                  if (res.ok) { setNaverMsg('✅ 저장 완료'); setNaverKeys({ NAVER_CLIENT_ID: '', NAVER_CLIENT_SECRET: '', NAVER_AD_API_KEY: '', NAVER_AD_SECRET: '', NAVER_AD_CUSTOMER_ID: '' }); }
                  else setNaverMsg('저장 실패');
                } finally { setNaverSaving(false); }
              }}
              disabled={naverSaving}
              className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl disabled:opacity-50"
            >
              {naverSaving ? '저장 중...' : '🟢 네이버 API 키 저장'}
            </button>
          </div>
        )}

        {/* API 키 관리 탭 */}
        {activeTab === 'apikeys' && (
          <div className="space-y-6 max-w-2xl">
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-800 space-y-1.5">
              <p className="font-bold">ℹ️ API 키 관리 안내</p>
              <p>여기서 저장한 키는 Supabase DB에 암호화 없이 저장됩니다. 보안이 중요한 프로덕션 환경에서는 Vercel 환경변수 사용을 권장합니다.</p>
              <p className="text-xs text-blue-600">설정한 키가 있으면 DB 키 우선 사용 → 없으면 Vercel 환경변수 폴백</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-bold text-gray-900">🤖 AI API 키</h2>

              {([
                { key: 'GEMINI_API_KEY', label: 'Gemini API Key', desc: 'AI 채팅, 이미지 생성, 네이버 썸네일 자동생성', link: 'https://aistudio.google.com/app/apikey' },
                { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', desc: 'SEO 리라이팅, 자동 태그 생성, 네이버 GPT 리라이팅', link: 'https://platform.openai.com/api-keys' },
                { key: 'CLAUDE_API_KEY', label: 'Claude API Key', desc: '네이버 블로그 Claude 리라이팅', link: 'https://console.anthropic.com/settings/keys' },
                { key: 'PIXABAY_API_KEY', label: 'Pixabay API Key', desc: '숏폼 이미지 검색 · 네이버 블로그 이미지 (무료)', link: 'https://pixabay.com/api/docs/' },
                { key: 'PEXELS_API_KEY', label: 'Pexels API Key', desc: '숏폼 고화질 이미지 검색 (무료)', link: 'https://www.pexels.com/api/' },
                { key: 'GOOGLE_TTS_API_KEY', label: 'Google TTS API Key', desc: '숏폼 제작 1 한국어 Neural2 고품질 TTS · 무료 1M자/월', link: 'https://console.cloud.google.com/apis/library/texttospeech.googleapis.com' },
              ] as const).map(({ key, label, desc, link }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-700">{label}</label>
                    <div className="flex items-center gap-2">
                      {apiKeyStatus[key] ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">✅ 설정됨</span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">⚠️ 미설정</span>
                      )}
                      <a href={link} target="_blank" rel="noopener" className="text-[10px] text-blue-500 hover:underline">발급받기 →</a>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mb-1.5">{desc}</p>
                  <input
                    type="password"
                    value={apiKeys[key as keyof typeof apiKeys]}
                    onChange={(e) => setApiKeys(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={apiKeyStatus[key] ? '새 키를 입력하면 교체됩니다' : `${label} 입력`}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-400"
                  />
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-bold text-gray-900">⚙️ 기타 서비스 키</h2>

              {([
                { key: 'N8N_WEBHOOK_SECRET', label: 'n8n Webhook Secret', desc: 'n8n 자동화 연동 시크릿' },
                { key: 'GOOGLE_CLIENT_ID', label: 'Google Client ID', desc: 'Google Calendar OAuth (Vercel 환경변수로도 설정 가능)' },
                { key: 'GOOGLE_CLIENT_SECRET', label: 'Google Client Secret', desc: 'Google Calendar OAuth 시크릿' },
              ] as const).map(({ key, label, desc }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-700">{label}</label>
                    {apiKeyStatus[key] ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">✅ 설정됨</span>
                    ) : (
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">미설정</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mb-1.5">{desc}</p>
                  <input
                    type="password"
                    value={apiKeys[key as keyof typeof apiKeys] || ''}
                    onChange={(e) => setApiKeys(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={apiKeyStatus[key] ? '새 키를 입력하면 교체됩니다' : `${label} 입력`}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-indigo-400"
                  />
                </div>
              ))}
            </div>

            {apiKeysMsg && (
              <div className={`p-3 rounded-xl text-sm font-medium ${apiKeysMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {apiKeysMsg}
              </div>
            )}

            <button
              onClick={handleSaveApiKeys}
              disabled={apiKeysSaving || Object.values(apiKeys).every(v => !v.trim())}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-3 rounded-xl font-bold text-sm transition-colors"
            >
              {apiKeysSaving ? '저장 중...' : '💾 API 키 저장'}
            </button>

            {/* Vercel 필수 설정 가이드 */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
              <h3 className="font-bold text-sm text-amber-900">🚨 Vercel에서 반드시 설정해야 하는 환경변수</h3>
              <p className="text-xs text-amber-700">아래 3+2개는 웹에서 설정 불가. Vercel 대시보드 → 프로젝트 → Settings → Environment Variables에서 추가하세요.</p>
              <div className="space-y-2">
                {[
                  { key: 'NEXT_PUBLIC_SUPABASE_URL', desc: 'Supabase 프로젝트 URL', example: 'https://xxx.supabase.co' },
                  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', desc: 'Supabase 공개 키 (anon key)', example: 'eyJ...' },
                  { key: 'SUPABASE_SERVICE_ROLE_KEY', desc: 'Supabase 서비스 롤 키 (비공개!)', example: 'eyJ...' },
                  { key: 'NEXT_PUBLIC_APP_URL', desc: '앱 URL', example: 'https://loov.co.kr' },
                  { key: 'NEXT_PUBLIC_MAIN_DOMAIN', desc: '메인 도메인', example: 'loov.co.kr' },
                ].map(({ key, desc, example }) => (
                  <div key={key} className="bg-white rounded-xl p-3 border border-amber-100">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <code className="text-xs font-bold text-gray-900">{key}</code>
                        <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
                      </div>
                      <code className="text-[10px] text-gray-400 shrink-0">{example}</code>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl p-3 border border-amber-100 text-xs text-gray-600">
                <p className="font-semibold mb-1">📁 로컬 에이전트용 (.env.local)</p>
                <p><code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> — 위와 동일</p>
                <p><code className="bg-gray-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> — 위와 동일</p>
                <p className="mt-1 text-[10px] text-gray-400">네이버 로컬 에이전트 실행 시 필요</p>
              </div>
            </div>
          </div>
        )}

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

                  {/* 현재 저장된 키 미리보기 */}
                  {companySettings.globalAIConfig?.apiKey && (
                    <div className={`mb-2 px-3 py-2 rounded-xl text-xs font-mono flex items-center justify-between ${
                      companySettings.globalAIConfig.apiKey.startsWith('http')
                        ? 'bg-red-50 border border-red-200 text-red-700'
                        : 'bg-gray-50 border border-gray-200 text-gray-600'
                    }`}>
                      <span>
                        {companySettings.globalAIConfig.apiKey.startsWith('http')
                          ? '⚠️ 저장된 값이 URL입니다 — 올바른 API 키를 다시 입력하세요'
                          : `현재 저장: ${companySettings.globalAIConfig.apiKey.slice(0, 6)}${'•'.repeat(8)}${companySettings.globalAIConfig.apiKey.slice(-4)}`
                        }
                      </span>
                      <button
                        onClick={() => {
                          updateCompanySettings({ globalAIConfig: { ...companySettings.globalAIConfig!, apiKey: '' } });
                          setGlobalAI({ ...globalAI, apiKey: '' });
                        }}
                        className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                        title="저장된 키 초기화"
                      >✕</button>
                    </div>
                  )}

                  <input
                    type="text"
                    value={globalAI.apiKey}
                    onChange={(e) => setGlobalAI({ ...globalAI, apiKey: e.target.value.trim() })}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none font-mono ${
                      globalAI.apiKey.startsWith('http')
                        ? 'border-red-300 bg-red-50 focus:border-red-400'
                        : 'border-gray-200 focus:border-indigo-400'
                    }`}
                    placeholder={AI_PROVIDER_INFO[globalAI.provider].placeholder}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {globalAI.apiKey.startsWith('http') && (
                    <p className="text-xs text-red-600 mt-1 font-medium">
                      ⚠️ URL이 아닌 API 키를 입력하세요 ({AI_PROVIDER_INFO[globalAI.provider].placeholder} 형식)
                    </p>
                  )}
                  {!globalAI.apiKey.startsWith('http') && (
                    <p className="text-xs text-gray-400 mt-1">
                      API 키는 로컬에만 저장되며 외부로 전송되지 않습니다.
                    </p>
                  )}
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

            {/* AI 동작 커스터마이징 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-5">
                <span className="text-xl">🎛️</span>
                <div>
                  <h2 className="font-bold text-gray-900">AI 동작 설정</h2>
                  <p className="text-xs text-gray-400">모든 직원의 응답 방식을 커스터마이징</p>
                </div>
              </div>

              <div className="space-y-5">
                {/* 응답 언어 */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">응답 언어</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: 'ko' as const, label: '한국어', desc: '항상 한국어로' },
                      { v: 'en' as const, label: 'English', desc: 'Always in English' },
                      { v: 'auto' as const, label: '자동', desc: '입력 언어에 맞춰' },
                    ].map(({ v, label, desc }) => (
                      <button key={v}
                        onClick={() => setAiCustom({ ...aiCustom, responseLanguage: v })}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          aiCustom.responseLanguage === v
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                        }`}>
                        <div className="text-sm font-bold text-gray-800">{label}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 응답 길이 */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">응답 길이</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: 'concise' as const, label: '간결', desc: '2~4문장 핵심만' },
                      { v: 'normal' as const, label: '보통', desc: '적절한 분량' },
                      { v: 'detailed' as const, label: '상세', desc: '예시·설명 포함' },
                    ].map(({ v, label, desc }) => (
                      <button key={v}
                        onClick={() => setAiCustom({ ...aiCustom, responseLength: v })}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          aiCustom.responseLength === v
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                        }`}>
                        <div className="text-sm font-bold text-gray-800">{label}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 전체 공통 지시사항 */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">
                    전체 직원 공통 지시사항
                    <span className="text-xs font-normal text-gray-400 ml-2">모든 AI 직원에게 적용</span>
                  </label>
                  <textarea
                    value={aiCustom.globalCustomInstructions}
                    onChange={(e) => setAiCustom({ ...aiCustom, globalCustomInstructions: e.target.value })}
                    rows={3}
                    placeholder={'예:\n- 답변 끝에 항상 다음 행동 제안 포함\n- 수치나 통계가 있으면 반드시 언급\n- 이모지 사용 금지'}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                  />
                </div>

                <button onClick={handleSaveAICustom}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all ${
                    saved ? 'bg-emerald-500 text-white' : 'bg-gray-900 hover:bg-gray-700 text-white'
                  }`}>
                  {saved ? '✓ 저장됨' : '동작 설정 저장'}
                </button>
              </div>
            </div>

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
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">
                  회사 소개
                  <span className="font-normal text-gray-400 ml-1">— AI 직원이 참고하는 비즈니스 컨텍스트</span>
                </label>
                <textarea
                  value={companyForm.companyBio}
                  onChange={(e) => setCompanyForm({ ...companyForm, companyBio: e.target.value })}
                  rows={4}
                  placeholder={'예:\n우리 회사는 소상공인을 위한 AI 솔루션을 제공합니다.\n주요 제품: LOOV 대시보드 (월 구독형)\n주요 고객: 1인 사업자, 소규모 팀\n현재 베타 서비스 중이며 유료 전환 예정'}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  여기 입력한 내용이 모든 AI 직원의 시스템 프롬프트에 자동으로 포함됩니다.
                </p>
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

        {/* Notion 연동 탭 */}
        {activeTab === 'notion' && (
          <div className="space-y-6 max-w-2xl">
            {/* Connection status */}
            {notionStatus && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
                notionStatus.connected
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${notionStatus.connected ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                {notionStatus.connected
                  ? `연결됨 — ${notionStatus.databaseName}`
                  : `미연결${notionStatus.reason ? ` (${notionStatus.reason})` : ''}`
                }
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">📔</span>
                <div>
                  <h2 className="font-bold text-gray-900">Notion API 설정</h2>
                  <p className="text-xs text-gray-400">파일 분석 결과를 저장할 Notion Integration 정보</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">Integration API 키</label>
                <input
                  type="password"
                  value={notionApiKey}
                  onChange={(e) => setNotionApiKey(e.target.value.trim())}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-mono"
                  placeholder="secret_xxxxxxxxxxxx"
                  autoComplete="off"
                />
                <p className="text-xs text-gray-400 mt-1">Notion Integrations 페이지에서 발급한 Internal Integration Token</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">데이터베이스 ID</label>
                <input
                  type="text"
                  value={notionDbId}
                  onChange={(e) => setNotionDbId(e.target.value.trim())}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-mono"
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
                <p className="text-xs text-gray-400 mt-1">Notion DB URL에서 복사: notion.so/workspace/<strong>DB_ID</strong>?v=...</p>
              </div>

              <button
                onClick={async () => {
                  const body: Record<string, string> = { databaseId: notionDbId };
                  if (notionApiKey) body.apiKey = notionApiKey;
                  await fetch('/api/notion/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  });
                  setNotionSaved(true);
                  setTimeout(() => setNotionSaved(false), 2000);
                  // Re-check status
                  const res = await fetch('/api/notion/status');
                  if (res.ok) {
                    const s: { connected: boolean; databaseName?: string; reason?: string } = await res.json();
                    setNotionStatus(s);
                  }
                }}
                className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all ${
                  notionSaved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {notionSaved ? '✓ 저장됨' : '설정 저장 및 연결 확인'}
              </button>
            </div>

            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5">
              <h3 className="font-bold text-gray-900 mb-3">💡 Notion 설정 방법</h3>
              <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
                <li><a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">notion.so/my-integrations</a>에서 새 Integration 생성</li>
                <li>생성된 <strong>Internal Integration Token</strong>을 위 API 키 필드에 입력</li>
                <li>Notion에서 대상 데이터베이스 열기 → ⋯ 메뉴 → Connections → Integration 연결</li>
                <li>DB URL에서 ID 복사 (32자리 hex, 하이픈 제외)</li>
                <li>DB에 컬럼 추가: Name(제목), 카테고리(선택), 파일명(텍스트), 유형(선택), 요약(텍스트), 태그(다중선택), 날짜(날짜)</li>
              </ol>
            </div>
          </div>
        )}

        {/* Google 캘린더 탭 */}
        {activeTab === 'google' && (
          <div className="space-y-6 max-w-2xl">
            {/* OAuth 미설정 경고 */}
            {!googleOauthConfigured && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                <div className="font-bold mb-1">⚠️ Google OAuth 환경변수가 설정되지 않았습니다</div>
                <div className="text-xs">Vercel 대시보드 → Settings → Environment Variables에서 아래 3개를 추가하세요:</div>
                <div className="mt-2 bg-amber-100 rounded-lg px-3 py-2 font-mono text-xs space-y-0.5">
                  <div>GOOGLE_CLIENT_ID</div>
                  <div>GOOGLE_CLIENT_SECRET</div>
                  <div>GOOGLE_REDIRECT_URI = https://loov.co.kr/api/google/callback</div>
                </div>
              </div>
            )}

            {/* 연결 상태 */}
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
              googleConnected
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}>
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${googleConnected ? 'bg-emerald-400' : 'bg-gray-300'}`} />
              {googleConnected ? `연결됨 — ${googleEmail}` : '미연결'}
            </div>

            {googleMsg && (
              <div className={`px-4 py-3 rounded-xl text-sm ${
                googleMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>{googleMsg}</div>
            )}

            {/* 연결/해제 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">📅</span>
                <div>
                  <h2 className="font-bold text-gray-900">Google Calendar 연동</h2>
                  <p className="text-xs text-gray-400">LOOV 일정과 Google Calendar를 양방향 동기화</p>
                </div>
              </div>

              {!googleConnected ? (
                <button
                  onClick={() => { window.location.href = '/api/google/connect'; }}
                  className="w-full py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Google 계정으로 연결
                </button>
              ) : (
                <div className="space-y-3">
                  {/* 동기화 버튼 */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { dir: 'import' as const, label: '⬇️ 가져오기', desc: 'Google → LOOV' },
                      { dir: 'both' as const, label: '🔄 양방향', desc: '완전 동기화' },
                      { dir: 'export' as const, label: '⬆️ 내보내기', desc: 'LOOV → Google' },
                    ].map(({ dir, label, desc }) => (
                      <button
                        key={dir}
                        disabled={googleSyncing}
                        onClick={async () => {
                          setGoogleSyncing(true);
                          setGoogleMsg('');
                          try {
                            const res = await fetch('/api/google/sync', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ direction: dir }),
                            });
                            const data: { imported?: number; exported?: number; message?: string; error?: string } = await res.json();
                            if (res.ok) {
                              const parts = [];
                              if (data.imported !== undefined) parts.push(`가져옴 ${data.imported}건`);
                              if (data.exported !== undefined) parts.push(`내보냄 ${data.exported}건`);
                              setGoogleMsg(`✅ 동기화 완료 — ${parts.join(', ')}`);
                            } else {
                              setGoogleMsg(`오류: ${data.error || '동기화 실패'}`);
                            }
                          } finally {
                            setGoogleSyncing(false);
                          }
                        }}
                        className="p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-center disabled:opacity-50 transition-all"
                      >
                        <div className="text-sm font-bold text-gray-800">{label}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                  {googleSyncing && (
                    <div className="text-xs text-center text-blue-600 animate-pulse">동기화 중...</div>
                  )}
                  {/* 연결 해제 */}
                  <button
                    onClick={async () => {
                      if (!confirm('Google Calendar 연결을 해제하시겠습니까?')) return;
                      await fetch('/api/google/disconnect', { method: 'POST' });
                      setGoogleConnected(false);
                      setGoogleEmail('');
                      setGoogleMsg('Google Calendar 연결이 해제되었습니다.');
                    }}
                    className="w-full text-xs text-red-500 border border-red-100 hover:border-red-200 rounded-xl py-2 transition-colors"
                  >
                    연결 해제
                  </button>
                </div>
              )}
            </div>

            {/* 가이드 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5">
              <h3 className="font-bold text-gray-900 mb-3">💡 Google Calendar 설정 방법</h3>
              <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
                <li><a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Cloud Console</a>에서 프로젝트 생성</li>
                <li>OAuth 2.0 클라이언트 ID 생성 (웹 애플리케이션 유형)</li>
                <li>승인된 리디렉션 URI 추가: <code className="bg-white px-1.5 py-0.5 rounded text-xs font-mono">{typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/google/callback</code></li>
                <li>환경변수에 추가:
                  <div className="mt-1.5 bg-gray-800 text-green-300 text-xs font-mono rounded-xl px-3 py-2 space-y-0.5">
                    <div>GOOGLE_CLIENT_ID=...</div>
                    <div>GOOGLE_CLIENT_SECRET=...</div>
                    <div>GOOGLE_REDIRECT_URI=https://your-domain.com/api/google/callback</div>
                  </div>
                </li>
                <li>Vercel 환경변수에도 동일하게 등록 후 재배포</li>
              </ol>
            </div>
          </div>
        )}

        {/* SNS 연결 탭 */}
        {activeTab === 'sns' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">소셜 미디어 계정을 연결하면 LOOV에서 직접 게시글을 발행할 수 있습니다.</p>
            <div className="grid md:grid-cols-3 gap-4">
              {Object.entries(PLATFORM_INFO).map(([platform, info]) => {
                const conn = snsConnections.find((c) => c.platform === platform);
                return (
                  <div key={platform} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className={`h-1.5 bg-gradient-to-r ${info.color}`} />
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${info.color} flex items-center justify-center text-xl`}>
                          {info.icon}
                        </div>
                        <div>
                          <div className="font-bold text-gray-800 text-sm">{info.label}</div>
                          <div className="flex items-center gap-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${conn?.is_active ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                            <span className="text-xs text-gray-400">{conn?.is_active ? '연결됨' : '미연결'}</span>
                          </div>
                        </div>
                      </div>
                      {conn?.is_active ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5">
                            {conn.platform_avatar && <img src={conn.platform_avatar} alt="" className="w-8 h-8 rounded-full" />}
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-700 truncate">{conn.platform_display_name}</div>
                              <div className="text-xs text-gray-400 truncate">{conn.platform_username}</div>
                            </div>
                          </div>
                          <button onClick={() => disconnectSNS(platform)} className="w-full text-xs text-red-500 border border-red-100 hover:border-red-200 rounded-xl py-2 transition-colors">
                            연결 해제
                          </button>
                        </div>
                      ) : (
                        <a href={`/api/sns/connect/${platform}`} className={`block w-full text-center bg-gradient-to-r ${info.color} text-white text-sm font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity`}>
                          연결하기
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-700">
              연결 후 <a href="/dashboard/sns" className="font-bold underline">SNS 관리 페이지</a>에서 게시글 템플릿 작성 및 즉시 발행이 가능합니다.
            </div>
          </div>
        )}
        {/* 쿠팡파트너스 탭 */}
        {activeTab === 'coupang' && (
          <div className="space-y-6 max-w-2xl">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-xl">🛒</div>
                <div>
                  <div className="font-bold text-gray-800">쿠팡파트너스 API 키</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${coupangConfigured ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                    <span className="text-xs text-gray-400">{coupangConfigured ? '연결됨' : '미설정'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Access Key</label>
                  <input
                    type="text"
                    value={coupangAccessKey}
                    onChange={(e) => setCoupangAccessKey(e.target.value)}
                    placeholder="쿠팡파트너스 Access Key 입력"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Secret Key</label>
                  <input
                    type="password"
                    value={coupangSecretKey}
                    onChange={(e) => setCoupangSecretKey(e.target.value)}
                    placeholder="쿠팡파트너스 Secret Key 입력"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 font-mono"
                  />
                </div>
                {coupangMsg && (
                  <p className={`text-xs ${coupangMsg.includes('저장') ? 'text-emerald-600' : 'text-red-500'}`}>{coupangMsg}</p>
                )}
                <button
                  disabled={coupangSaving || !coupangAccessKey.trim() || !coupangSecretKey.trim()}
                  onClick={async () => {
                    setCoupangSaving(true);
                    setCoupangMsg('');
                    const res = await fetch('/api/coupang/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ accessKey: coupangAccessKey, secretKey: coupangSecretKey }),
                    });
                    if (res.ok) {
                      setCoupangConfigured(true);
                      setCoupangMsg('✓ 저장되었습니다');
                      setCoupangAccessKey('');
                      setCoupangSecretKey('');
                    } else {
                      const d = await res.json();
                      setCoupangMsg(`오류: ${d.error}`);
                    }
                    setCoupangSaving(false);
                  }}
                  className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors">
                  {coupangSaving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>

            {/* 발급 방법 안내 */}
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
              <h4 className="font-bold text-orange-800 mb-3 text-sm">📋 API 키 발급 방법</h4>
              <ol className="space-y-2 text-sm text-orange-700 list-decimal list-inside">
                <li><a href="https://partners.coupang.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">partners.coupang.com</a>에 로그인</li>
                <li>우측 상단 프로필 클릭 → <strong>마이페이지</strong> 이동</li>
                <li><strong>API 키 관리</strong> 메뉴에서 Access Key / Secret Key 확인</li>
                <li>위 입력창에 붙여넣고 저장</li>
              </ol>
              <div className="mt-3 bg-white rounded-xl p-3 text-xs text-orange-600">
                💡 저장 후 <a href="/dashboard/coupang" className="underline font-bold">쿠팡파트너스 페이지</a>에서 상품 검색 → 제휴링크 생성 → SNS 자동 홍보가 가능합니다
              </div>
            </div>
          </div>
        )}

        {/* 갤러리 탭 */}
        {activeTab === 'gallery' && (
          <div className="space-y-6 max-w-2xl">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🔒</span>
                <div>
                  <h2 className="font-bold text-gray-900">비밀 갤러리 비밀번호</h2>
                  <p className="text-xs text-gray-400">비밀 카테고리 갤러리를 열 때 필요한 비밀번호를 설정합니다</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">
                  비밀번호
                  {galleryPwSet && <span className="ml-2 text-xs text-emerald-600 font-normal">✅ 설정됨</span>}
                </label>
                <input
                  type="password"
                  value={galleryPw}
                  onChange={(e) => setGalleryPw(e.target.value)}
                  placeholder={galleryPwSet ? '새 비밀번호를 입력하면 교체됩니다' : '비밀번호 입력'}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400"
                  autoComplete="new-password"
                />
                <p className="text-xs text-gray-400 mt-1">비밀 갤러리에 접근할 때마다 이 비밀번호를 입력해야 합니다</p>
              </div>

              {galleryMsg && (
                <div className={`p-3 rounded-xl text-sm font-medium ${galleryMsg.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {galleryMsg}
                </div>
              )}

              <button
                disabled={gallerySaving || !galleryPw.trim()}
                onClick={async () => {
                  setGallerySaving(true); setGalleryMsg('');
                  const res = await fetch('/api/app-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ GALLERY_SECRET_PASSWORD: galleryPw }),
                  });
                  if (res.ok) {
                    setGalleryMsg('✅ 비밀번호가 저장되었습니다');
                    setGalleryPwSet(true);
                    setGalleryPw('');
                  } else {
                    setGalleryMsg('❌ 저장 실패');
                  }
                  setGallerySaving(false);
                }}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-colors"
              >
                {gallerySaving ? '저장 중...' : '🔒 비밀번호 저장'}
              </button>
            </div>

            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5">
              <h3 className="font-bold text-gray-900 mb-2">💡 갤러리 사용 안내</h3>
              <ul className="space-y-1.5 text-sm text-gray-600">
                <li className="flex gap-2"><span className="text-blue-500">🙋</span><span><strong>개인용</strong> — 개인 사진 및 메모</span></li>
                <li className="flex gap-2"><span className="text-emerald-500">💼</span><span><strong>업무용</strong> — 업무 자료 및 레퍼런스</span></li>
                <li className="flex gap-2"><span className="text-purple-500">🔒</span><span><strong>비밀용</strong> — 위에서 설정한 비밀번호로 보호됩니다</span></li>
                <li className="flex gap-2"><span className="text-indigo-400">📔</span><span>각 사진에 <strong>Notion 페이지를 연결</strong>할 수 있습니다 (Notion 연동 먼저 설정)</span></li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
