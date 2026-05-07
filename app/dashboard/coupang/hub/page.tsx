'use client';

import { useState, useEffect, useCallback } from 'react';

interface CoupangProduct {
  productId: number | string;
  productName: string;
  productPrice: number;
  productOldPrice?: number;
  discountRate?: number;
  productUrl: string;
  productImage: string;
  isRocket?: boolean;
  isFreeShipping?: boolean;
  categoryName?: string;
}

interface PostResult {
  platform: string;
  account?: string;
  success: boolean;
  error?: string;
}

const PLATFORMS = [
  { id: 'threads',   label: '스레드',   icon: '🧵' },
  { id: 'instagram', label: '인스타',   icon: '📸' },
  { id: 'twitter',   label: '트위터',   icon: '🐦' },
  { id: 'facebook',  label: '페북',     icon: '📘' },
];

const PROVIDERS = [
  { id: 'ollama',      label: 'Ollama' },
  { id: 'claude',      label: 'Claude' },
  { id: 'gemini',      label: 'Gemini' },
  { id: 'openrouter',  label: 'OpenRouter' },
];

const DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

export default function CoupangHubPage() {
  const [tab, setTab] = useState<'goldbox' | 'search'>('goldbox');
  const [keyword, setKeyword] = useState('');
  const [products, setProducts] = useState<CoupangProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [selected, setSelected] = useState<CoupangProduct | null>(null);
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [affiliateLoading, setAffiliateLoading] = useState(false);

  const [provider, setProvider] = useState('ollama');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['threads', 'instagram']);
  const [generating, setGenerating] = useState(false);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [contentTab, setContentTab] = useState('threads');
  const [generateError, setGenerateError] = useState('');

  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState('');
  const [postResults, setPostResults] = useState<PostResult[]>([]);

  const [snsConnections, setSnsConnections] = useState<{ platform: string; platform_user_id: string; platform_username: string; platform_display_name: string; is_active: boolean }[]>([]);
  const [selectedThreadsAccounts, setSelectedThreadsAccounts] = useState<string[]>([]);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);

  const [copied, setCopied] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');
  const [scrapedReview, setScrapedReview] = useState('');

  useEffect(() => {
    fetch('/api/coupang/settings').then(r => r.json()).then((d: { configured?: boolean }) => {
      setApiConfigured(!!d.configured);
    }).catch(() => setApiConfigured(false));
    fetch('/api/sns/connections').then(r => r.ok ? r.json() : []).then(
      (d: { platform: string; platform_user_id: string; is_active: boolean }[]) => {
        if (Array.isArray(d)) {
          setSnsConnections(d as typeof snsConnections);
          setSelectedThreadsAccounts(d.filter(c => c.platform === 'threads' && c.is_active).map(c => c.platform_user_id));
        }
      }
    );
  }, []);

  const loadProducts = useCallback(async (type: 'goldbox' | 'search', kw?: string) => {
    setLoading(true);
    setLoadError('');
    setProducts([]);
    setSelected(null);
    setContents({});
    setAffiliateUrl('');
    setPostMsg('');
    setPostResults([]);

    const url = type === 'search' && kw
      ? `/api/coupang/products?type=search&keyword=${encodeURIComponent(kw)}`
      : '/api/coupang/products?type=goldbox';

    const res = await fetch(url);
    const data = await res.json() as { products?: CoupangProduct[]; error?: string };

    if (res.ok) setProducts(data.products || []);
    else setLoadError(data.error || '상품 로드 실패');
    setLoading(false);
  }, []);

  // Auto-load goldbox on mount
  useEffect(() => {
    if (apiConfigured === true) loadProducts('goldbox');
  }, [apiConfigured, loadProducts]);

  const handleSelectProduct = async (product: CoupangProduct) => {
    setSelected(product);
    setAffiliateUrl('');
    setContents({});
    setGenerateError('');
    setPostMsg('');
    setPostResults([]);
    setScrapeStatus('idle');
    setScrapedReview('');

    // 제휴 링크 + 상품 스크랩 병렬 실행
    setAffiliateLoading(true);
    setScrapeStatus('loading');

    const [affiliateRes] = await Promise.allSettled([
      fetch('/api/coupang/affiliate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productUrl: product.productUrl }),
      }),
    ]);

    if (affiliateRes.status === 'fulfilled' && affiliateRes.value.ok) {
      const data = await affiliateRes.value.json() as { affiliateUrl?: string };
      setAffiliateUrl(data.affiliateUrl || product.productUrl);
    } else {
      setAffiliateUrl(product.productUrl);
    }
    setAffiliateLoading(false);

    // 스크랩은 백그라운드로 (리뷰 수집 — 느릴 수 있음)
    fetch('/api/coupang/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productUrl: product.productUrl }),
    })
      .then((r) => r.json())
      .then((d: { reviews?: Array<{ content: string }>; error?: string }) => {
        const review = d.reviews?.[0]?.content?.trim() || '';
        setScrapedReview(review);
        setScrapeStatus(review ? 'done' : 'failed');
      })
      .catch(() => setScrapeStatus('failed'));
  };

  const togglePlatform = (id: string) =>
    setSelectedPlatforms(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleGenerate = async () => {
    if (!selected || !selectedPlatforms.length) return;
    setGenerating(true);
    setGenerateError('');
    setContents({});

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000); // 2분 타임아웃

    try {
      const res = await fetch('/api/coupang/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          productName: selected.productName,
          price: selected.productPrice,
          discountRate: selected.discountRate,
          categoryName: selected.categoryName,
          platforms: selectedPlatforms,
          provider,
          firstReview: scrapedReview || undefined,
        }),
      });
      const data = await res.json() as { contents?: Record<string, string>; errors?: Record<string, string>; error?: string };

      if (res.ok && data.contents) {
        setContents(data.contents);
        const first = selectedPlatforms.find(p => data.contents![p]);
        if (first) setContentTab(first);
        if (data.errors) {
          setGenerateError(`일부 플랫폼 생성 실패: ${Object.keys(data.errors).join(', ')}`);
        }
      } else {
        setGenerateError(data.error || 'AI 생성 실패 — 설정에서 AI 모델 API 키를 확인하세요');
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setGenerateError('시간 초과 — AI 서버가 응답하지 않습니다. Claude나 OpenRouter를 선택해 보세요.');
      } else {
        setGenerateError('네트워크 오류: ' + String(e));
      }
    } finally {
      clearTimeout(timer);
      setGenerating(false);
    }
  };

  const handlePost = async () => {
    if (!selected || !affiliateUrl || Object.keys(contents).length === 0) return;

    const connectedPlatforms = selectedPlatforms.filter(p =>
      snsConnections.some(c => c.platform === p && c.is_active)
    );
    if (!connectedPlatforms.length) {
      setPostMsg('❌ 연결된 SNS가 없습니다. 설정 > SNS에서 연결하세요.');
      return;
    }

    setPosting(true);
    setPostMsg('');
    setPostResults([]);

    const res = await fetch('/api/coupang/auto-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: selected.productName,
        productUrl: selected.productUrl,
        price: selected.productPrice,
        discountRate: selected.discountRate,
        affiliateUrl,
        imageUrls: [selected.productImage].filter(Boolean),
        firstReview: '',
        platforms: connectedPlatforms,
        generatedContent: contents,
        threadsAccountIds: selectedThreadsAccounts,
      }),
    });

    const data = await res.json() as { results?: PostResult[]; error?: string };
    if (res.ok) {
      const results: PostResult[] = data.results || [];
      setPostResults(results);
      const ok = results.filter(r => r.success).length;
      setPostMsg(`✅ ${ok}/${results.length}개 발행 완료`);
    } else {
      setPostMsg(`❌ ${data.error || '발행 실패'}`);
    }
    setPosting(false);
  };

  const handleCopyAll = () => {
    const text = [
      contents[contentTab] || '',
      '',
      `👉 ${affiliateUrl}`,
      '',
      DISCLOSURE,
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Loading state ───────────────────────────────────────────────────
  if (apiConfigured === null) {
    return <div className="p-8 text-center text-gray-400">로딩 중...</div>;
  }

  // ── Not configured ──────────────────────────────────────────────────
  if (!apiConfigured) {
    return (
      <div className="p-6 max-w-xl mx-auto mt-10">
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-10 text-center">
          <div className="text-5xl mb-4">🛒</div>
          <h2 className="text-lg font-bold text-orange-800 mb-2">쿠팡파트너스 API 키 필요</h2>
          <p className="text-sm text-orange-600 mb-6">수익 허브를 사용하려면 API 키를 먼저 등록해주세요.</p>
          <a
            href="/dashboard/settings"
            className="inline-block bg-orange-500 hover:bg-orange-400 text-white px-6 py-2.5 rounded-xl text-sm font-bold"
          >
            설정 &gt; 쿠팡파트너스 탭으로 이동 →
          </a>
        </div>
      </div>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">💰 쿠팡 수익 허브</h1>
          <p className="text-xs text-gray-400 mt-0.5">인기 상품 탐색 → AI 콘텐츠 생성 → SNS 발행까지 원클릭</p>
        </div>
        <a href="/dashboard/coupang" className="text-xs text-gray-400 hover:text-gray-600 underline">URL 직접 스크랩 →</a>
      </div>

      {/* ── Product Browser ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">

        {/* Tab bar + search */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            <button
              onClick={() => { setTab('goldbox'); loadProducts('goldbox'); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'goldbox' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >🔥 골드박스</button>
            <button
              onClick={() => setTab('search')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === 'search' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >🔍 키워드</button>
          </div>

          {tab === 'search' && (
            <div className="flex gap-2 flex-1">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && keyword.trim() && loadProducts('search', keyword)}
                placeholder="키워드 입력 후 Enter (예: 에어프라이어)"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
              <button
                onClick={() => keyword.trim() && loadProducts('search', keyword)}
                disabled={loading}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-sm font-medium disabled:opacity-50"
              >검색</button>
            </div>
          )}
        </div>

        {/* Product grid */}
        {loading ? (
          <div className="text-center py-14 text-gray-400 text-sm">
            <div className="text-3xl mb-2 animate-pulse">🛒</div>
            상품 불러오는 중...
          </div>
        ) : loadError ? (
          <div className="text-center py-10">
            <p className="text-red-500 text-sm mb-3">{loadError}</p>
            <button onClick={() => loadProducts('goldbox')} className="text-xs text-orange-500 underline">다시 시도</button>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">상품이 없습니다</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {products.map((product) => {
              const isSelected = selected?.productId === product.productId;
              return (
                <button
                  key={product.productId}
                  onClick={() => handleSelectProduct(product)}
                  className={`text-left rounded-xl border-2 p-2 transition-all hover:shadow-md ${
                    isSelected
                      ? 'border-orange-400 bg-orange-50 shadow-md'
                      : 'border-gray-100 hover:border-orange-200 bg-white'
                  }`}
                >
                  <div className="relative mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.productImage}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full aspect-square object-cover rounded-lg"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {product.discountRate && product.discountRate > 0 && (
                      <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none">
                        -{product.discountRate}%
                      </span>
                    )}
                    {product.isRocket && (
                      <span className="absolute top-1 left-1 bg-[#1264f3] text-white text-[9px] px-1.5 py-0.5 rounded-md leading-none font-bold">
                        로켓
                      </span>
                    )}
                    {isSelected && (
                      <div className="absolute inset-0 rounded-lg bg-orange-400/20 flex items-center justify-center">
                        <span className="text-2xl">✓</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-700 font-medium leading-tight mb-1 line-clamp-2">{product.productName}</p>
                  {product.productOldPrice && product.productOldPrice > product.productPrice ? (
                    <p className="text-[10px] text-gray-400 line-through">{product.productOldPrice.toLocaleString()}원</p>
                  ) : null}
                  <p className="text-sm font-bold text-orange-600">{product.productPrice.toLocaleString()}원</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Selected Product + Generation (shown after selection) ───── */}
      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Selected product info — 2/5 */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <h3 className="font-bold text-gray-800 text-sm">선택된 상품</h3>

            <div className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.productImage}
                alt=""
                referrerPolicy="no-referrer"
                className="w-24 h-24 object-cover rounded-xl flex-shrink-0 bg-gray-100"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 leading-snug mb-1 line-clamp-3">{selected.productName}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold text-orange-600">{selected.productPrice.toLocaleString()}원</span>
                  {selected.discountRate ? (
                    <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">-{selected.discountRate}%</span>
                  ) : null}
                </div>
                {selected.isFreeShipping && (
                  <span className="text-[10px] text-emerald-600 font-medium">무료배송</span>
                )}
                {selected.categoryName && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{selected.categoryName}</p>
                )}
              </div>
            </div>

            {/* Affiliate link */}
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">제휴 링크</label>
              {affiliateLoading ? (
                <p className="text-xs text-gray-400 py-1.5 animate-pulse">링크 생성 중...</p>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    value={affiliateUrl}
                    onChange={(e) => setAffiliateUrl(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-orange-300"
                  />
                  <button
                    onClick={() => { navigator.clipboard.writeText(affiliateUrl); }}
                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium"
                  >복사</button>
                </div>
              )}
            </div>

            {/* Original product link */}
            <a
              href={selected.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-400 hover:underline block truncate"
            >쿠팡 상품 페이지 →</a>
          </div>

          {/* AI Generation panel — 3/5 */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <h3 className="font-bold text-gray-800 text-sm">🤖 AI 콘텐츠 생성</h3>

            {/* Provider */}
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">AI 모델</label>
              <div className="flex flex-wrap gap-1.5">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      provider === p.id
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'border-gray-200 text-gray-600 hover:border-orange-300'
                    }`}
                  >{p.label}</button>
                ))}
              </div>
            </div>

            {/* Platforms */}
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">발행 플랫폼</label>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((p) => {
                  const connected = snsConnections.some(c => c.platform === p.id && c.is_active);
                  const checked = selectedPlatforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePlatform(p.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                        checked
                          ? 'bg-blue-500 border-blue-500 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-blue-300'
                      }`}
                    >
                      {p.icon} {p.label}
                      {connected && <span className={checked ? 'text-blue-200' : 'text-emerald-500'}>●</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">● = SNS 계정 연결됨</p>
            </div>

            {/* Threads 멀티계정 선택 */}
            {selectedPlatforms.includes('threads') && (() => {
              const threadsConns = snsConnections.filter(c => c.platform === 'threads' && c.is_active);
              if (threadsConns.length <= 1) return null;
              return (
                <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl">
                  <p className="text-xs font-semibold text-purple-700 mb-2">🧵 발행할 스레드 계정 선택</p>
                  <div className="space-y-1.5">
                    {threadsConns.map((conn) => (
                      <label key={conn.platform_user_id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedThreadsAccounts.includes(conn.platform_user_id)}
                          onChange={(e) => setSelectedThreadsAccounts(prev =>
                            e.target.checked ? [...prev, conn.platform_user_id] : prev.filter(id => id !== conn.platform_user_id)
                          )}
                          className="rounded border-purple-300 text-purple-600"
                        />
                        <span className="text-sm font-medium text-purple-900">{conn.platform_display_name || conn.platform_username}</span>
                        <span className="text-xs text-purple-400">{conn.platform_username}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* 스크랩 상태 표시 */}
            {scrapeStatus === 'loading' && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="inline-block w-2.5 h-2.5 border-2 border-gray-300 border-t-orange-400 rounded-full animate-spin" />
                상품 리뷰 수집 중... (AI 품질 향상)
              </div>
            )}
            {scrapeStatus === 'done' && scrapedReview && (
              <div className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                ✓ 리뷰 수집 완료 — AI가 실제 후기를 참고해 글을 씁니다
              </div>
            )}
            {scrapeStatus === 'failed' && (
              <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                리뷰 수집 실패 — 상품명·가격으로만 생성합니다
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={generating || !selectedPlatforms.length || affiliateLoading}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-400 hover:to-orange-300 disabled:from-gray-300 disabled:to-gray-300 text-white rounded-xl text-sm font-bold transition-all shadow-sm"
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  AI 글 생성 중...
                </span>
              ) : '✨ AI 글 생성'}
            </button>

            {generateError && (
              <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{generateError}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Content Preview & Publish ─────────────────────────────── */}
      {Object.keys(contents).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800 text-sm">📝 콘텐츠 미리보기 & 발행</h3>
            <span className="text-xs text-gray-400">편집 후 발행하세요</span>
          </div>

          {/* Platform tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {Object.keys(contents).map((p) => {
              const info = PLATFORMS.find(pl => pl.id === p);
              return (
                <button
                  key={p}
                  onClick={() => setContentTab(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    contentTab === p ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >{info?.icon} {info?.label || p}</button>
              );
            })}
          </div>

          {/* Editable content */}
          <textarea
            value={contents[contentTab] || ''}
            onChange={(e) => setContents(prev => ({ ...prev, [contentTab]: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-300 resize-none"
            rows={7}
            placeholder="생성된 콘텐츠가 여기 나타납니다"
          />

          {/* Affiliate URL preview */}
          {affiliateUrl && (
            <div className="bg-orange-50 rounded-xl px-3 py-2 text-xs">
              <span className="text-orange-600 font-medium">제휴 링크 (댓글에 자동 추가됨):</span>
              <span className="ml-1 font-mono text-gray-600 break-all">{affiliateUrl}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={handleCopyAll}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium transition-colors"
            >
              {copied ? '✅ 복사됨!' : '📋 링크+공시 포함 복사'}
            </button>

            <button
              onClick={handlePost}
              disabled={posting || !affiliateUrl}
              className="px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-400 hover:from-blue-400 hover:to-blue-300 disabled:from-gray-300 disabled:to-gray-300 text-white rounded-xl text-sm font-bold transition-all shadow-sm"
            >
              {posting ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  발행 중...
                </span>
              ) : '📤 SNS 자동 발행'}
            </button>

            {postMsg && (
              <span className={`text-sm font-medium ${postMsg.includes('✅') ? 'text-emerald-600' : 'text-red-500'}`}>
                {postMsg}
              </span>
            )}
          </div>

          {/* Post results detail */}
          {postResults.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {postResults.map((r) => {
                const info = PLATFORMS.find(p => p.id === r.platform);
                return (
                  <span
                    key={r.platform}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      r.success
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {r.success ? '✓' : '✗'} {info?.icon} {info?.label || r.platform}
                    {!r.success && r.error ? ` — ${r.error}` : ''}
                  </span>
                );
              })}
            </div>
          )}

          {/* Unconnected platforms warning */}
          {(() => {
            const unconnected = selectedPlatforms.filter(
              p => !snsConnections.some(c => c.platform === p && c.is_active)
            );
            if (!unconnected.length) return null;
            const names = unconnected.map(p => PLATFORMS.find(pl => pl.id === p)?.label || p).join(', ');
            return (
              <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 flex items-center justify-between">
                <span>미연결 플랫폼: {names}</span>
                <a href="/dashboard/settings" className="underline font-medium ml-2">SNS 연결 →</a>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Tips ──────────────────────────────────────────────────── */}
      {!selected && !loading && products.length > 0 && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-2xl p-4">
          <p className="text-sm font-medium text-orange-800 mb-2">💡 사용법</p>
          <ol className="text-xs text-orange-700 space-y-1 list-decimal list-inside">
            <li>위 상품 목록에서 마음에 드는 상품 클릭</li>
            <li>제휴 링크가 자동 생성됩니다</li>
            <li>AI 모델과 발행할 SNS 플랫폼을 선택</li>
            <li>AI 글 생성 버튼 클릭 → 내용 확인/수정</li>
            <li>SNS 자동 발행 — 제휴 링크는 댓글로 자동 추가</li>
          </ol>
        </div>
      )}
    </div>
  );
}
