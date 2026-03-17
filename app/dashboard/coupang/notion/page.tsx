'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Platform } from '@/lib/sns/platforms';

interface NotionProduct {
  id: string;
  name: string;
  price: number;
  partnerLink: string;
  originalUrl: string;
  review1: string;
  review2: string;
  image1: string;
  image2: string;
  image3: string;
  image4: string;
  image5: string;
  collectedAt: string;
}

const PLATFORMS: { key: Platform; label: string; icon: string }[] = [
  { key: 'threads',   label: '스레드',     icon: '🧵' },
  { key: 'instagram', label: '인스타그램', icon: '📸' },
  { key: 'twitter',   label: '트위터/X',   icon: '🐦' },
  { key: 'facebook',  label: '페이스북',   icon: '📘' },
];

const DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

export default function CoupangNotionPage() {
  // ── 설정 ─────────────────────────────────────
  const [apiKey, setApiKey] = useState('');
  const [dbId, setDbId] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // ── 상품 목록 ─────────────────────────────────
  const [products, setProducts] = useState<NotionProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // ── 선택된 상품 ───────────────────────────────
  const [selected, setSelected] = useState<NotionProduct | null>(null);

  // ── SNS 연결 / 플랫폼 선택 ────────────────────
  const [connections, setConnections] = useState<{ platform: string }[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);

  // ── AI 생성 ───────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [editedPreviews, setEditedPreviews] = useState<Record<string, string>>({});

  // ── 발행 ─────────────────────────────────────
  const [posting, setPosting] = useState(false);
  const [postResults, setPostResults] = useState<{ platform: string; success: boolean; error?: string }[]>([]);

  // ── 로컬스토리지에서 설정 복원 ────────────────
  useEffect(() => {
    const saved = localStorage.getItem('coupang_notion_config');
    if (saved) {
      try {
        const { apiKey: k, dbId: d } = JSON.parse(saved);
        setApiKey(k || '');
        setDbId(d || '');
      } catch { /* ignore */ }
    }
  }, []);

  // ── SNS 연결 조회 ─────────────────────────────
  useEffect(() => {
    fetch('/api/sns/connections').then(r => r.json()).then(d => {
      // API가 배열을 직접 반환
      setConnections(Array.isArray(d) ? d : (d.connections || []));
    }).catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    localStorage.setItem('coupang_notion_config', JSON.stringify({ apiKey, dbId }));
    try {
      await fetch('/api/coupang/notion-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, dbId }),
      });
    } catch { /* ignore */ }
    setSavingSettings(false);
    setShowSettings(false);
    loadProducts();
  };

  const loadProducts = useCallback(async () => {
    if (!apiKey || !dbId) { setShowSettings(true); return; }
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/coupang/notion-products?apiKey=${encodeURIComponent(apiKey)}&dbId=${encodeURIComponent(dbId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setProducts(data.products || []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }, [apiKey, dbId]);

  useEffect(() => {
    if (apiKey && dbId) loadProducts();
    else setShowSettings(true);
  }, []); // eslint-disable-line

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const generateContent = async () => {
    if (!selected || !selectedPlatforms.length) return;
    setGenerating(true);
    setPreviews({});
    setEditedPreviews({});
    const review = [selected.review1, selected.review2].filter(Boolean).join('\n\n');
    const images = [selected.image1, selected.image2, selected.image3, selected.image4, selected.image5].filter(Boolean);

    try {
      const res = await fetch('/api/coupang/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: selected.name,
          price: selected.price,
          discountRate: 0,
          firstReview: [selected.review1, selected.review2].filter(Boolean).join('\n\n').slice(0, 500),
          platforms: selectedPlatforms,
        }),
      });
      const data = await res.json();
      if (data.contents) {
        setPreviews(data.contents);
        setEditedPreviews(data.contents);
      }
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const postNow = async () => {
    if (!selected || !selectedPlatforms.length) return;
    setPosting(true);
    setPostResults([]);
    const images = [selected.image1, selected.image2, selected.image3, selected.image4, selected.image5].filter(Boolean);
    const firstReview = selected.review1 || selected.review2 || '';

    try {
      const res = await fetch('/api/coupang/auto-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: selected.name,
          price: selected.price,
          discountRate: 0,
          firstReview,
          affiliateUrl: selected.partnerLink || selected.originalUrl,
          imageUrls: images,
          platforms: selectedPlatforms,
          preGenerated: editedPreviews,
          // 이미지 댓글: 이미지를 순서대로 댓글에 추가
          extraImageComments: images.slice(1),
        }),
      });
      const data = await res.json();
      setPostResults(data.results || []);
    } catch { /* ignore */ }
    setPosting(false);
  };

  const images = selected
    ? [selected.image1, selected.image2, selected.image3, selected.image4, selected.image5].filter(Boolean)
    : [];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🛒 쿠팡파트너스 Notion DB</h1>
          <p className="text-sm text-gray-500 mt-1">수집된 상품을 AI로 후킹 멘트 생성 후 SNS 발행</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings(s => !s)}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
            ⚙️ 설정
          </button>
          <button onClick={loadProducts} disabled={loading}
            className="px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-50">
            {loading ? '⏳ 로딩중...' : '🔄 새로고침'}
          </button>
        </div>
      </div>

      {/* 설정 패널 */}
      {showSettings && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
          <h2 className="font-semibold mb-3 text-gray-700">Notion 설정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Notion API Key</label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="secret_..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Database ID</label>
              <input type="text" value={dbId} onChange={e => setDbId(e.target.value)}
                placeholder="32자리 DB ID"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <button onClick={saveSettings} disabled={savingSettings}
            className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {savingSettings ? '저장중...' : '💾 저장 & 불러오기'}
          </button>
        </div>
      )}

      {loadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{loadError}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── 왼쪽: 상품 목록 ────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">수집된 상품 ({products.length}개)</h2>
          </div>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {loading && (
              <div className="text-center py-12 text-gray-400">⏳ 로딩중...</div>
            )}
            {!loading && products.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p>상품이 없습니다.</p>
                <p className="text-xs mt-1">Notion 설정 후 새로고침하세요.</p>
              </div>
            )}
            {products.map(p => (
              <button key={p.id}
                onClick={() => { setSelected(p); setPreviews({}); setEditedPreviews({}); setPostResults([]); }}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selected?.id === p.id
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}>
                <div className="flex gap-3 items-start">
                  {p.image1 && (
                    <img src={p.image1} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900 line-clamp-2">{p.name || '상품명 없음'}</p>
                    <p className="text-sm font-bold text-red-500 mt-1">
                      {p.price ? `₩${Number(p.price).toLocaleString()}` : '-'}
                    </p>
                    <div className="flex gap-2 mt-1">
                      {p.review1 && <span className="text-xs text-gray-400">리뷰 ✓</span>}
                      {p.image1 && <span className="text-xs text-gray-400">사진 ✓</span>}
                      {p.partnerLink && <span className="text-xs text-green-500">링크 ✓</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{p.collectedAt}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── 오른쪽: 상세 + AI 생성 + 발행 ── */}
        <div>
          {!selected ? (
            <div className="flex items-center justify-center h-64 text-gray-400 bg-gray-50 rounded-xl">
              ← 상품을 선택하세요
            </div>
          ) : (
            <div className="space-y-4">
              {/* 상품 정보 */}
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <h3 className="font-semibold text-gray-800 mb-2 line-clamp-2">{selected.name}</h3>
                <p className="text-xl font-bold text-red-500 mb-3">
                  {selected.price ? `₩${Number(selected.price).toLocaleString()}` : '가격 없음'}
                </p>

                {/* 이미지 */}
                {images.length > 0 && (
                  <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                    {images.map((img, i) => (
                      <img key={i} src={img} alt=""
                        className="w-20 h-20 object-cover rounded-lg flex-shrink-0 border border-gray-100" />
                    ))}
                  </div>
                )}

                {/* 리뷰 */}
                {selected.review1 && (
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 mb-2 line-clamp-3">
                    💬 {selected.review1}
                  </div>
                )}
                {selected.review2 && (
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 line-clamp-3">
                    💬 {selected.review2}
                  </div>
                )}

                {/* 링크 */}
                {selected.partnerLink && (
                  <a href={selected.partnerLink} target="_blank" rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs text-blue-500 hover:underline">
                    🔗 파트너스 링크 확인
                  </a>
                )}
              </div>

              {/* 플랫폼 선택 */}
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">발행 플랫폼 선택</p>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map(({ key, label, icon }) => {
                    const connected = connections.some(c => c.platform === key);
                    const active = selectedPlatforms.includes(key);
                    return (
                      <button key={key}
                        onClick={() => connected && togglePlatform(key)}
                        disabled={!connected}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                          !connected ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : active ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {icon} {label} {!connected && '(미연결)'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI 생성 버튼 */}
              <button onClick={generateContent}
                disabled={generating || selectedPlatforms.length === 0}
                className="w-full py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-all">
                {generating ? '🤖 AI 생성중...' : '✨ AI 후킹 멘트 생성'}
              </button>

              {/* 미리보기 */}
              {Object.keys(editedPreviews).length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700">📝 AI 생성 멘트 (수정 가능)</p>
                  {selectedPlatforms.map(platform => (
                    editedPreviews[platform] && (
                      <div key={platform} className="bg-white border border-gray-100 rounded-xl p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">{platform}</p>
                        <textarea
                          value={editedPreviews[platform]}
                          onChange={e => setEditedPreviews(prev => ({ ...prev, [platform]: e.target.value }))}
                          rows={5}
                          className="w-full text-sm text-gray-700 resize-none focus:outline-none bg-transparent"
                        />
                        <div className="mt-2 pt-2 border-t border-gray-50 text-xs text-gray-400">
                          💬 댓글: {selected.partnerLink} · {DISCLOSURE}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* 발행 버튼 */}
              {Object.keys(editedPreviews).length > 0 && (
                <button onClick={postNow}
                  disabled={posting}
                  className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all">
                  {posting ? '📤 발행중...' : '🚀 SNS 발행하기'}
                </button>
              )}

              {/* AI 미리보기 없이 바로 발행 */}
              {Object.keys(editedPreviews).length === 0 && selectedPlatforms.length > 0 && (
                <button onClick={postNow}
                  disabled={posting}
                  className="w-full py-2 text-sm bg-gray-700 text-white rounded-xl hover:bg-gray-800 disabled:opacity-50">
                  {posting ? '📤 발행중...' : '⚡ AI 생성 없이 바로 발행'}
                </button>
              )}

              {/* 발행 결과 */}
              {postResults.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">📊 발행 결과</p>
                  {postResults.map(r => (
                    <div key={r.platform} className={`flex items-center gap-2 py-1 text-sm ${r.success ? 'text-green-600' : 'text-red-500'}`}>
                      {r.success ? '✅' : '❌'} {r.platform}
                      {r.error && <span className="text-xs text-gray-400">({r.error})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
