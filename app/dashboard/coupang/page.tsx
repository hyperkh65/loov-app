'use client';

import { useState, useEffect } from 'react';
import type { Platform } from '@/lib/sns/platforms';

interface ScrapedProduct {
  productName: string;
  productPrice: number;
  productOldPrice: number;
  discountRate: number;
  reviews: Review[];
  images: string[];
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

interface HistoryItem {
  id: string;
  product_name: string;
  product_url: string;
  affiliate_url: string;
  image_urls: string[];
  first_review: string;
  platforms: string[];
  generated_content: Record<string, string>;
  created_at: string;
}

const PLATFORM_INFO: Record<string, { label: string; icon: string; color: string }> = {
  twitter:   { label: '트위터/X',   icon: '🐦', color: 'from-blue-400 to-blue-600' },
  threads:   { label: '스레드',     icon: '🧵', color: 'from-gray-700 to-black' },
  facebook:  { label: '페이스북',   icon: '📘', color: 'from-blue-500 to-blue-700' },
  instagram: { label: '인스타그램', icon: '📸', color: 'from-pink-500 to-orange-400' },
  linkedin:  { label: '링크드인',   icon: '💼', color: 'from-blue-600 to-blue-800' },
};

function StarRating({ n }: { n: number }) {
  return <span className="text-yellow-400 text-xs">{'★'.repeat(Math.max(0, Math.min(5, n)))}{'☆'.repeat(5 - Math.max(0, Math.min(5, n)))}</span>;
}

export default function CoupangPage() {
  // ── URL 입력 ──────────────────────────────────────────
  const [productUrl, setProductUrl] = useState('');
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');

  // ── 스크랩 결과 ────────────────────────────────────────
  const [product, setProduct] = useState<ScrapedProduct | null>(null);
  const [useManualReviews, setUseManualReviews] = useState(false);
  const [manualReviews, setManualReviews] = useState(['', '', '']);
  const [useManualImages, setUseManualImages] = useState(false);
  const [manualImageUrls, setManualImageUrls] = useState(['', '', '']);
  const [manualProductName, setManualProductName] = useState('');

  // ── SNS 발행 ──────────────────────────────────────────
  const [snsConnections, setSnsConnections] = useState<{ platform: string; is_active: boolean }[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [posting, setPosting] = useState(false);
  const [postResults, setPostResults] = useState<PostResult[] | null>(null);

  // ── 히스토리 ──────────────────────────────────────────
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadHistory = async () => {
    const res = await fetch('/api/coupang/history');
    if (res.ok) setHistory(await res.json());
  };

  useEffect(() => {
    fetch('/api/sns/connections').then((r) => r.ok ? r.json() : []).then(setSnsConnections);
    loadHistory();
  }, []);

  const handleScrape = async () => {
    if (!productUrl.trim()) return;
    setScraping(true);
    setScrapeError('');
    setProduct(null);
    setPostResults(null);
    setAffiliateUrl('');

    const res = await fetch('/api/coupang/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productUrl: productUrl.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setProduct(data);
      setUseManualReviews(data.reviews?.length === 0);
      setUseManualImages(data.images?.length === 0);
      setManualProductName(data.productName || '');
    } else {
      setScrapeError(data.error || '스크랩 실패');
    }
    setScraping(false);
  };

  const togglePlatform = (p: Platform) =>
    setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const handlePost = async () => {
    if (!product || !affiliateUrl.trim() || !selectedPlatforms.length) return;
    setPosting(true);
    setPostResults(null);

    const activeImages = useManualImages
      ? manualImageUrls.filter((u) => u.trim())
      : product.images;

    const activeName = manualProductName.trim() || product.productName;

    const firstReview = useManualReviews
      ? manualReviews.find((r) => r.trim()) || ''
      : product.reviews[0]?.content || '';

    const res = await fetch('/api/coupang/auto-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: activeName,
        productUrl: productUrl.trim(),
        price: product.productPrice,
        discountRate: product.discountRate,
        affiliateUrl: affiliateUrl.trim(),
        imageUrls: activeImages,
        firstReview,
        platforms: selectedPlatforms,
      }),
    });
    const data = await res.json();
    setPostResults(data.results || []);
    setPosting(false);
    loadHistory();
  };

  const handleRepost = (item: HistoryItem) => {
    setProduct({
      productName: item.product_name,
      productPrice: 0,
      productOldPrice: 0,
      discountRate: 0,
      reviews: item.first_review
        ? [{ reviewer: '구매자', rating: 5, content: item.first_review, images: [] }]
        : [],
      images: item.image_urls,
    });
    setProductUrl(item.product_url);
    setAffiliateUrl(item.affiliate_url);
    setManualProductName(item.product_name);
    setUseManualImages(false);
    setUseManualReviews(false);
    setPostResults(null);
    setScrapeError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <h1 className="text-lg font-black text-gray-900">🛒 쿠팡파트너스 SNS 자동 홍보</h1>
        <p className="text-sm text-gray-400 mt-0.5">상품 URL → 정보·리뷰 자동 스크랩 → AI 홍보글 → SNS 발행</p>
      </header>

      <div className="p-6 max-w-3xl space-y-5">

        {/* ── 사용 방법 안내 ── */}
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
          <p className="text-xs font-bold text-orange-700 mb-2">📋 사용 방법 (API 없이도 OK)</p>
          <ol className="text-xs text-orange-600 space-y-1 list-decimal list-inside">
            <li><a href="https://www.coupang.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">coupang.com</a>에서 홍보할 상품 페이지 URL 복사</li>
            <li><a href="https://partners.coupang.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">partners.coupang.com</a>에서 해당 상품 링크생성 버튼 → 제휴 링크 복사</li>
            <li>아래 두 입력창에 각각 붙여넣기 → 스크랩 → 발행</li>
          </ol>
        </div>

        {/* ── Step 1: URL 입력 + 스크랩 ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-orange-500 text-white rounded-full text-xs flex items-center justify-center font-black">1</span>
            쿠팡 상품 URL 붙여넣기
          </h2>

          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScrape()}
                placeholder="https://www.coupang.com/vp/products/..."
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 font-mono text-xs"
              />
              <button
                onClick={handleScrape}
                disabled={scraping || !productUrl.trim()}
                className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors whitespace-nowrap">
                {scraping ? '스크랩 중...' : '🔍 분석'}
              </button>
            </div>

            {scrapeError && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600 space-y-1">
                <p>⚠️ {scrapeError}</p>
                <p className="text-red-500">
                  쿠팡 봇 차단이 의심될 경우 — 1~2분 후 재시도하거나, 스크랩 결과에서 이미지·리뷰를 직접 입력하세요
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Step 2: 스크랩 결과 ── */}
        {product && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-orange-500 text-white rounded-full text-xs flex items-center justify-center font-black">2</span>
              스크랩 결과 확인
            </h2>

            {/* 상품 정보 */}
            <div className="flex gap-4 mb-4">
              {(useManualImages ? manualImageUrls.find(u => u.trim()) : product.images[0]) && (
                <img
                  src={useManualImages ? manualImageUrls.find(u => u.trim()) : product.images[0]}
                  alt=""
                  className="w-20 h-20 rounded-xl object-cover flex-shrink-0 border border-gray-100"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="mb-2">
                  <input
                    value={manualProductName}
                    onChange={(e) => setManualProductName(e.target.value)}
                    placeholder={product.productName || '상품명 직접 입력'}
                    className="w-full text-sm font-bold text-gray-800 border-b border-gray-200 focus:border-orange-400 focus:outline-none pb-0.5 bg-transparent"
                  />
                  {!product.productName && !manualProductName && (
                    <p className="text-xs text-amber-500 mt-0.5">상품명을 입력하세요</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {product.discountRate > 0 && (
                    <span className="text-xs text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded">-{product.discountRate}%</span>
                  )}
                  {product.productPrice > 0 && (
                    <span className="text-sm font-black text-gray-900">{product.productPrice.toLocaleString()}원</span>
                  )}
                  {product.productOldPrice > 0 && (
                    <span className="text-xs text-gray-400 line-through">{product.productOldPrice.toLocaleString()}원</span>
                  )}
                </div>
              </div>
            </div>

            {/* 이미지 섹션 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400">
                  수집된 이미지 ({product.images.length}개)
                  {product.images.length === 0 && <span className="text-amber-500 ml-1">— 직접 입력 필요</span>}
                </p>
                <button
                  onClick={() => setUseManualImages((v) => !v)}
                  className="text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-lg">
                  {useManualImages ? '자동 스크랩 사용' : '직접 입력으로 전환'}
                </button>
              </div>

              {useManualImages ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 mb-1">
                    쿠팡 상품 이미지 위에서 <strong>우클릭 → 이미지 주소 복사</strong> 후 붙여넣기
                  </p>
                  {manualImageUrls.map((url, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        value={url}
                        onChange={(e) => setManualImageUrls((prev) => prev.map((v, idx) => idx === i ? e.target.value : v))}
                        placeholder={`이미지 URL ${i + 1} (https://...)`}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400 font-mono"
                      />
                      {url.trim() && (
                        <img src={url.trim()} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-100 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )}
                    </div>
                  ))}
                </div>
              ) : product.images.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {product.images.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-100" />
                  ))}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                  자동 수집 실패 → "직접 입력으로 전환" 버튼을 눌러 이미지 URL을 붙여넣으세요
                </div>
              )}
            </div>

            {/* 리뷰 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400">
                  수집된 리뷰 ({product.reviews.length}개)
                  {product.reviews.length === 0 && <span className="text-amber-500 ml-1">— 직접 입력 필요</span>}
                </p>
                <button
                  onClick={() => setUseManualReviews((v) => !v)}
                  className="text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-lg">
                  {useManualReviews ? '자동 스크랩 사용' : '직접 입력으로 전환'}
                </button>
              </div>

              {useManualReviews ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 mb-1">쿠팡 상품 페이지 리뷰 탭에서 복사해서 붙여넣으세요</p>
                  {manualReviews.map((r, i) => (
                    <textarea
                      key={i}
                      value={r}
                      onChange={(e) => setManualReviews((prev) => prev.map((v, idx) => idx === i ? e.target.value : v))}
                      placeholder={`리뷰 ${i + 1} 입력 (쿠팡 상품 페이지 > 리뷰 탭에서 복사)`}
                      rows={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400 resize-none"
                    />
                  ))}
                </div>
              ) : product.reviews.length > 0 ? (
                <div className="space-y-2">
                  {product.reviews.slice(0, 3).map((r, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-gray-700">{r.reviewer}</span>
                        <StarRating n={r.rating} />
                        {r.date && <span className="text-xs text-gray-400 ml-auto">{r.date}</span>}
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-3">{r.content}</p>
                      {r.images?.length > 0 && (
                        <div className="flex gap-1 mt-1.5">
                          {r.images.map((img, ii) => <img key={ii} src={img} alt="" className="w-10 h-10 rounded object-cover" />)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                  자동 수집 실패 → "직접 입력으로 전환" 버튼을 눌러 리뷰를 직접 붙여넣으세요
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: 제휴 링크 입력 ── */}
        {product && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
              <span className="w-6 h-6 bg-orange-500 text-white rounded-full text-xs flex items-center justify-center font-black">3</span>
              제휴 링크 입력
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              <a href="https://partners.coupang.com" target="_blank" rel="noopener noreferrer" className="text-orange-500 underline font-medium">partners.coupang.com</a>
              {' '}에서 해당 상품의 링크생성 버튼 → 생성된 링크 복사 후 붙여넣기
            </p>
            <input
              value={affiliateUrl}
              onChange={(e) => setAffiliateUrl(e.target.value)}
              placeholder="https://link.coupang.com/a/..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 font-mono text-xs"
            />
            {affiliateUrl && (
              <p className="text-xs text-emerald-600 mt-1.5">✓ 제휴 링크 입력됨</p>
            )}
          </div>
        )}

        {/* ── Step 4: SNS 발행 ── */}
        {product && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-orange-500 text-white rounded-full text-xs flex items-center justify-center font-black">4</span>
              SNS 플랫폼 선택 + 발행
            </h2>

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
                    title={!conn?.is_active ? 'SNS 관리에서 먼저 연결하세요' : undefined}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
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
                <a href="/dashboard/sns" className="underline font-medium">SNS 관리 페이지</a>에서 먼저 계정을 연결하세요
              </p>
            )}

            {!affiliateUrl.trim() && (
              <p className="text-xs text-amber-600 mb-3">⚠️ 제휴 링크를 입력해야 발행할 수 있습니다</p>
            )}

            <button
              onClick={handlePost}
              disabled={posting || !affiliateUrl.trim() || !selectedPlatforms.length}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm transition-colors">
              {posting ? '🤖 AI 홍보글 생성 중...' : '🚀 AI 홍보글 생성 + SNS 발행'}
            </button>
          </div>
        )}

        {/* ── 발행 결과 ── */}
        {postResults && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-800 mb-3">발행 결과</h3>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3 text-xs text-blue-700">
              💬 구매링크와 쿠팡 파트너스 고지문구는 각 플랫폼 게시물의 댓글로 자동 추가됩니다.
            </div>
            <div className="space-y-4">
              {postResults.map((r) => (
                <div key={r.platform}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span>{PLATFORM_INFO[r.platform]?.icon}</span>
                    <span className="text-sm font-semibold text-gray-700">{PLATFORM_INFO[r.platform]?.label}</span>
                    {r.success
                      ? <span className="ml-auto text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">✓ 발행 완료</span>
                      : <span className="ml-auto text-xs text-red-500">{r.error || '실패'}</span>
                    }
                  </div>
                  {r.content && (
                    <div className="bg-gray-50 rounded-xl px-3 py-2.5 text-xs text-gray-700 whitespace-pre-wrap">
                      {r.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 발행 히스토리 ── */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              📋 발행 히스토리
              <span className="text-xs text-gray-400 font-normal ml-auto">최근 30개</span>
            </h2>
            <div className="space-y-2">
              {history.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-orange-50 transition-colors">
                  {item.image_urls?.[0] ? (
                    <img
                      src={item.image_urls[0]}
                      alt=""
                      className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-gray-100"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gray-200 flex-shrink-0 flex items-center justify-center text-gray-400 text-xs">🛒</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.product_name || '(상품명 없음)'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">
                        {item.platforms.map((p) => PLATFORM_INFO[p]?.icon || p).join(' ')}
                      </span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">
                        {new Date(item.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {item.first_review && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">"{item.first_review.substring(0, 50)}..."</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRepost(item)}
                    className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap hover:bg-orange-100 transition-colors flex-shrink-0">
                    🔄 재발행
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
