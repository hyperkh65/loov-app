'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';

const PAGE_TEMPLATES = [
  { id: 'landing', label: '랜딩 페이지', icon: '🏠', desc: '서비스/제품 소개 메인 페이지' },
  { id: 'about', label: '회사 소개', icon: '🏢', desc: '비전, 팀, 히스토리 소개' },
  { id: 'service', label: '서비스 안내', icon: '🎯', desc: '제공 서비스 상세 페이지' },
  { id: 'portfolio', label: '포트폴리오', icon: '💼', desc: '작업물 및 프로젝트 갤러리' },
  { id: 'blog', label: '블로그', icon: '📝', desc: '업계 인사이트, 뉴스레터' },
  { id: 'contact', label: '문의하기', icon: '📧', desc: '연락처 및 상담 폼' },
];

export default function WebsitePage() {
  const { companySettings, updateCompanySettings } = useStore();
  const [activeTab, setActiveTab] = useState<'info' | 'pages' | 'seo'>('info');
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    website: companySettings.website,
    companyName: companySettings.companyName,
    slogan: companySettings.slogan,
    businessNumber: companySettings.businessNumber,
    address: companySettings.address,
    phone: companySettings.phone,
    email: companySettings.email,
  });

  const handleSave = () => {
    updateCompanySettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">🏢 홈페이지 관리</h1>
            <p className="text-sm text-gray-400">회사 웹사이트 설정 및 콘텐츠 관리</p>
          </div>
          <div className="flex items-center gap-3">
            {companySettings.website && (
              <a href={companySettings.website} target="_blank" rel="noopener noreferrer"
                className="text-sm text-indigo-600 hover:text-indigo-500 border border-indigo-200 px-3 py-1.5 rounded-lg">
                🔗 사이트 방문
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* 탭 */}
        <div className="flex gap-2 mb-6 border-b border-gray-100 pb-4">
          {[['info', '기본 정보'], ['pages', '페이지 관리'], ['seo', 'SEO 설정']].map(([v, l]) => (
            <button key={v} onClick={() => setActiveTab(v as typeof activeTab)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>{l}</button>
          ))}
        </div>

        {activeTab === 'info' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-bold text-gray-900 mb-2">회사 기본 정보</h2>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">웹사이트 URL</label>
                <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                  placeholder="https://mycompany.com" type="url" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">회사명</label>
                  <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">슬로건</label>
                  <input value={form.slogan} onChange={(e) => setForm({ ...form, slogan: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                    placeholder="짧고 임팩트 있게" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">사업자등록번호</label>
                  <input value={form.businessNumber} onChange={(e) => setForm({ ...form, businessNumber: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                    placeholder="000-00-00000" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">대표 전화</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                    placeholder="02-0000-0000" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">사업장 주소</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  placeholder="서울시 강남구..." />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">대표 이메일</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  placeholder="hello@mycompany.com" type="email" />
              </div>

              <button onClick={handleSave}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                  saved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}>
                {saved ? '✓ 저장되었습니다' : '정보 저장'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'pages' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">페이지 관리</h2>
              <div className="text-sm text-gray-400">AI 직원에게 콘텐츠 작성을 지시하세요</div>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PAGE_TEMPLATES.map((page) => (
                <div key={page.id} className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer group">
                  <div className="text-3xl mb-3">{page.icon}</div>
                  <h3 className="font-bold text-gray-800 mb-1">{page.label}</h3>
                  <p className="text-sm text-gray-400 mb-4">{page.desc}</p>
                  <div className="flex gap-2">
                    <button className="flex-1 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 py-2 rounded-lg font-medium transition-colors">
                      AI 작성 요청
                    </button>
                    <button className="text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors">
                      편집
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'seo' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="font-bold text-gray-900 mb-4">SEO 기본 설정</h2>
              <div className="space-y-4">
                {[
                  { label: '메타 타이틀', placeholder: '페이지 제목 | 회사명', key: 'seoTitle' },
                  { label: '메타 설명', placeholder: '검색 결과에 표시될 설명 (160자 이내)', key: 'seoDesc' },
                  { label: 'OG 이미지 URL', placeholder: 'https://...', key: 'ogImage' },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">{field.label}</label>
                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
                      placeholder={field.placeholder} />
                  </div>
                ))}
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700">
                  💡 AI 개발자 직원에게 "우리 홈페이지 SEO 최적화 방안을 알려줘"라고 지시해보세요.
                </div>
                <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold text-sm">
                  SEO 설정 저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
