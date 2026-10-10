'use client';

import { useState } from 'react';
import { CompanySettings } from '@/lib/types';

interface Props {
  settings: CompanySettings;
  onSave: (settings: Partial<CompanySettings>) => void;
  onClose: () => void;
}

type Tab = 'company' | 'sns' | 'marketing';

const SNS_LIST = [
  { key: 'instagram', label: 'Instagram', icon: '📸', placeholder: '@username 또는 URL', color: 'text-pink-500' },
  { key: 'twitter',   label: 'X (Twitter)', icon: '𝕏', placeholder: '@username', color: 'text-gray-800' },
  { key: 'linkedin',  label: 'LinkedIn', icon: '💼', placeholder: '회사 페이지 URL', color: 'text-blue-600' },
  { key: 'facebook',  label: 'Facebook', icon: '🔵', placeholder: '페이지 URL', color: 'text-blue-500' },
  { key: 'youtube',   label: 'YouTube', icon: '▶️', placeholder: '채널 URL', color: 'text-red-500' },
  { key: 'tiktok',    label: 'TikTok', icon: '🎵', placeholder: '@username', color: 'text-gray-900' },
] as const;

const BRAND_TONES = ['전문적·신뢰감', '친근하고 유쾌한', '젊고 트렌디한', '고급스러운', '따뜻하고 감성적인', '도전적·에너제틱'];
const INDUSTRIES = ['IT·테크', '유통·커머스', '식품·F&B', '패션·뷰티', '금융·핀테크', '교육', '헬스케어', '미디어·엔터', '부동산', '제조', '기타'];
const AD_BUDGETS = ['미설정', '월 10만원 미만', '월 10~50만원', '월 50~200만원', '월 200~500만원', '월 500만원 이상'];

export default function SettingsModal({ settings, onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('company');
  const [form, setForm] = useState<CompanySettings>({ ...settings });
  const [saved, setSaved] = useState(false);

  const set = (key: keyof CompanySettings, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const connectedSNS = SNS_LIST.filter((s) => form[s.key as keyof CompanySettings]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">⚙️ 회사 설정</h2>
            <p className="text-xs text-gray-400 mt-0.5">회사 정보와 마케팅 채널을 설정하세요</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors">✕</button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 px-6">
          {([
            { id: 'company', label: '🏢 회사 정보' },
            { id: 'sns', label: '📱 SNS 채널', badge: connectedSNS.length || undefined },
            { id: 'marketing', label: '📣 마케팅' },
          ] as { id: Tab; label: string; badge?: number }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === t.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {t.badge ? (
                <span className="bg-indigo-100 text-indigo-600 text-xs px-1.5 py-0.5 rounded-full">{t.badge}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── 회사 정보 ── */}
          {tab === 'company' && (
            <div className="space-y-4">
              <Field label="회사명" required>
                <input
                  value={form.companyName}
                  onChange={(e) => set('companyName', e.target.value)}
                  placeholder="Animal Company"
                  className="input"
                />
              </Field>
              <Field label="슬로건 / 한 줄 소개">
                <input
                  value={form.slogan}
                  onChange={(e) => set('slogan', e.target.value)}
                  placeholder="우리 회사를 한 문장으로 표현해보세요"
                  className="input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="대표자 이름">
                  <input
                    value={form.ceoName}
                    onChange={(e) => set('ceoName', e.target.value)}
                    placeholder="홍길동"
                    className="input"
                  />
                </Field>
                <Field label="업종">
                  <select value={form.industry} onChange={(e) => set('industry', e.target.value)} className="input">
                    <option value="">선택하세요</option>
                    {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="홈페이지 / 쇼핑몰 URL">
                <input
                  value={form.website}
                  onChange={(e) => set('website', e.target.value)}
                  placeholder="https://example.com"
                  className="input"
                />
              </Field>

              {/* Summary card */}
              {form.companyName && (
                <div className="mt-2 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-4 border border-indigo-100">
                  <p className="text-xs text-indigo-500 font-medium mb-1">미리보기</p>
                  <p className="font-bold text-gray-900">{form.companyName}</p>
                  {form.slogan && <p className="text-sm text-gray-500 mt-0.5">"{form.slogan}"</p>}
                  <div className="flex gap-3 mt-2 text-xs text-gray-400">
                    {form.ceoName && <span>👤 {form.ceoName} 대표</span>}
                    {form.industry && <span>🏭 {form.industry}</span>}
                    {form.website && <span>🌐 웹사이트 등록됨</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SNS 채널 ── */}
          {tab === 'sns' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400 mb-4">연결된 SNS 채널은 직원들이 마케팅 전략 수립 시 활용합니다</p>
              {SNS_LIST.map(({ key, label, icon, placeholder }) => (
                <div key={key} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                  <span className="text-xl w-7 flex-shrink-0 text-center">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700 mb-1">{label}</p>
                    <input
                      value={form[key as keyof CompanySettings] as string}
                      onChange={(e) => set(key as keyof CompanySettings, e.target.value)}
                      placeholder={placeholder}
                      className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-gray-300"
                    />
                  </div>
                  {form[key as keyof CompanySettings] && (
                    <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  )}
                </div>
              ))}

              {connectedSNS.length > 0 && (
                <div className="mt-4 bg-green-50 rounded-xl px-4 py-3 border border-green-100">
                  <p className="text-xs font-medium text-green-700">
                    ✅ {connectedSNS.length}개 채널 연결됨: {connectedSNS.map(s => s.label).join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── 마케팅 ── */}
          {tab === 'marketing' && (
            <div className="space-y-4">
              <Field label="타겟 고객">
                <textarea
                  value={form.targetAudience}
                  onChange={(e) => set('targetAudience', e.target.value)}
                  placeholder="예: 20~35세 직장인, 뷰티에 관심 있는 여성, 스타트업 창업자 등"
                  rows={3}
                  className="input resize-none"
                />
              </Field>

              <Field label="브랜드 톤 & 무드">
                <div className="grid grid-cols-3 gap-2">
                  {BRAND_TONES.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => set('brandTone', tone)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                        form.brandTone === tone
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                          : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="주요 해시태그">
                <input
                  value={form.hashtags}
                  onChange={(e) => set('hashtags', e.target.value)}
                  placeholder="#브랜드명 #제품명 #업종 (쉼표로 구분)"
                  className="input"
                />
                {form.hashtags && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.hashtags.split(/[,\s]+/).filter(Boolean).map((tag, i) => (
                      <span key={i} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                        {tag.startsWith('#') ? tag : `#${tag}`}
                      </span>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="월 광고 예산">
                <div className="grid grid-cols-3 gap-2">
                  {AD_BUDGETS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => set('adBudget', b)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border-2 transition-all ${
                        form.adBudget === b
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                          : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400">설정은 직원 AI 응답에 자동으로 반영됩니다</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 transition-colors">취소</button>
            <button
              onClick={handleSave}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                saved
                  ? 'bg-green-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {saved ? '✓ 저장됨' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
