'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 1 | 2 | 3 | 4;

const PLANS = [
  { id: 'free', label: '무료', price: '0원', desc: '기본 기능 사용. NAS/Notion 연동 불가.' },
  { id: 'pro', label: 'Pro', price: '9,900원/월', desc: 'NAS 백업, Notion 연동, CCTV 스트리밍' },
  { id: 'business', label: 'Business', price: '29,900원/월', desc: '팀 공유, 무제한 스토리지, 우선 지원' },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Step 1: 플랜
  const [plan, setPlan] = useState<'free' | 'pro' | 'business'>('free');

  // Step 2: NAS
  const [nas, setNas] = useState({
    nas_ssh_host: '',
    nas_ssh_port: 22,
    nas_ssh_user: '',
    nas_ssh_password: '',
    nas_web_base_url: '',
  });
  const [nasChecking, setNasChecking] = useState(false);
  const [nasResult, setNasResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Step 3: Notion
  const [notion, setNotion] = useState({
    notion_api_key: '',
    notion_camera_db_id: '',
  });
  const [notionChecking, setNotionChecking] = useState(false);
  const [notionResult, setNotionResult] = useState<{ ok: boolean; message: string } | null>(null);

  const saveSettings = async (extra?: Record<string, unknown>) => {
    setSaving(true);
    setMsg('');
    try {
      const body = {
        plan,
        ...(nas.nas_ssh_host ? nas : {}),
        ...(notion.notion_api_key ? notion : {}),
        ...extra,
      };
      const res = await fetch('/api/user-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setMsg(d.error || '저장 실패');
        return false;
      }
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '알 수 없는 오류';
      setMsg(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const checkNas = async () => {
    setNasChecking(true);
    setNasResult(null);
    try {
      // 임시 저장 후 체크
      await fetch('/api/user-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nas),
      });
      const res = await fetch('/api/camera/check?target=nas');
      setNasResult(await res.json());
    } catch {
      setNasResult({ ok: false, message: '체크 실패' });
    } finally {
      setNasChecking(false);
    }
  };

  const checkNotion = async () => {
    setNotionChecking(true);
    setNotionResult(null);
    try {
      await fetch('/api/user-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notion),
      });
      const res = await fetch('/api/camera/check?target=notion');
      setNotionResult(await res.json());
    } catch {
      setNotionResult({ ok: false, message: '체크 실패' });
    } finally {
      setNotionChecking(false);
    }
  };

  const handleFinish = async () => {
    const ok = await saveSettings({ onboarding_done: true });
    if (ok) router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden">
        {/* 상단 진행바 */}
        <div className="h-1.5 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        <div className="p-8">
          {/* 로고 */}
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm">
              L
            </div>
            <span className="font-black text-gray-900">LOOV</span>
            <span className="text-gray-400 text-sm ml-auto">{step} / 4</span>
          </div>

          {/* Step 1: 환영 + 플랜 */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-black text-gray-900 mb-2">환영합니다! 🎉</h1>
                <p className="text-gray-500 text-sm">LOOV에서 사용할 플랜을 선택해 주세요. 언제든 변경 가능합니다.</p>
              </div>
              <div className="space-y-3">
                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlan(p.id)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                      plan === p.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-gray-900">{p.label}</span>
                        <p className="text-xs text-gray-500 mt-0.5">{p.desc}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-indigo-600">{p.price}</span>
                        {plan === p.id && <div className="text-indigo-500 text-xs mt-0.5">선택됨</div>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStep(2)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-colors"
              >
                다음 →
              </button>
            </div>
          )}

          {/* Step 2: NAS 설정 */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-black text-gray-900 mb-2">🖥️ NAS 설정</h1>
                <p className="text-gray-500 text-sm">시놀로지 NAS에 사진을 백업합니다. 없으면 건너뛰세요.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">SSH 호스트</label>
                  <input
                    value={nas.nas_ssh_host}
                    onChange={e => setNas(p => ({ ...p, nas_ssh_host: e.target.value }))}
                    placeholder="mynas.synology.me"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">포트</label>
                    <input
                      type="number"
                      value={nas.nas_ssh_port}
                      onChange={e => setNas(p => ({ ...p, nas_ssh_port: parseInt(e.target.value) || 22 }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">사용자명</label>
                    <input
                      value={nas.nas_ssh_user}
                      onChange={e => setNas(p => ({ ...p, nas_ssh_user: e.target.value }))}
                      placeholder="admin"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">SSH 비밀번호</label>
                  <input
                    type="password"
                    value={nas.nas_ssh_password}
                    onChange={e => setNas(p => ({ ...p, nas_ssh_password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">웹 기본 URL (선택)</label>
                  <input
                    value={nas.nas_web_base_url}
                    onChange={e => setNas(p => ({ ...p, nas_web_base_url: e.target.value }))}
                    placeholder="http://mynas.synology.me"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <button
                  onClick={checkNas}
                  disabled={nasChecking || !nas.nas_ssh_host}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  {nasChecking ? '확인 중...' : '🔌 연결 체크'}
                </button>
                {nasResult && (
                  <div className={`px-4 py-2.5 rounded-xl text-sm font-medium ${nasResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {nasResult.ok ? '✅' : '❌'} {nasResult.message}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-3 text-gray-500 font-medium rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors text-sm"
                >
                  나중에
                </button>
                <button
                  onClick={async () => {
                    if (nas.nas_ssh_host) await saveSettings();
                    setStep(3);
                  }}
                  disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-colors disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장 후 다음 →'}
                </button>
              </div>
              {msg && <p className="text-red-500 text-sm">{msg}</p>}
            </div>
          )}

          {/* Step 3: Notion 설정 */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-black text-gray-900 mb-2">📔 Notion 설정</h1>
                <p className="text-gray-500 text-sm">Notion에 카메라롤 DB를 연동합니다. 없으면 건너뛰세요.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Notion API 키</label>
                  <input
                    type="password"
                    value={notion.notion_api_key}
                    onChange={e => setNotion(p => ({ ...p, notion_api_key: e.target.value }))}
                    placeholder="secret_..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">카메라롤 DB ID</label>
                  <input
                    value={notion.notion_camera_db_id}
                    onChange={e => setNotion(p => ({ ...p, notion_camera_db_id: e.target.value }))}
                    placeholder="32자리 Notion DB ID"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <button
                  onClick={checkNotion}
                  disabled={notionChecking || !notion.notion_api_key}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  {notionChecking ? '확인 중...' : '🔌 연결 체크'}
                </button>
                {notionResult && (
                  <div className={`px-4 py-2.5 rounded-xl text-sm font-medium ${notionResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {notionResult.ok ? '✅' : '❌'} {notionResult.message}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 py-3 text-gray-500 font-medium rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors text-sm"
                >
                  나중에
                </button>
                <button
                  onClick={async () => {
                    if (notion.notion_api_key) await saveSettings();
                    setStep(4);
                  }}
                  disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-colors disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장 후 다음 →'}
                </button>
              </div>
              {msg && <p className="text-red-500 text-sm">{msg}</p>}
            </div>
          )}

          {/* Step 4: 완료 */}
          {step === 4 && (
            <div className="space-y-6 text-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-4xl mx-auto">
                🎉
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900 mb-2">설정 완료!</h1>
                <p className="text-gray-500 text-sm">
                  LOOV를 시작할 준비가 됐습니다.<br />
                  설정은 언제든 대시보드 → 설정에서 변경할 수 있습니다.
                </p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span>💳</span>
                  <span>플랜: <strong>{PLANS.find(p => p.id === plan)?.label}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span>🖥️</span>
                  <span>NAS: {nas.nas_ssh_host || '미설정 (나중에 설정 가능)'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>📔</span>
                  <span>Notion: {notion.notion_api_key ? '연동됨' : '미설정 (나중에 설정 가능)'}</span>
                </div>
              </div>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black rounded-2xl transition-all text-lg disabled:opacity-50"
              >
                {saving ? '저장 중...' : '🚀 대시보드 시작!'}
              </button>
              {msg && <p className="text-red-500 text-sm">{msg}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
