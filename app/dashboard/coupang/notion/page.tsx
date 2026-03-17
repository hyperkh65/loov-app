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

interface PostHistory {
  id: string;
  product_name: string;
  affiliate_url: string;
  image_urls: string[];
  first_review: string;
  platforms: string[];
  generated_content: Record<string, string>;
  created_at: string;
}

const PLATFORMS: { key: Platform; label: string; icon: string }[] = [
  { key: 'threads',   label: '스레드',     icon: '🧵' },
  { key: 'instagram', label: '인스타그램', icon: '📸' },
  { key: 'twitter',   label: '트위터/X',   icon: '🐦' },
  { key: 'facebook',  label: '페이스북',   icon: '📘' },
];

const PLATFORM_ICON: Record<string, string> = {
  threads: '🧵', instagram: '📸', twitter: '🐦', facebook: '📘',
};

const DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

export default function CoupangNotionPage() {
  const [tab, setTab] = useState<'products' | 'history'>('products');

  // 설정
  const [apiKey, setApiKey] = useState('');
  const [dbId, setDbId] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // 상품 목록
  const [products, setProducts] = useState<NotionProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // 선택
  const [selected, setSelected] = useState<NotionProduct | null>(null);

  // SNS 연결
  const [connections, setConnections] = useState<{ platform: string }[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);

  // AI 생성
  const [generating, setGenerating] = useState(false);
  const [editedPreviews, setEditedPreviews] = useState<Record<string, string>>({});

  // 발행
  const [posting, setPosting] = useState(false);
  const [postResults, setPostResults] = useState<{ platform: string; success: boolean; error?: string }[]>([]);

  // 이력
  const [history, setHistory] = useState<PostHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  useEffect(() => {
    fetch('/api/sns/connections').then(r => r.json()).then(d => {
      setConnections(Array.isArray(d) ? d : (d.connections || []));
    }).catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    localStorage.setItem('coupang_notion_config', JSON.stringify({ apiKey, dbId }));
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

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/coupang/history');
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (apiKey && dbId) loadProducts();
    else setShowSettings(true);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const selectProduct = (p: NotionProduct) => {
    setSelected(p);
    setEditedPreviews({});
    setPostResults([]);
  };

  const generateContent = async () => {
    if (!selected || !selectedPlatforms.length) return;
    setGenerating(true);
    setEditedPreviews({});
    const firstReview = selected.review1 || selected.review2 || '';
    try {
      const res = await fetch('/api/coupang/auto-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: selected.name,
          price: selected.price,
          affiliateUrl: selected.partnerLink || selected.originalUrl,
          imageUrls: [selected.image1, selected.image2, selected.image3, selected.image4, selected.image5].filter(Boolean),
          firstReview,
          platforms: selectedPlatforms,
          generateOnly: true, // 발행 없이 생성만 (auto-post가 platforms에 SNS 연결 없으면 skip)
        }),
      });
      // generate API 사용
      const res2 = await fetch('/api/coupang/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: selected.name,
          price: selected.price,
          firstReview,
          platforms: selectedPlatforms,
        }),
      });
      const data2 = await res2.json();
      void res;
      if (data2.contents) setEditedPreviews(data2.contents);
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const postNow = async () => {
    if (!selected || !selectedPlatforms.length) return;
    setPosting(true);
    setPostResults([]);
    const images = [selected.image1, selected.image2, selected.image3, selected.image4, selected.image5].filter(Boolean);
    try {
      const res = await fetch('/api/coupang/auto-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: selected.name,
          productUrl: selected.originalUrl,
          price: selected.price,
          affiliateUrl: selected.partnerLink || selected.originalUrl,
          imageUrls: images,
          firstReview: selected.review1 || selected.review2 || '',
          platforms: selectedPlatforms,
          generatedContent: Object.keys(editedPreviews).length ? editedPreviews : undefined,
        }),
      });
      const data = await res.json();
      setPostResults(data.results || []);
      if ((data.results || []).some((r: { success: boolean }) => r.success)) {
        setTimeout(loadHistory, 1000);
      }
    } catch { /* ignore */ }
    setPosting(false);
  };

  // 이력에서 재발행
  const repost = (h: PostHistory) => {
    setTab('products');
    // 해당 상품을 찾아서 선택 (없으면 임시 객체로)
    const found = products.find(p => p.partnerLink === h.affiliate_url || p.name === h.product_name);
    if (found) {
      selectProduct(found);
    }
    // 이전에 생성된 내용으로 미리보기 채우기
    setEditedPreviews(h.generated_content || {});
    setSelectedPlatforms((h.platforms as Platform[]) || []);
  };

  const images = selected
    ? [selected.image1, selected.image2, selected.image3, selected.image4, selected.image5].filter(Boolean)
    : [];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🛒 쿠팡파트너스 Notion DB</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI 후킹 멘트 생성 → SNS 발행</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings(s => !s)}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">⚙️</button>
          <button onClick={loadProducts} disabled={loading}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-50">
            {loading ? '⏳' : '🔄'}
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('products')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${tab === 'products' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          📦 상품 목록 ({products.length})
        </button>
        <button onClick={() => setTab('history')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${tab === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          📋 발행 이력 ({history.length})
        </button>
      </div>

      {/* 설정 */}
      {showSettings && (
        <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
          <h2 className="font-semibold mb-3 text-gray-700 text-sm">Notion 설정</h2>
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

      {/* ── 상품 목록 탭 ── */}
      {tab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 왼쪽: 상품 목록 */}
          <div>
            <div className="space-y-2 max-h-[72vh] overflow-y-auto pr-1">
              {loading && <div className="text-center py-12 text-gray-400">⏳ 로딩중...</div>}
              {!loading && products.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <p>상품이 없습니다.</p>
                  <p className="text-xs mt-1">Notion 설정 후 새로고침하세요.</p>
                </div>
              )}
              {products.map(p => (
                <button key={p.id}
                  onClick={() => selectProduct(p)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selected?.id === p.id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  <div className="flex gap-3 items-start">
                    {p.image1 && <img src={p.image1} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-gray-900 line-clamp-2">{p.name || '상품명 없음'}</p>
                      <p className="text-sm font-bold text-red-500 mt-0.5">
                        {p.price ? `₩${Number(p.price).toLocaleString()}` : '-'}
                      </p>
                      <div className="flex gap-2 mt-1">
                        {p.review1 && <span className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded">리뷰 ✓</span>}
                        {p.image1 && <span className="text-xs bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded">사진 ✓</span>}
                        {p.partnerLink
                          ? <span className="text-xs bg-green-50 text-green-500 px-1.5 py-0.5 rounded">링크 ✓</span>
                          : <span className="text-xs bg-orange-50 text-orange-400 px-1.5 py-0.5 rounded">링크 ✗</span>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 오른쪽: 상세 + 발행 */}
          <div>
            {!selected ? (
              <div className="flex items-center justify-center h-64 text-gray-400 bg-gray-50 rounded-xl">
                ← 상품을 선택하세요
              </div>
            ) : (
              <div className="space-y-3">
                {/* 상품 정보 */}
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-800 mb-1 line-clamp-2">{selected.name}</h3>
                  <p className="text-lg font-bold text-red-500 mb-2">
                    {selected.price ? `₩${Number(selected.price).toLocaleString()}` : '가격 없음'}
                  </p>

                  {images.length > 0 && (
                    <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
                      {images.map((img, i) => (
                        <img key={i} src={img} alt=""
                          className="w-16 h-16 object-cover rounded-lg flex-shrink-0 border border-gray-100" />
                      ))}
                    </div>
                  )}

                  {/* 첫번째 상품평 강조 표시 */}
                  {selected.review1 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-gray-700 mb-1">
                      <span className="text-yellow-600 font-semibold text-xs">📌 AI가 참고할 첫번째 상품평</span>
                      <p className="mt-1 line-clamp-4">{selected.review1}</p>
                    </div>
                  )}
                  {!selected.review1 && selected.review2 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-gray-700 mb-1">
                      <span className="text-yellow-600 font-semibold text-xs">📌 상품평</span>
                      <p className="mt-1 line-clamp-4">{selected.review2}</p>
                    </div>
                  )}
                  {!selected.review1 && !selected.review2 && (
                    <div className="text-xs text-orange-400 bg-orange-50 px-2 py-1.5 rounded-lg mb-1">
                      ⚠️ 상품평 없음 — AI가 상품명만으로 생성합니다
                    </div>
                  )}

                  <div className="mt-2">
                    {selected.partnerLink ? (
                      <a href={selected.partnerLink} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-green-600 font-semibold hover:underline bg-green-50 px-2 py-1 rounded-lg">
                        🔗 수익 링크 확인 (link.coupang.com) ✓
                      </a>
                    ) : (
                      <div className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded-lg">
                        ⚠️ 파트너스 링크 없음 — 원본 URL이 댓글에 들어갑니다
                      </div>
                    )}
                  </div>
                </div>

                {/* 플랫폼 선택 */}
                <div className="bg-white border border-gray-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">발행 플랫폼 선택</p>
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

                {/* AI 생성 */}
                <button onClick={generateContent}
                  disabled={generating || selectedPlatforms.length === 0}
                  className="w-full py-2.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-all text-sm">
                  {generating ? '🤖 MD처럼 후킹 멘트 생성중...' : '✨ AI 후킹 멘트 생성 (온라인 MD 스타일)'}
                </button>

                {/* 미리보기 + 편집 */}
                {Object.keys(editedPreviews).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-600">📝 생성된 멘트 (수정 가능)</p>
                    {selectedPlatforms.map(platform => (
                      editedPreviews[platform] && (
                        <div key={platform} className="bg-white border border-gray-100 rounded-xl p-3">
                          <p className="text-xs font-semibold text-gray-400 mb-1.5 uppercase">{PLATFORM_ICON[platform]} {platform}</p>
                          <textarea
                            value={editedPreviews[platform]}
                            onChange={e => setEditedPreviews(prev => ({ ...prev, [platform]: e.target.value }))}
                            rows={5}
                            className="w-full text-sm text-gray-700 resize-none focus:outline-none bg-transparent"
                          />
                          <div className="mt-2 pt-2 border-t border-gray-50 text-xs space-y-0.5">
                            <div className={selected.partnerLink ? 'text-green-600 font-semibold' : 'text-orange-500'}>
                              💬 댓글: {selected.partnerLink || selected.originalUrl || '링크 없음'}
                            </div>
                            <div className="text-gray-400">{DISCLOSURE}</div>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}

                {/* 발행 버튼 */}
                {Object.keys(editedPreviews).length > 0 && (
                  <button onClick={postNow} disabled={posting}
                    className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-all">
                    {posting ? '📤 발행중...' : '🚀 SNS 발행하기'}
                  </button>
                )}
                {Object.keys(editedPreviews).length === 0 && selectedPlatforms.length > 0 && (
                  <button onClick={postNow} disabled={posting}
                    className="w-full py-2 text-sm bg-gray-700 text-white rounded-xl hover:bg-gray-800 disabled:opacity-50">
                    {posting ? '📤 발행중...' : '⚡ AI 생성 없이 바로 발행'}
                  </button>
                )}

                {/* 발행 결과 */}
                {postResults.length > 0 && (
                  <div className="bg-white border border-gray-100 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">📊 발행 결과</p>
                    {postResults.map(r => (
                      <div key={r.platform} className={`flex items-start gap-2 py-1 text-sm ${r.success ? 'text-green-600' : 'text-red-500'}`}>
                        {r.success ? '✅' : '❌'} {r.platform}
                        {r.error && <span className="text-xs text-gray-400 leading-5">({r.error.slice(0, 80)})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 발행 이력 탭 ── */}
      {tab === 'history' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">최근 30개 발행 이력</p>
            <button onClick={loadHistory} disabled={historyLoading}
              className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50">
              {historyLoading ? '⏳' : '🔄 새로고침'}
            </button>
          </div>

          {historyLoading && <div className="text-center py-12 text-gray-400">⏳ 이력 로딩중...</div>}

          {!historyLoading && history.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-3xl mb-2">📋</div>
              <p>발행 이력이 없습니다</p>
              <p className="text-xs mt-1">상품을 선택해 SNS 발행하면 여기에 기록됩니다</p>
            </div>
          )}

          <div className="space-y-3">
            {history.map(h => (
              <div key={h.id} className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {/* 썸네일 */}
                  {h.image_urls?.[0] && (
                    <img src={h.image_urls[0]} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm text-gray-900 line-clamp-1">{h.product_name}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {h.platforms.map(p => (
                            <span key={p} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                              {PLATFORM_ICON[p]} {p}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(h.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        onClick={() => repost(h)}
                        className="flex-shrink-0 px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold">
                        🔄 재발행
                      </button>
                    </div>

                    {/* 생성된 내용 미리보기 */}
                    {h.generated_content && Object.keys(h.generated_content).length > 0 && (
                      <div className="mt-3 space-y-2">
                        {Object.entries(h.generated_content).map(([platform, content]) => (
                          <details key={platform} className="group">
                            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 select-none">
                              {PLATFORM_ICON[platform]} {platform} 내용 보기 ▾
                            </summary>
                            <div className="mt-1.5 bg-gray-50 rounded-lg p-2.5 text-xs text-gray-600 whitespace-pre-wrap">
                              {content}
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
