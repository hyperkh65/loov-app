'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';

interface PageBlock {
  id: string;
  type: 'hero' | 'about' | 'services' | 'cta' | 'contact';
  enabled: boolean;
  content: Record<string, string>;
  label: string;
  icon: string;
}

const DEFAULT_BLOCKS: PageBlock[] = [
  { id: 'hero', type: 'hero', enabled: true, content: {}, label: '히어로 섹션', icon: '🦸' },
  { id: 'about', type: 'about', enabled: true, content: {}, label: '회사 소개', icon: '🏢' },
  { id: 'services', type: 'services', enabled: true, content: {}, label: '서비스', icon: '🎯' },
  { id: 'cta', type: 'cta', enabled: false, content: {}, label: 'CTA (행동 유도)', icon: '📢' },
  { id: 'contact', type: 'contact', enabled: true, content: {}, label: '문의하기', icon: '📧' },
];

const THEMES = [
  { id: 'modern', label: '모던', desc: '인디고 그라디언트, 깔끔한 레이아웃', preview: '🔵' },
  { id: 'minimal', label: '미니멀', desc: '다크 히어로, 깔끔한 흰 배경', preview: '⬛' },
  { id: 'bold', label: '볼드', desc: '노란+검정, 강렬한 임팩트', preview: '🟡' },
];

export default function WebsitePage() {
  const { companySettings, updateCompanySettings } = useStore();
  const [activeTab, setActiveTab] = useState<'info' | 'builder' | 'preview'>('info');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'available' | 'taken'>('idle');

  // 홈페이지 빌더 상태
  const [siteConfig, setSiteConfig] = useState({
    slug: '',
    theme: 'modern',
    isPublished: false,
    pages: DEFAULT_BLOCKS,
  });

  const [generatingBlock, setGeneratingBlock] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState('');

  const [form, setForm] = useState({
    website: companySettings.website || '',
    companyName: companySettings.companyName || '',
    slogan: companySettings.slogan || '',
    businessNumber: companySettings.businessNumber || '',
    address: companySettings.address || '',
    phone: companySettings.phone || '',
    email: companySettings.email || '',
    description: '',
    services: '',
  });

  // 서버에서 기존 설정 로드
  useEffect(() => {
    fetch('/api/website/publish')
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setSiteConfig({
            slug: data.config.slug || '',
            theme: data.config.theme || 'modern',
            isPublished: data.config.is_published || false,
            pages: data.config.pages?.length > 0 ? data.config.pages : DEFAULT_BLOCKS,
          });
          if (data.config.slug && data.config.is_published) {
            const domain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'loov.co.kr';
            setSiteUrl(`https://${data.config.slug}.${domain}`);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveInfo = () => {
    updateCompanySettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const checkSlug = async (slug: string) => {
    if (!slug) { setSlugStatus('idle'); return; }
    setSlugChecking(true);
    // 간단한 클라이언트 검증
    if (!/^[a-z0-9-]{3,30}$/.test(slug)) {
      setSlugStatus('taken');
      setSlugChecking(false);
      return;
    }
    setSlugStatus('available');
    setSlugChecking(false);
  };

  const handlePublish = async (publish: boolean) => {
    setSaving(true);
    try {
      const res = await fetch('/api/website/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publish,
          slug: siteConfig.slug || undefined,
          theme: siteConfig.theme,
          pages: siteConfig.pages,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      setSiteConfig((prev) => ({ ...prev, isPublished: publish }));
      if (data.url) setSiteUrl(data.url);
      alert(publish ? '🎉 홈페이지가 발행되었습니다!' : '홈페이지가 비공개로 전환되었습니다.');
    } catch {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBuilder = async () => {
    setSaving(true);
    try {
      await fetch('/api/website/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: siteConfig.slug || undefined,
          theme: siteConfig.theme,
          pages: siteConfig.pages,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const toggleBlock = (blockId: string) => {
    setSiteConfig((prev) => ({
      ...prev,
      pages: prev.pages.map((b) => b.id === blockId ? { ...b, enabled: !b.enabled } : b),
    }));
  };

  const updateBlockContent = (blockId: string, key: string, value: string) => {
    setSiteConfig((prev) => ({
      ...prev,
      pages: prev.pages.map((b) => b.id === blockId ? { ...b, content: { ...b.content, [key]: value } } : b),
    }));
  };

  const handleGenerateBlock = async (blockId: string, blockType: string) => {
    const apiKey = companySettings.globalAIConfig?.apiKey;
    const provider = companySettings.globalAIConfig?.provider || 'gemini';
    if (!apiKey) {
      alert('AI 설정에서 API 키를 먼저 등록해주세요.');
      return;
    }

    setGeneratingBlock(blockId);
    try {
      const res = await fetch('/api/website/generate-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockType,
          companyInfo: {
            companyName: form.companyName || companySettings.companyName,
            slogan: form.slogan || companySettings.slogan,
            description: form.description,
            services: form.services,
          },
          apiKey,
          provider,
        }),
      });
      const data = await res.json();
      if (data.content) {
        setSiteConfig((prev) => ({
          ...prev,
          pages: prev.pages.map((b) => b.id === blockId ? { ...b, content: { ...b.content, ...data.content } } : b),
        }));
      }
    } catch {
      alert('AI 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingBlock(null);
    }
  };

  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || 'loov.co.kr';
  const previewUrl = siteConfig.slug ? `${window.location.origin}/site/${siteConfig.slug}` : '';

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-black text-gray-900">🏢 홈페이지 관리</h1>
            <p className="text-sm text-gray-400 hidden sm:block">회사 웹사이트 설정 및 콘텐츠 관리</p>
          </div>
          <div className="flex items-center gap-2">
            {siteUrl && (
              <a href={siteUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:text-indigo-500 border border-indigo-200 px-3 py-1.5 rounded-lg hidden sm:block">
                🔗 사이트 방문
              </a>
            )}
            {siteConfig.isPublished ? (
              <button onClick={() => handlePublish(false)} disabled={saving}
                className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-xl hover:bg-red-100 disabled:opacity-60">
                내리기
              </button>
            ) : (
              <button onClick={() => handlePublish(true)} disabled={saving || !siteConfig.slug}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl disabled:opacity-60 font-bold">
                {saving ? '저장 중...' : '🚀 발행'}
              </button>
            )}
          </div>
        </div>

        {/* 발행 상태 배너 */}
        {siteConfig.isPublished && siteUrl && (
          <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span>발행 중</span>
              <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">{siteUrl}</a>
            </div>
          </div>
        )}
      </header>

      <div className="p-4 md:p-6">
        {/* 탭 */}
        <div className="flex gap-2 mb-6 border-b border-gray-100 pb-4 overflow-x-auto">
          {[['info', '기본 정보'], ['builder', '홈페이지 빌더'], ['preview', '미리보기']].map(([v, l]) => (
            <button key={v} onClick={() => setActiveTab(v as typeof activeTab)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>{l}</button>
          ))}
        </div>

        {/* ── 기본 정보 탭 ── */}
        {activeTab === 'info' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="font-bold text-gray-900 mb-2">회사 기본 정보</h2>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">웹사이트 URL (기존)</label>
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

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">비즈니스 설명 (AI 콘텐츠 생성에 활용)</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none"
                  rows={3} placeholder="어떤 사업을 하시나요? (예: 온라인 쇼핑몰, 디자인 스튜디오, 컨설팅 등)" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">주요 서비스/상품 (AI 콘텐츠 생성에 활용)</label>
                <input value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  placeholder="예: 브랜딩, 웹 디자인, 영상 제작" />
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

              <button onClick={handleSaveInfo}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                  saved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}>
                {saved ? '✓ 저장되었습니다' : '정보 저장'}
              </button>
            </div>
          </div>
        )}

        {/* ── 홈페이지 빌더 탭 ── */}
        {activeTab === 'builder' && (
          <div className="max-w-3xl space-y-6">
            {/* URL 슬러그 설정 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-bold text-gray-900 mb-4">🌐 홈페이지 주소 (URL)</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400 flex-shrink-0">https://</span>
                <input
                  value={siteConfig.slug}
                  onChange={(e) => {
                    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                    setSiteConfig((prev) => ({ ...prev, slug }));
                    checkSlug(slug);
                  }}
                  className={`flex-1 border rounded-xl px-3 py-2.5 text-sm focus:outline-none ${
                    slugStatus === 'taken' ? 'border-red-400 focus:border-red-400' :
                    slugStatus === 'available' ? 'border-emerald-400 focus:border-emerald-400' :
                    'border-gray-200 focus:border-indigo-400'
                  }`}
                  placeholder="mycompany"
                />
                <span className="text-sm text-gray-400 flex-shrink-0">.{mainDomain}</span>
              </div>
              {slugStatus === 'taken' && (
                <p className="text-xs text-red-500 mt-1">영문 소문자, 숫자, 하이픈만 사용 가능 (3~30자)</p>
              )}
              {slugStatus === 'available' && siteConfig.slug && (
                <p className="text-xs text-emerald-600 mt-1">✅ 사용 가능한 주소입니다</p>
              )}
            </div>

            {/* 테마 선택 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-bold text-gray-900 mb-4">🎨 테마 선택</h3>
              <div className="grid grid-cols-3 gap-3">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setSiteConfig((prev) => ({ ...prev, theme: theme.id }))}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      siteConfig.theme === theme.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-1">{theme.preview}</div>
                    <div className="font-bold text-sm text-gray-900">{theme.label}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{theme.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 섹션 블록 에디터 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-bold text-gray-900 mb-4">📄 페이지 섹션</h3>
              <div className="space-y-4">
                {siteConfig.pages.map((block) => (
                  <div key={block.id} className={`border rounded-xl overflow-hidden transition-all ${
                    block.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'
                  }`}>
                    {/* 블록 헤더 */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                      <div className="flex items-center gap-2">
                        <span>{block.icon}</span>
                        <span className="font-semibold text-sm text-gray-800">{block.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleGenerateBlock(block.id, block.type)}
                          disabled={generatingBlock === block.id || !block.enabled}
                          className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-2.5 py-1 rounded-lg disabled:opacity-40 transition-colors"
                        >
                          {generatingBlock === block.id ? '생성 중...' : '✨ AI 생성'}
                        </button>
                        <button
                          onClick={() => toggleBlock(block.id)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            block.enabled ? 'bg-indigo-500' : 'bg-gray-200'
                          }`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            block.enabled ? 'translate-x-5' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>
                    </div>

                    {/* 블록 컨텐츠 에디터 */}
                    {block.enabled && (
                      <div className="p-4 space-y-2">
                        {block.type === 'hero' && (
                          <>
                            <input
                              value={block.content.headline || ''}
                              onChange={(e) => updateBlockContent(block.id, 'headline', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                              placeholder="메인 헤드라인"
                            />
                            <input
                              value={block.content.subheadline || ''}
                              onChange={(e) => updateBlockContent(block.id, 'subheadline', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                              placeholder="서브 헤드라인"
                            />
                            <input
                              value={block.content.cta || ''}
                              onChange={(e) => updateBlockContent(block.id, 'cta', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                              placeholder="CTA 버튼 텍스트"
                            />
                          </>
                        )}
                        {(block.type === 'about' || block.type === 'services' || block.type === 'contact' || block.type === 'cta') && (
                          <>
                            <input
                              value={block.content.title || ''}
                              onChange={(e) => updateBlockContent(block.id, 'title', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                              placeholder="섹션 제목"
                            />
                            {block.type !== 'services' && (
                              <textarea
                                value={block.content.body || ''}
                                onChange={(e) => updateBlockContent(block.id, 'body', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none"
                                rows={3}
                                placeholder="섹션 본문 내용"
                              />
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 저장 + 발행 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={handleSaveBuilder}
                disabled={saving}
                className="flex-1 border border-gray-200 text-gray-700 py-3 rounded-xl font-bold text-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
              >
                {saved ? '✓ 저장됨' : '임시 저장'}
              </button>
              <button
                onClick={() => handlePublish(!siteConfig.isPublished)}
                disabled={saving || !siteConfig.slug}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-60 ${
                  siteConfig.isPublished
                    ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {siteConfig.isPublished ? '📴 내리기' : '🚀 발행하기'}
              </button>
            </div>

            {!siteConfig.slug && (
              <p className="text-xs text-amber-600 text-center">⚠️ 발행하려면 먼저 홈페이지 주소(URL)를 입력해주세요</p>
            )}
          </div>
        )}

        {/* ── 미리보기 탭 ── */}
        {activeTab === 'preview' && (
          <div>
            {previewUrl ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>미리보기 URL:</span>
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline truncate">{previewUrl}</a>
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0 bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-indigo-500">
                    새 탭에서 열기
                  </a>
                </div>
                <div className="border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 bg-white rounded-lg px-3 py-1 text-xs text-gray-400 truncate">{previewUrl}</div>
                  </div>
                  <iframe
                    src={previewUrl}
                    className="w-full"
                    style={{ height: '600px' }}
                    title="홈페이지 미리보기"
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                <div className="text-5xl mb-4">🌐</div>
                <h3 className="font-bold text-gray-700 mb-2">미리보기를 사용하려면</h3>
                <p className="text-sm text-gray-400 mb-4">홈페이지 빌더 탭에서 슬러그(URL)를 설정하고 임시 저장해주세요.</p>
                <button onClick={() => setActiveTab('builder')}
                  className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-500">
                  빌더로 이동
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
