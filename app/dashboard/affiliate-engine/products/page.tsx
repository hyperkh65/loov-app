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
}

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
  const [toast, setToast] = useState<string | null>(null);

  const fetchProducts = useCallback(() => {
    return fetch('/api/affiliate-engine/products')
      .then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => { fetchProducts().finally(() => setLoading(false)); }, [fetchProducts]);

  const unnormalizedCount = products.filter(p => !p.brand).length;

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

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-xl shadow-lg text-white text-sm font-medium bg-gray-800">{toast}</div>
      )}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">📦 발굴된 상품</h1>
        <button
          onClick={handleNormalize}
          disabled={normalizing || unnormalizedCount === 0}
          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {normalizing ? '정규화중...' : `🧠 정규화 실행 (${unnormalizedCount}개 대기)`}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        정규화된 상품 개념 목록. Phase 6(스코어링) 전까지는 바이럴/기회 점수 없이 발견 순서로만 나열됩니다.
      </p>

      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">불러오는 중...</div>
      ) : products.length === 0 ? (
        <div className="text-center text-gray-400 py-12 text-sm">
          아직 발굴된 상품이 없습니다. <a href="/dashboard/affiliate-engine/discover" className="text-blue-500 underline">발굴 페이지</a>에서 시작하세요.
        </div>
      ) : (
        <div className="space-y-3">
          {products.map(p => {
            const listing = p.match?.affiliate_listings;
            return (
              <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex gap-3">
                {listing?.image_url ? (
                  <img src={listing.image_url} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-gray-100 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900 text-sm truncate">{p.product_name}</div>
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
                  {p.problem_solved && (
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
                  </div>
                  {listing?.affiliate_url && (
                    <a href={listing.affiliate_url} target="_blank" rel="noopener noreferrer nofollow sponsored"
                      className="inline-block mt-2 text-xs text-blue-500 font-semibold">제휴 링크 열기 →</a>
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
