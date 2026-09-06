'use client';

import { useEffect, useState, useCallback } from 'react';

interface Listing {
  product_name: string;
  affiliate_url: string;
  current_price: number;
  discount_rate: number;
  image_url: string;
  network: string;
  rating: number | null;
  review_count: number | null;
}

interface Product {
  id: string;
  product_name: string;
  category: string | null;
  status: string;
  created_at: string;
  brand: string | null;
  generic_product_type: string | null;
  features: string[] | null;
  problem_solved: string | null;
  match: { match_confidence: string; affiliate_listings: Listing } | null;
  score: { opportunity_score: number; saturation_level: string; explanation: string } | null;
  script: { id: string; hook_text: string; full_script: string } | null;
  video_url: string | null;
}

const SATURATION_BADGE: Record<string, string> = {
  LOW: 'bg-emerald-100 text-emerald-700',
  RISING: 'bg-teal-100 text-teal-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-orange-100 text-orange-700',
  OVERUSED: 'bg-red-100 text-red-700',
};

const STATUS_BADGE: Record<string, string> = {
  DISCOVERED: 'bg-gray-100 text-gray-600',
  SCORED: 'bg-blue-100 text-blue-600',
  MATCHED: 'bg-emerald-100 text-emerald-700',
  READY: 'bg-teal-100 text-teal-700',
  IN_PRODUCTION: 'bg-purple-100 text-purple-700',
  PUBLISHED: 'bg-indigo-100 text-indigo-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function AffiliateProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [normalizing, setNormalizing] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [scriptingId, setScriptingId] = useState<string | null>(null);
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchProducts = useCallback(() => {
    return fetch('/api/affiliate-engine/products')
      .then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => { fetchProducts().finally(() => setLoading(false)); }, [fetchProducts]);

  const unnormalizedCount = products.filter(p => !p.brand).length;
  const unscoredCount = products.filter(p => p.brand && p.status === 'MATCHED' && !p.score).length;

  const handleNormalize = async () => {
    setNormalizing(true);
    const res = await fetch('/api/affiliate-engine/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 5 }),
    });
    const data = await res.json();
    setNormalizing(false);
    setToast(data.processed ? `${data.processed}건 정규화 완료` : '정규화할 상품 없음');
    setTimeout(() => setToast(null), 3000);
    fetchProducts();
  };

  const handleScore = async () => {
    setScoring(true);
    const res = await fetch('/api/affiliate-engine/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 5 }),
    });
    const data = await res.json();
    setScoring(false);
    setToast(data.processed ? `${data.processed}건 점수 계산 완료` : '점수 계산할 상품 없음');
    setTimeout(() => setToast(null), 3000);
    fetchProducts();
  };

  const handleGenerateScript = async (productId: string) => {
    setScriptingId(productId);
    const res = await fetch('/api/affiliate-engine/script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId }),
    });
    const data = await res.json();
    setScriptingId(null);
    setToast(data.ok ? '스크립트 생성 완료' : (data.error || '생성 실패'));
    setTimeout(() => setToast(null), 3000);
    fetchProducts();
  };

  const handleRender = async (scriptId: string, productId: string) => {
    setRenderingId(productId);
    const res = await fetch('/api/affiliate-engine/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script_id: scriptId }),
    });
    const data = await res.json();
    setRenderingId(null);
    setToast(data.ok ? '영상 렌더링 완료' : (data.error || '렌더링 실패'));
    setTimeout(() => setToast(null), 4000);
    fetchProducts();
  };

  const sortedProducts = [...products].sort((a, b) => (b.score?.opportunity_score ?? -1) - (a.score?.opportunity_score ?? -1));

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-xl shadow-lg text-white text-sm font-medium bg-gray-800">{toast}</div>
      )}
      <div className="flex items-center justify-between mb-1 gap-2">
        <h1 className="text-xl font-bold text-gray-900">📦 발굴된 상품</h1>
        <div className="flex gap-2">
          <button
            onClick={handleNormalize}
            disabled={normalizing || unnormalizedCount === 0}
            className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {normalizing ? '정규화중...' : `🧠 정규화 (${unnormalizedCount})`}
          </button>
          <button
            onClick={handleScore}
            disabled={scoring || unscoredCount === 0}
            className="px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {scoring ? '계산중...' : `🎯 점수 계산 (${unscoredCount})`}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        정규화된 상품 개념 목록. 기회 점수가 높은 순으로 정렬됩니다.
      </p>

      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">불러오는 중...</div>
      ) : products.length === 0 ? (
        <div className="text-center text-gray-400 py-12 text-sm">
          아직 발굴된 상품이 없습니다. <a href="/dashboard/affiliate-engine/discover" className="text-blue-500 underline">발굴 페이지</a>에서 시작하세요.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedProducts.map(p => {
            const listing = p.match?.affiliate_listings;
            return (
              <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex gap-3">
                {listing?.image_url ? (
                  <img src={listing.image_url} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-gray-100 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-gray-900 text-sm truncate">{p.product_name}</div>
                    {p.score && (
                      <span className="shrink-0 text-xs font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                        🎯 {p.score.opportunity_score}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {p.brand ? `${p.brand} · ` : ''}{p.generic_product_type || p.category || '카테고리 없음'}
                  </div>
                  {listing && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="font-bold text-gray-900">{Math.round(listing.current_price).toLocaleString('ko-KR')}원</span>
                      {listing.discount_rate > 0 && (
                        <span className="text-[11px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">-{Math.round(listing.discount_rate)}%</span>
                      )}
                    </div>
                  )}
                  {p.score?.explanation ? (
                    <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2">🎯 {p.score.explanation}</p>
                  ) : p.problem_solved && (
                    <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2">💡 {p.problem_solved}</p>
                  )}
                  {p.features && p.features.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {p.features.slice(0, 4).map((f, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{f}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                    {p.match && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{p.match.match_confidence}</span>
                    )}
                    {p.score && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SATURATION_BADGE[p.score.saturation_level] || 'bg-gray-100 text-gray-600'}`}>
                        포화도 {p.score.saturation_level}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {listing?.affiliate_url && (
                      <a href={listing.affiliate_url} target="_blank" rel="noopener noreferrer nofollow sponsored"
                        className="text-xs text-blue-500 font-semibold">제휴 링크 열기 →</a>
                    )}
                    {p.score && !p.script && (
                      <button
                        onClick={() => handleGenerateScript(p.id)}
                        disabled={scriptingId === p.id}
                        className="text-xs font-semibold text-teal-600 hover:text-teal-800 disabled:opacity-50"
                      >
                        {scriptingId === p.id ? '스크립트 생성중...' : '🎬 스크립트 생성'}
                      </button>
                    )}
                  </div>
                  {p.script && (
                    <div className="mt-2 p-2 bg-teal-50 rounded-lg">
                      <p className="text-[11px] font-semibold text-teal-700">🎬 &ldquo;{p.script.hook_text}&rdquo;</p>
                      <div className="flex items-center gap-3 mt-1">
                        <button
                          onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                          className="text-[10px] text-teal-600 underline"
                        >
                          {expandedId === p.id ? '스크립트 접기' : '전체 스크립트 보기'}
                        </button>
                        {!p.video_url && (
                          <button
                            onClick={() => handleRender(p.script!.id, p.id)}
                            disabled={renderingId === p.id}
                            className="text-[10px] font-semibold text-purple-600 hover:text-purple-800 disabled:opacity-50"
                          >
                            {renderingId === p.id ? '🎥 렌더링중... (1~2분)' : '🎥 영상 렌더링'}
                          </button>
                        )}
                      </div>
                      {expandedId === p.id && (
                        <p className="text-[11px] text-gray-600 mt-1.5 whitespace-pre-line">{p.script.full_script}</p>
                      )}
                    </div>
                  )}
                  {p.video_url && (
                    <video src={p.video_url} controls className="mt-2 rounded-xl w-40" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
