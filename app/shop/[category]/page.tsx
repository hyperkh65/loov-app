'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/shop-cart';

interface Product {
  id: number; name: string; price: number; sale_price: number | null;
  thumbnail_url: string | null; is_new: boolean; is_best: boolean;
  shop_categories?: { name: string; slug: string };
}

const SORTS = [
  { value: 'sort_order', label: '추천순' },
  { value: 'newest',     label: '신상품순' },
  { value: 'price_asc',  label: '가격 낮은순' },
  { value: 'price_desc', label: '가격 높은순' },
];

function ProductCard({ p }: { p: Product }) {
  const addItem = useCart(s => s.addItem);
  const disc = p.sale_price ? Math.round((1 - p.sale_price / p.price) * 100) : 0;

  return (
    <div className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all border border-gray-100">
      <Link href={`/shop/product/${p.id}`} className="block">
        <div className="relative aspect-square bg-gray-50 overflow-hidden">
          {p.thumbnail_url
            ? <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            : <div className="w-full h-full flex items-center justify-center text-5xl text-gray-300">💡</div>
          }
          <div className="absolute top-2 left-2 flex gap-1">
            {p.is_new && <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">NEW</span>}
            {p.is_best && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">BEST</span>}
            {disc > 0 && <span className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">-{disc}%</span>}
          </div>
        </div>
        <div className="p-3">
          <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug">{p.name}</p>
          <div className="mt-2 flex items-center gap-2">
            {p.sale_price ? (
              <>
                <span className="font-bold text-gray-900">{p.sale_price.toLocaleString()}원</span>
                <span className="text-xs text-gray-400 line-through">{p.price.toLocaleString()}원</span>
              </>
            ) : (
              <span className="font-bold text-gray-900">{p.price.toLocaleString()}원</span>
            )}
          </div>
        </div>
      </Link>
      <div className="px-3 pb-3">
        <button onClick={() => addItem({ id: p.id, name: p.name, price: p.sale_price ?? p.price, thumbnail_url: p.thumbnail_url })}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors">
          장바구니 담기
        </button>
      </div>
    </div>
  );
}

export default function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = use(params);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('sort_order');
  const [offset, setOffset] = useState(0);
  const [catName, setCatName] = useState('');
  const LIMIT = 20;

  const load = useCallback(async (off: number) => {
    setLoading(true);
    const p = new URLSearchParams({ category, sort, limit: String(LIMIT), offset: String(off) });
    const d = await fetch(`/api/shop/products?${p}`).then(r => r.json());
    setProducts(prev => off === 0 ? (d.products ?? []) : [...prev, ...(d.products ?? [])]);
    setTotal(d.total ?? 0);
    if (off === 0 && d.products?.[0]?.shop_categories) setCatName(d.products[0].shop_categories.name);
    setLoading(false);
  }, [category, sort]);

  useEffect(() => { setOffset(0); load(0); }, [load]);

  // 카테고리 이름 별도 조회
  useEffect(() => {
    fetch('/api/shop/categories').then(r => r.json()).then(d => {
      const cat = (d.categories ?? []).find((c: { slug: string; name: string }) => c.slug === category);
      if (cat) setCatName(cat.name);
    });
  }, [category]);

  function loadMore() {
    const next = offset + LIMIT;
    setOffset(next);
    load(next);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-8">
      {/* 헤더 */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/shop" className="hover:text-blue-600">홈</Link>
        <span>›</span>
        <span className="text-gray-900 font-medium">{catName || category}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">{catName || category}</h1>
        <span className="text-sm text-gray-500">{total.toLocaleString()}개 상품</span>
      </div>

      {/* 정렬 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {SORTS.map(s => (
          <button key={s.value} onClick={() => setSort(s.value)}
            className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors font-medium ${sort === s.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* 상품 그리드 */}
      {loading && products.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({length: 8}).map((_,i) => <div key={i} className="aspect-[3/4] bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">📦</div>
          <p>상품이 없습니다</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {products.map(p => <ProductCard key={p.id} p={p} />)}
          </div>
          {products.length < total && (
            <div className="text-center mt-8">
              <button onClick={loadMore} disabled={loading}
                className="px-10 py-3 border-2 border-blue-600 text-blue-600 rounded-full font-semibold hover:bg-blue-600 hover:text-white transition-colors disabled:opacity-50">
                {loading ? '불러오는 중...' : `더보기 (${products.length}/${total})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
