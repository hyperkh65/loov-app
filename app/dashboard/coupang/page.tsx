'use client';

import { useState, useEffect, useCallback } from 'react';
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

const PLATFORM_INFO: Record<string, { label: string; icon: string }> = {
  twitter:   { label: '트위터/X',   icon: '🐦' },
  threads:   { label: '스레드',     icon: '🧵' },
  facebook:  { label: '페이스북',   icon: '📘' },
  instagram: { label: '인스타그램', icon: '📸' },
  linkedin:  { label: '링크드인',   icon: '💼' },
};

function StarRating({ n }: { n: number }) {
  return <span className="text-yellow-400 text-xs">{'★'.repeat(Math.max(0, Math.min(5, n)))}{'☆'.repeat(5 - Math.max(0, Math.min(5, n)))}</span>;
}

export default function CoupangPage() {
  // ── URL / 스크랩 ───────────────────────────────────────
  const [productUrl, setProductUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');
  const [product, setProduct] = useState<ScrapedProduct | null>(null);
  const [useManualReviews, setUseManualReviews] = useState(false);
  const [manualReviews, setManualReviews] = useState(['', '', '']);
  const [useManualImages, setUseManualImages] = useState(false);
  const [manualImageUrls, setManualImageUrls] = useState(['', '', '']);
  const [manualProductName, setManualProductName] = useState('');

  // ── 제휴 링크 ──────────────────────────────────────────
  const [affiliateUrl, setAffiliateUrl] = useState('');

  // ── 플랫폼 선택 ────────────────────────────────────────
  const [snsConnections, setSnsConnections] = useState<{ platform: string; is_active: boolean }[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);

  // ── AI 미리보기 ────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [previewTexts, setPreviewTexts] = useState<Record<string, string>>({});

  // ── 발행 ──────────────────────────────────────────────
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [postResults, setPostResults] = useState<PostResult[] | null>(null);

  // ── 히스토리 ──────────────────────────────────────────
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/coupang/history');
    if (res.ok) setHistory(await res.json());
  }, []);

  useEffect(() => {
    fetch('/api/sns/connections').then((r) => r.ok ? r.json() : []).then(setSnsConnections);
    loadHistory();
  }, [loadHistory]);

  // ── 스크랩 ────────────────────────────────────────────
  const handleScrape = async () => {
    if (!productUrl.trim()) return;
    setScraping(true);
    setScrapeError('');
    setProduct(null);
    setPostResults(null);
    setPreviewTexts({});

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

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
    setPreviewTexts({});  // 플랫폼 변경 시 미리보기 초기화
  };

  // ── 현재 활성 값 계산 ──────────────────────────────────
  const getActiveValues = () => {
    const activeImages = useManualImages
      ? manualImageUrls.filter((u) => u.trim())
      : (product?.images || []);
    const activeName = manualProductName.trim() || product?.productName || '';
    const firstReview = useManualReviews
      ? manualReviews.find((r) => r.trim()) || ''
      : product?.reviews[0]?.content || '';
    return { activeImages, activeName, firstReview };
  };

  // ── AI 글 생성 (미리보기) ──────────────────────────────
  const handleGenerate = async () => {
    if (!product || !selectedPlatforms.length) return;
    setGenerating(true);
    setGenerateError('');

    const { activeName, firstReview } = getActiveValues();

    try {
      const res = await fetch('/api/coupang/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: activeName,
          price: product.productPrice,
          discountRate: product.discountRate,
          firstReview,
          platforms: selectedPlatforms,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setGenerateError((err as { error?: string }).error || `오류 (${res.status})`);
        return;
      }
      const data = await res.json() as { contents: Record<string, string> };
      setPreviewTexts(data.contents || {});
    } catch (e) {
      setGenerateError('네트워크 오류: ' + String(e));
    } finally {
      setGenerating(false);
    }
  };

  // ── 임시저장 (localStorage) ────────────────────────────
  const handleSave = () => {
    if (!product) return;
    const { activeName, activeImages, firstReview } = getActiveValues();
    const draft = {
      productName: activeName,
      productUrl: productUrl.trim(),
      affiliateUrl: affiliateUrl.trim(),
      imageUrls: activeImages,
      firstReview,
      platforms: selectedPlatforms,
      previewTexts,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem('coupang_draft', JSON.stringify(draft));
    alert('임시저장 완료! 나중에 이 페이지를 다시 열면 불러올 수 있습니다.');
  };

  // ── 임시저장 불러오기 ──────────────────────────────────
  const handleLoadDraft = () => {
    const raw = localStorage.getItem('coupang_draft');
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as {
        productName: string;
        productUrl: string;
        affiliateUrl: string;
        imageUrls: string[];
        firstReview: string;
        platforms: Platform[];
        previewTexts: Record<string, string>;
        savedAt: string;
      };
      setProductUrl(draft.productUrl || '');
      setAffiliateUrl(draft.affiliateUrl || '');
      setSelectedPlatforms(draft.platforms || []);
      setPreviewTexts(draft.previewTexts || {});
      setManualProductName(draft.productName || '');
      if (draft.imageUrls?.length) {
        setUseManualImages(true);
        setManualImageUrls([draft.imageUrls[0] || '', draft.imageUrls[1] || '', draft.imageUrls[2] || '']);
      }
      if (draft.firstReview) {
        setUseManualReviews(true);
        setManualReviews([draft.firstReview, '', '']);
      }
      // 가상의 product state (이름과 이미지만)
      setProduct({
        productName: draft.productName,
        productPrice: 0,
        productOldPrice: 0,
        discountRate: 0,
        reviews: draft.firstReview ? [{ reviewer: '구매자', rating: 5, content: draft.firstReview, images: [] }] : [],
        images: draft.imageUrls || [],
      });
    } catch {
      alert('임시저장 데이터를 불러오는데 실패했습니다.');
    }
  };

  // ── SNS 발행 ──────────────────────────────────────────
  const handlePost = async () => {
    if (!product || !affiliateUrl.trim() || !selectedPlatforms.length) return;
    if (Object.keys(previewTexts).length === 0) {
      setPostError('먼저 "AI 글 생성" 버튼으로 내용을 생성하세요');
      return;
    }

    setPosting(true);
    setPostResults(null);
    setPostError('');

    const { activeName, activeImages, firstReview } = getActiveValues();

    try {
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
          generatedContent: previewTexts,  // 편집된 내용 전달
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPostError((err as { error?: string }).error || `서버 오류 (${res.status})`);
        return;
      }
      const data = await res.json() as { results: PostResult[] };
      setPostResults(data.results || []);
      loadHistory();
    } catch (e) {
      setPostError('네트워크 오류: ' + String(e));
    } finally {
      setPosting(false);
    }
  };

  // ── 재발행 ────────────────────────────────────────────
  const handleRepost = (item: HistoryItem) => {
    setProduct({
      productName: item.product_name,
      productPrice: 0,
      productOldPrice: 0,
      discountRate: 0,
      reviews: item.first_review ? [{ reviewer: '구매자', rating: 5, content: item.first_review, images: [] }] : [],
      images: item.image_urls,
    });
    setProductUrl(item.product_url);
    setAffiliateUrl(item.affiliate_url);
    setManualProductName(item.product_name);
    setSelectedPlatforms(item.platforms as Platform[]);
    setPreviewTexts(item.generated_content || {});
    setUseManualImages(false);
    setUseManualReviews(false);
    setPostResults(null);
    setPostError('');
    setScrapeError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const hasDraft = typeof window !== 'undefined' && !!localStorage.getItem('coupang_draft');

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-gray-900">🛒 쿠팡파트너스 SNS 자동 홍보</h1>
            <p className="text-sm text-gray-400 mt-0.5">스크랩 → AI 글 생성 → 미리보기 편집 → 저장 → 발행</p>
          </div>
          <button
            onClick={handleLoadDraft}
            className="text-xs text-indigo-600 border border-indigo-100 bg-indigo-50 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100 transition-colors">
            📂 임시저장 불러오기
          </button>
        </div>
      </header>

      <div className="p-6 max-w-3xl space-y-5">

        {/* ── 사용 방법 ── */}
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
          <p className="text-xs font-bold text-orange-700 mb-2">📋 사용 방법</p>
          <ol className="text-xs text-orange-600 space-y-1 list-decimal list-inside">
            <li><a href="https://www.coupang.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">coupang.com</a> 상품 URL + <a href="https://partners.coupang.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">파트너스</a> 제휴 링크 입력</li>
            <li>플랫폼 선택 → AI 글 생성 → 미리보기에서 편집</li>
            <li>💾 임시저장으로 나중에 발행 가능 | 🚀 발행하면 구매링크+고지문구 자동 댓글</li>
          </ol>
        </div>

        {/* ── Step 1: URL 입력 ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-orange-500 text-white rounded-full text-xs flex items-center justify-center font-black">1</span>
            쿠팡 상품 URL 분석
          </h2>
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
              {scraping ? '분석 중...' : '🔍 분석'}
            </button>
          </div>
          {scrapeError && (
            <div className="mt-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600">
              ⚠️ {scrapeError} — 1~2분 후 재시도하거나 아래에서 직접 입력하세요
            </div>
          )}
        </div>

        {/* ── Step 2: 스크랩 결과 ── */}
        {product && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-orange-500 text-white rounded-full text-xs flex items-center justify-center font-black">2</span>
              상품 정보 확인
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
                <input
                  value={manualProductName}
                  onChange={(e) => setManualProductName(e.target.value)}
                  placeholder={product.productName || '상품명 직접 입력'}
                  className="w-full text-sm font-bold text-gray-800 border-b border-gray-200 focus:border-orange-400 focus:outline-none pb-0.5 bg-transparent mb-2"
                />
                <div className="flex items-center gap-2">
                  {product.discountRate > 0 && (
                    <span className="text-xs text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded">-{product.discountRate}%</span>
                  )}
                  {product.productPrice > 0 && (
                    <span className="text-sm font-black text-gray-900">{product.productPrice.toLocaleString()}원</span>
                  )}
                </div>
              </div>
            </div>

            {/* 이미지 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400">
                  이미지 ({product.images.length}개 수집)
                </p>
                <button onClick={() => setUseManualImages((v) => !v)}
                  className="text-xs text-indigo-500 border border-indigo-100 px-2 py-0.5 rounded-lg">
                  {useManualImages ? '자동 사용' : '직접 입력'}
                </button>
              </div>
              {useManualImages ? (
                <div className="space-y-2">
                  {manualImageUrls.map((url, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={url}
                        onChange={(e) => setManualImageUrls((prev) => prev.map((v, idx) => idx === i ? e.target.value : v))}
                        placeholder={`이미지 URL ${i + 1}`}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400 font-mono"
                      />
                      {url.trim() && <img src={url.trim()} alt="" className="w-10 h-10 rounded-lg object-cover border flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
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
                <p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-2">이미지 수집 실패 → "직접 입력" 클릭 후 URL 붙여넣기</p>
              )}
            </div>

            {/* 리뷰 (첫 번째만 AI에 사용) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400">
                  첫 번째 리뷰 (AI 문구 생성에 사용)
                  {product.reviews.length === 0 && <span className="text-amber-500 ml-1">— 직접 입력 필요</span>}
                </p>
                <button onClick={() => setUseManualReviews((v) => !v)}
                  className="text-xs text-indigo-500 border border-indigo-100 px-2 py-0.5 rounded-lg">
                  {useManualReviews ? '자동 사용' : '직접 입력'}
                </button>
              </div>
              {useManualReviews ? (
                <textarea
                  value={manualReviews[0]}
                  onChange={(e) => setManualReviews((prev) => [e.target.value, prev[1], prev[2]])}
                  placeholder="쿠팡 상품 페이지 리뷰 탭에서 가장 마음에 드는 후기 복사·붙여넣기"
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400 resize-none"
                />
              ) : product.reviews.length > 0 ? (
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-gray-700">{product.reviews[0].reviewer}</span>
                    <StarRating n={product.reviews[0].rating} />
                  </div>
                  <p className="text-xs text-gray-600">{product.reviews[0].content}</p>
                </div>
              ) : (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-2">리뷰 수집 실패 → "직접 입력" 클릭 후 쿠팡 리뷰 복사·붙여넣기</p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: 제휴 링크 ── */}
        {product && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
              <span className="w-6 h-6 bg-orange-500 text-white rounded-full text-xs flex items-center justify-center font-black">3</span>
              제휴 링크 입력
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              <a href="https://partners.coupang.com" target="_blank" rel="noopener noreferrer" className="text-orange-500 underline">partners.coupang.com</a>
              {' '}→ 해당 상품 링크생성 → 복사
            </p>
            <input
              value={affiliateUrl}
              onChange={(e) => setAffiliateUrl(e.target.value)}
              placeholder="https://link.coupang.com/a/..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 font-mono text-xs"
            />
            {affiliateUrl && <p className="text-xs text-emerald-600 mt-1.5">✓ 제휴 링크 입력됨</p>}
          </div>
        )}

        {/* ── Step 4: 플랫폼 선택 + AI 글 생성 ── */}
        {product && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-orange-500 text-white rounded-full text-xs flex items-center justify-center font-black">4</span>
              플랫폼 선택 + AI 글 생성
            </h2>

            <div className="flex flex-wrap gap-2 mb-4">
              {(Object.keys(PLATFORM_INFO) as Platform[]).map((p) => {
                const conn = snsConnections.find((c) => c.platform === p);
                const isSelected = selectedPlatforms.includes(p);
                const info = PLATFORM_INFO[p];
                return (
                  <button key={p}
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

            <button
              onClick={handleGenerate}
              disabled={generating || selectedPlatforms.length === 0}
              className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
              {generating ? '✨ AI 글 생성 중...' : '✨ AI 홍보 글 생성 (미리보기)'}
            </button>
            {generateError && (
              <p className="mt-2 text-xs text-red-500">⚠️ {generateError}</p>
            )}
            {selectedPlatforms.length === 0 && (
              <p className="mt-2 text-xs text-amber-500">위에서 플랫폼을 먼저 선택하세요</p>
            )}
          </div>
        )}

        {/* ── Step 5: 미리보기 + 편집 + 저장/발행 ── */}
        {Object.keys(previewTexts).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
              <span className="w-6 h-6 bg-orange-500 text-white rounded-full text-xs flex items-center justify-center font-black">5</span>
              미리보기 · 편집 · 발행
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              내용을 직접 수정할 수 있습니다. 구매링크·고지문구는 게시 후 댓글로 자동 추가됩니다.
            </p>

            <div className="space-y-4 mb-5">
              {selectedPlatforms.filter((p) => previewTexts[p]).map((platform) => (
                <div key={platform}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span>{PLATFORM_INFO[platform]?.icon}</span>
                    <span className="text-sm font-semibold text-gray-700">{PLATFORM_INFO[platform]?.label}</span>
                    <span className="ml-auto text-xs text-gray-400">{previewTexts[platform]?.length || 0}자</span>
                  </div>
                  <textarea
                    value={previewTexts[platform] || ''}
                    onChange={(e) => setPreviewTexts((prev) => ({ ...prev, [platform]: e.target.value }))}
                    rows={6}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 resize-y"
                  />
                </div>
              ))}
            </div>

            {!affiliateUrl.trim() && (
              <p className="text-xs text-amber-600 mb-3">⚠️ 제휴 링크를 입력해야 발행할 수 있습니다 (Step 3)</p>
            )}

            {postError && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3 text-xs text-red-600">
                ⚠️ {postError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-bold text-sm transition-colors">
                💾 임시저장
              </button>
              <button
                onClick={handlePost}
                disabled={posting || !affiliateUrl.trim()}
                className="flex-2 flex-grow-[2] bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-sm transition-colors">
                {posting ? '🚀 발행 중...' : '🚀 SNS 발행'}
              </button>
            </div>
          </div>
        )}

        {/* ── 발행 결과 ── */}
        {postResults && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-800 mb-3">발행 결과</h3>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3 text-xs text-blue-700">
              💬 구매링크와 쿠팡 파트너스 고지문구가 각 플랫폼 게시물의 댓글로 자동 추가됩니다.
            </div>
            <div className="space-y-3">
              {postResults.map((r) => (
                <div key={r.platform} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                  <span>{PLATFORM_INFO[r.platform]?.icon}</span>
                  <span className="text-sm font-semibold text-gray-700">{PLATFORM_INFO[r.platform]?.label}</span>
                  {r.success
                    ? <span className="ml-auto text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">✓ 발행 완료</span>
                    : <span className="ml-auto text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">{r.error || '실패'}</span>
                  }
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
                    <img src={item.image_urls[0]} alt=""
                      className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-gray-100"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gray-200 flex-shrink-0 flex items-center justify-center text-lg">🛒</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.product_name || '(상품명 없음)'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.platforms.map((p) => PLATFORM_INFO[p]?.icon || p).join(' ')}
                      {' · '}
                      {new Date(item.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {item.first_review && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">"{item.first_review.substring(0, 45)}..."</p>
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
