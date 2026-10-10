'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { MarketingCampaign, MarketingPlatform, CampaignStatus, PLATFORM_LABEL, PLATFORM_ICON, ANIMAL_EMOJI } from '@/lib/types';

const PLATFORMS: MarketingPlatform[] = ['instagram', 'twitter', 'linkedin', 'facebook', 'youtube', 'tiktok', 'blog', 'email', 'kakao'];
const STATUSES: CampaignStatus[] = ['draft', 'scheduled', 'active', 'paused', 'completed'];

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: '초안', scheduled: '예약', active: '진행', paused: '일시정지', completed: '완료',
};
const STATUS_COLOR: Record<CampaignStatus, string> = {
  draft:     'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-600',
  active:    'bg-emerald-100 text-emerald-700',
  paused:    'bg-amber-100 text-amber-600',
  completed: 'bg-purple-100 text-purple-600',
};

function AddCampaignModal({ onClose }: { onClose: () => void }) {
  const { addMarketingCampaign, employees } = useStore();
  const [form, setForm] = useState({
    name: '', platform: 'instagram' as MarketingPlatform, status: 'draft' as CampaignStatus,
    startDate: new Date().toISOString().slice(0, 10), endDate: '', budget: '', content: '',
    targetAudience: '', assignedEmployeeId: '',
  });

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    addMarketingCampaign({
      id: crypto.randomUUID(),
      ...form,
      budget: form.budget ? parseInt(form.budget) : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">캠페인 추가</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">캠페인명 *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              placeholder="3월 신상품 인스타 캠페인" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">플랫폼</label>
              <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as MarketingPlatform })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_ICON[p]} {PLATFORM_LABEL[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">상태</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CampaignStatus })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">시작일</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">종료일</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">예산 (원)</label>
              <input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                placeholder="500000" />
            </div>
            {employees.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">담당 직원</label>
                <select value={form.assignedEmployeeId} onChange={(e) => setForm({ ...form, assignedEmployeeId: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
                  <option value="">없음</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">타겟 오디언스</label>
            <input value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              placeholder="20-40대 직장인, 소자본 창업자..." />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">콘텐츠/메모</label>
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
              rows={3} placeholder="캠페인 내용, 핵심 메시지..." />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">취소</button>
          <button onClick={handleSubmit} disabled={!form.name.trim()}
            className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-bold">
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MarketingPage() {
  const { marketingCampaigns, updateMarketingCampaign, removeMarketingCampaign, employees, companySettings } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState<MarketingPlatform | 'all'>('all');

  const filtered = filterPlatform === 'all'
    ? marketingCampaigns
    : marketingCampaigns.filter((c) => c.platform === filterPlatform);

  const activeCampaigns = marketingCampaigns.filter((c) => c.status === 'active').length;
  const totalBudget = marketingCampaigns.reduce((s, c) => s + (c.budget || 0), 0);

  // SNS 채널 현황
  const snsChannels = [
    { platform: 'instagram', account: companySettings.instagram, label: '인스타그램', icon: '📸' },
    { platform: 'twitter', account: companySettings.twitter, label: '트위터/X', icon: '🐦' },
    { platform: 'linkedin', account: companySettings.linkedin, label: '링크드인', icon: '💼' },
    { platform: 'youtube', account: companySettings.youtube, label: '유튜브', icon: '▶️' },
  ];

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">📣 마케팅 허브</h1>
            <p className="text-sm text-gray-400">캠페인 관리 및 SNS 현황</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl font-bold text-sm">
            + 캠페인 추가
          </button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* 통계 */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '전체 캠페인', value: marketingCampaigns.length, color: 'text-gray-900' },
            { label: '진행 중', value: activeCampaigns, color: 'text-emerald-600' },
            { label: '예약됨', value: marketingCampaigns.filter((c) => c.status === 'scheduled').length, color: 'text-blue-600' },
            { label: '총 예산', value: totalBudget > 0 ? `₩${(totalBudget / 10000).toFixed(0)}만` : '₩0', color: 'text-orange-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-sm text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* 캠페인 목록 */}
          <div className="lg:col-span-2">
            {/* 플랫폼 필터 */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={() => setFilterPlatform('all')}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterPlatform === 'all' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                전체
              </button>
              {PLATFORMS.filter((p) => marketingCampaigns.some((c) => c.platform === p)).map((p) => (
                <button key={p} onClick={() => setFilterPlatform(p)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${filterPlatform === p ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                  {PLATFORM_ICON[p]} {PLATFORM_LABEL[p]}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center">
                <div className="text-5xl mb-4">📣</div>
                <h2 className="text-xl font-bold text-gray-700 mb-2">캠페인을 시작하세요</h2>
                <p className="text-gray-400 text-sm mb-6">AI 마케터에게 SNS 콘텐츠, 광고 캠페인을 지시하세요.</p>
                <button onClick={() => setShowAdd(true)} className="bg-orange-500 text-white px-6 py-3 rounded-xl font-bold text-sm">
                  + 첫 캠페인 만들기
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((campaign) => {
                  const emp = employees.find((e) => e.id === campaign.assignedEmployeeId);
                  return (
                    <div key={campaign.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-xl flex-shrink-0">
                            {PLATFORM_ICON[campaign.platform]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="font-bold text-gray-800 truncate">{campaign.name}</h3>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[campaign.status]}`}>
                                {STATUS_LABEL[campaign.status]}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                              <span>{PLATFORM_LABEL[campaign.platform]}</span>
                              <span>{campaign.startDate}{campaign.endDate ? ` ~ ${campaign.endDate}` : ''}</span>
                              {campaign.budget && <span>₩{campaign.budget.toLocaleString()}</span>}
                            </div>
                            {campaign.content && (
                              <p className="text-xs text-gray-500 mt-2 line-clamp-2">{campaign.content}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {emp && (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <span>{ANIMAL_EMOJI[emp.animal]}</span>
                              <span className="hidden sm:block">{emp.name}</span>
                            </div>
                          )}
                          <select value={campaign.status}
                            onChange={(e) => updateMarketingCampaign(campaign.id, { status: e.target.value as CampaignStatus })}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none">
                            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                          </select>
                          <button onClick={() => removeMarketingCampaign(campaign.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SNS 채널 현황 */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">SNS 채널</h3>
                <a href="/dashboard/sns" className="text-xs text-indigo-600 hover:text-indigo-500">관리 →</a>
              </div>
              <div className="space-y-3">
                {snsChannels.map((ch) => (
                  <div key={ch.platform} className="flex items-center gap-3">
                    <span className="text-xl">{ch.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-700">{ch.label}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {ch.account || '미연결'}
                      </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${ch.account ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                  </div>
                ))}
              </div>
            </div>

            {/* 콘텐츠 아이디어 */}
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 rounded-2xl p-5">
              <h3 className="font-bold text-gray-900 mb-3">💡 콘텐츠 아이디어</h3>
              <div className="space-y-2 text-sm text-gray-600">
                {[
                  '제품 사용 전/후 비교',
                  '고객 성공 사례 인터뷰',
                  '업계 인사이트 팁',
                  '비하인드 스토리',
                  'Q&A / FAQ 콘텐츠',
                ].map((idea) => (
                  <div key={idea} className="flex items-center gap-2">
                    <span className="text-orange-400">💡</span>
                    <span>{idea}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAdd && <AddCampaignModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
