'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Platform } from '@/lib/sns/platforms';

interface CoupangProduct {
  productId: number | string;
  productName: string;
  productPrice: number;
  productOldPrice?: number;
  discountRate?: number;
  productUrl: string;
  productImage: string;
  isRocket?: boolean;
  categoryName?: string;
}

interface Review {
  reviewer: string;
  rating: number;
  content: string;
  images: string[];
  date?: string;
}

interface PostResult {
  platform: string;
  success: boolean;
  content?: string;
  error?: string;
}

const PLATFORM_INFO: Record<string, { label: string; icon: string; color: string }> = {
  twitter:   { label: '트위터/X',   icon: '🐦', color: 'from-blue-400 to-blue-600' },
  threads:   { label: '스레드',     icon: '🧵', color: 'from-gray-700 to-black' },
  facebook:  { label: '페이스북',   icon: '📘', color: 'from-blue-500 to-blue-700' },
  instagram: { label: '인스타그램', icon: '📸', color: 'from-pink-500 to-orange-400' },
  linkedin:  { label: '링크드인',   icon: '💼', color: 'from-blue-600 to-blue-800' },
};

export default function CoupangPage() {
  const [tab, setTab] = useState<'search' | 'logs'>('search');
  const [configured, setConfigured] = useState(false);

  // 상품 검색
  const [searchType, setSearchType] = useState<'goldbox' | 'search'>('goldbox');
  const [keyword, setKeyword] = useState('');
  const [products, setProducts] = useState<CoupangProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productError, setProductError] = useState('');

  // 선택된 상품 상세
  const [selected, setSelected] = useState<CoupangProduct | null>(null);
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [loadingAffiliate, setLoadingAffiliate] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [loadingScrape, setLoadingScrape] = useState(false);

  // 수동 리뷰 입력
  const [manualReviews, setManualReviews] = useState<string[]>(['', '', '']);
  const [useManualReviews, setUseManualReviews] = useState(false);

  // SNS 발행
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [snsConnections, setSnsConnections] = useState<{ platform: string; is_active: boolean }[]>([]);
  const [posting, setPosting] = useState(false);
  const [postResults, setPostResults] = useState<PostResult[] | null>(null);

  // 발행 로그
  const [logs, setLogs] = useState<{ id: string; platform: string; status: string; posted_at: string; platform_post_id: string | null }[]>([]);

  useEffect(() => {
    fetch('/api/coupang/settings').then((r) => r.ok ? r.json() : {}).then((d: { configured?: boolean }) => setConfigured(!!d.configured));
    fetch('/api/sns/connections').then((r) => r.ok ? r.json() : []).then(setSnsConnections);
  }, []);

  useEffect(() => {
    if (tab === 'logs') {
      fetch('/api/sns/logs').then((r) => r.ok ? r.json() : []).then(setLogs);
    }
  }, [tab]);

  const loadGoldbox = useCallback(async () => {
    setLoadingProducts(true);
    setProductError('');
    setSelected(null);
    const res = await fetch('/api/coupang/products?type=goldbox');
    const data = await res.json();
    if (res.ok) setProducts(data.products || []);
    else setProductError(data.error || '상품 조회 실패');
    setLoadingProducts(false);
  }, []);

  useEffect(() => {
    if (configured) loadGoldbox();
  }, [configured, loadGoldbox]);

  const handleSearch = async () => {
    if (searchType === 'goldbox') { loadGoldbox(); return; }
    if (!keyword.trim()) return;
    setLoadingProducts(true);
    setProductError('');
    setSelected(null);
    const res = await fetch(`/api/coupang/products?type=search&keyword=${encodeURIComponent(keyword)}`);
    const data = await res.json();
    if (res.ok) setProducts(data.products || []);
    else setProductError(data.error || '검색 실패');
    setLoadingProducts(false);
  };

  const selectProduct = async (product: CoupangProduct) => {
    setSelected(product);
    setAffiliateUrl('');
    setReviews([]);
    setImages([product.productImage]);
    setPostResults(null);
    setManualReviews(['', '', '']);
    setUseManualReviews(false);

    // 제휴 링크 생성
    setLoadingAffiliate(true);
    const affRes = await fetch('/api/coupang/affiliate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productUrl: product.productUrl }),
    });
    if (affRes.ok) {
      const affData = await affRes.json();
      setAffiliateUrl(affData.affiliateUrl || product.productUrl);
    } else {
      setAffiliateUrl(product.productUrl);
    }
    setLoadingAffiliate(false);

    // 리뷰 + 이미지 스크래핑
    setLoadingScrape(true);
    const scrapeRes = await fetch('/api/coupang/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: product.productId }),
    });
    if (scrapeRes.ok) {
      const scrapeData = await scrapeRes.json();
      setReviews(scrapeData.reviews || []);
      setImages((prev) => {
        const all = [...prev, ...(scrapeData.images || [])];
        return [...new Set(all)].slice(0, 4);
      });
    }
    setLoadingScrape(false);
  };

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const handleAutoPost = async () => {
    if (!selected || !affiliateUrl || !selectedPlatforms.length) return;
    setPosting(true);
    setPostResults(null);

    const activeReviews = useManualReviews
      ? manualReviews.filter((r) => r.trim()).map((content) => ({ reviewer: '구매자', rating: 5, content, images: [] }))
      : reviews;

    const res = await fetch('/api/coupang/auto-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: selected.productName,
        price: selected.productPrice,
        discountRate: selected.discountRate || 0,
        affiliateUrl,
        imageUrls: images,
        reviews: activeReviews,
        platforms: selectedPlatforms,
      }),
    });
    const data = await res.json();
    setPostResults(data.results || []);
    setPosting(false);
  };

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">🛒 쿠팡파트너스</h1>
            <p className="text-sm text-gray-400">상품 검색 → 제휴링크 생성 → 리뷰 스크랩 → SNS 자동 홍보</p>
          </div>
          {!configured && (
            <a href="/dashboard/settings" className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100">
              ⚙️ API 키 설정 필요
            </a>
          )}
        </div>
        <div className="flex gap-1 mt-3">
          {[{ key: 'search', label: '상품 탐색' }, { key: 'logs', label: '발행 로그' }].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === t.key ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="p-6">
        {/* ── 상품 탐색 탭 ── */}
        {tab === 'search' && (
          <div className="grid lg:grid-cols-5 gap-6">
            {/* 왼쪽: 상품 목록 */}
            <div className="lg:col-span-3 space-y-4">
              {/* 검색 바 */}
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setSearchType('goldbox')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${searchType === 'goldbox' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    🏆 골드박스
                  </button>
                  <button onClick={() => setSearchType('search')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${searchType === 'search' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    🔍 키워드 검색
                  </button>
                </div>
                {searchType === 'search' && (
                  <div className="flex gap-2">
                    <input
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="상품 키워드 입력 (예: 세탁세제, 노트북)"
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                    />
                    <button onClick={handleSearch}
                      className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors">
                      검색
                    </button>
                  </div>
                )}
                {searchType === 'goldbox' && (
                  <button onClick={loadGoldbox}
                    className="text-xs text-orange-600 hover:text-orange-500">
                    새로고침
                  </button>
                )}
              </div>

              {/* 오류 */}
              {productError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                  ⚠️ {productError}
                  {productError.includes('API 키') && (
                    <a href="/dashboard/settings" className="ml-2 underline">설정 페이지 이동</a>
                  )}
                </div>
              )}

              {/* 상품 그리드 */}
              {loadingProducts ? (
                <div className="text-center py-16 text-gray-400 text-sm">상품 불러오는 중...</div>
              ) : products.length === 0 && !productError ? (
                <div className="text-center py-16 text-gray-400 text-sm">
                  {configured ? '검색하거나 골드박스를 불러오세요' : 'API 키를 설정하면 상품을 불러올 수 있습니다'}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {products.map((product) => (
                    <button
                      key={product.productId}
                      onClick={() => selectProduct(product)}
                      className={`text-left bg-white rounded-2xl border overflow-hidden transition-all hover:shadow-md ${
                        selected?.productId === product.productId ? 'border-orange-400 shadow-md' : 'border-gray-100'
                      }`}>
                      <div className="relative">
                        <img
                          src={product.productImage}
                          alt={product.productName}
                          className="w-full aspect-square object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23f0f0f0"/%3E%3C/svg%3E'; }}
                        />
                        {(product.discountRate || 0) > 0 && (
                          <div className="absolute top-1.5 right-1.5 bg-red-500 text-white text-xs font-black px-1.5 py-0.5 rounded-lg">
                            -{product.discountRate}%
                          </div>
                        )}
                        {product.isRocket && (
                          <div className="absolute bottom-1.5 left-1.5 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                            🚀로켓
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs text-gray-700 font-medium line-clamp-2 mb-1.5">{product.productName}</p>
                        <div>
                          {product.productOldPrice && product.productOldPrice > product.productPrice && (
                            <p className="text-[10px] text-gray-400 line-through">{product.productOldPrice.toLocaleString()}원</p>
                          )}
                          <p className="text-sm font-black text-gray-900">{product.productPrice.toLocaleString()}원</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 오른쪽: 상품 상세 + 발행 패널 */}
            <div className="lg:col-span-2">
              {!selected ? (
                <div className="bg-white rounded-2xl border border-gray-100 flex items-center justify-center h-64 text-gray-400 text-sm">
                  왼쪽에서 상품을 클릭하세요
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 상품 정보 */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex gap-3 mb-3">
                      <img src={selected.productImage} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800 line-clamp-2">{selected.productName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {(selected.discountRate || 0) > 0 && (
                            <span className="text-xs text-red-500 font-bold">-{selected.discountRate}%</span>
                          )}
                          <span className="text-sm font-black text-gray-900">{selected.productPrice.toLocaleString()}원</span>
                        </div>
                      </div>
                    </div>

                    {/* 제휴 링크 */}
                    <div className="bg-orange-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-orange-700">제휴 링크</span>
                        {loadingAffiliate && <span className="text-xs text-gray-400">생성 중...</span>}
                      </div>
                      {affiliateUrl ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-orange-600 truncate flex-1">{affiliateUrl}</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(affiliateUrl)}
                            className="text-xs text-orange-500 hover:text-orange-700 flex-shrink-0 border border-orange-200 px-2 py-0.5 rounded-lg">
                            복사
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">생성 중...</span>
                      )}
                    </div>
                  </div>

                  {/* 스크랩된 이미지 */}
                  {images.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500">첨부 이미지 ({images.length}개)</span>
                        {loadingScrape && <span className="text-xs text-gray-400">스크랩 중...</span>}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {images.map((url, i) => (
                          <img key={i} src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-100" />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 리뷰 */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500">
                        구매 리뷰 {loadingScrape ? '(스크랩 중...)' : `(${reviews.length}개)`}
                      </span>
                      <button
                        onClick={() => setUseManualReviews((v) => !v)}
                        className="text-xs text-indigo-500 hover:text-indigo-700">
                        {useManualReviews ? '자동 스크랩 사용' : '직접 입력'}
                      </button>
                    </div>

                    {useManualReviews ? (
                      <div className="space-y-2">
                        {manualReviews.map((r, i) => (
                          <textarea
                            key={i}
                            value={r}
                            onChange={(e) => setManualReviews((prev) => prev.map((v, idx) => idx === i ? e.target.value : v))}
                            placeholder={`리뷰 ${i + 1} 직접 입력 (쿠팡 상품 페이지에서 복사)`}
                            rows={2}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-400 resize-none"
                          />
                        ))}
                      </div>
                    ) : reviews.length > 0 ? (
                      <div className="space-y-3">
                        {reviews.slice(0, 3).map((r, i) => (
                          <div key={i} className="bg-gray-50 rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs font-bold text-gray-700">{r.reviewer}</span>
                              <span className="text-xs text-yellow-500">{'⭐'.repeat(Math.min(r.rating, 5))}</span>
                              {r.date && <span className="text-xs text-gray-400 ml-auto">{r.date}</span>}
                            </div>
                            <p className="text-xs text-gray-600 line-clamp-3">{r.content}</p>
                            {r.images?.length > 0 && (
                              <div className="flex gap-1 mt-1.5">
                                {r.images.map((img, ii) => (
                                  <img key={ii} src={img} alt="" className="w-10 h-10 rounded object-cover" />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-400 text-xs">
                        {loadingScrape ? '리뷰 스크랩 중...' : '자동 스크랩 실패 → "직접 입력"으로 추가하세요'}
                      </div>
                    )}
                  </div>

                  {/* SNS 발행 */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4">
                    <h3 className="text-xs font-semibold text-gray-500 mb-3">SNS 발행 플랫폼 선택</h3>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(Object.keys(PLATFORM_INFO) as Platform[]).map((p) => {
                        const conn = snsConnections.find((c) => c.platform === p);
                        const isSelected = selectedPlatforms.includes(p);
                        const info = PLATFORM_INFO[p];
                        return (
                          <button
                            key={p}
                            onClick={() => conn?.is_active && togglePlatform(p)}
                            disabled={!conn?.is_active}
                            title={!conn?.is_active ? '연결 필요 (SNS 관리에서 연결)' : undefined}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                              !conn?.is_active ? 'opacity-30 cursor-not-allowed border-gray-100 text-gray-400'
                              : isSelected ? 'border-orange-400 bg-orange-50 text-orange-700'
                              : 'border-gray-200 text-gray-600 hover:border-orange-300'
                            }`}>
                            {info.icon} {info.label}
                          </button>
                        );
                      })}
                    </div>
                    {snsConnections.filter((c) => c.is_active).length === 0 && (
                      <p className="text-xs text-amber-600 mb-3">
                        <a href="/dashboard/sns" className="underline">SNS 관리</a>에서 먼저 연결하세요
                      </p>
                    )}

                    <button
                      onClick={handleAutoPost}
                      disabled={posting || !affiliateUrl || !selectedPlatforms.length}
                      className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm transition-colors">
                      {posting ? 'AI 생성 + 발행 중...' : '🤖 AI 홍보글 생성 + 자동 발행'}
                    </button>
                  </div>

                  {/* 발행 결과 */}
                  {postResults && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-4">
                      <h4 className="text-xs font-semibold text-gray-500 mb-3">발행 결과</h4>
                      <div className="space-y-3">
                        {postResults.map((r) => (
                          <div key={r.platform}>
                            <div className="flex items-center gap-2 mb-1">
                              <span>{PLATFORM_INFO[r.platform]?.icon}</span>
                              <span className="text-xs font-semibold text-gray-700">{PLATFORM_INFO[r.platform]?.label}</span>
                              {r.success ? (
                                <span className="ml-auto text-xs text-emerald-600 font-bold">✓ 성공</span>
                              ) : (
                                <span className="ml-auto text-xs text-red-500">{r.error || '실패'}</span>
                              )}
                            </div>
                            {r.content && (
                              <div className="bg-gray-50 rounded-xl p-2.5 text-xs text-gray-600 whitespace-pre-wrap line-clamp-4">
                                {r.content}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 발행 로그 ── */}
        {tab === 'logs' && (
          <div className="space-y-2 max-w-2xl">
            {logs.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">발행 기록이 없습니다</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
                  <span className="text-lg">{PLATFORM_INFO[log.platform]?.icon || '🌐'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500">{PLATFORM_INFO[log.platform]?.label} · {new Date(log.posted_at).toLocaleString('ko-KR')}</div>
                    {log.platform_post_id && <div className="text-xs text-gray-400 truncate">ID: {log.platform_post_id}</div>}
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${log.status === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {log.status === 'success' ? '성공' : '실패'}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
