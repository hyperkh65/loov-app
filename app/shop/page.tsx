'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCart } from '@/lib/shop-cart';

interface Product {
  id: number; name: string; price: number; sale_price: number | null;
  thumbnail_url: string | null; is_new: boolean; is_best: boolean; is_featured: boolean;
  shop_categories?: { name: string; slug: string };
}
interface Category { id: number; name: string; slug: string; parent_id: number | null; image_url: string | null; }

const BANNERS = [
  { bg: 'from-blue-600 to-blue-800', title: 'LED 조명 특가전', sub: '최대 50% 할인', cta: '쇼핑하기', href: '/shop' },
  { bg: 'from-indigo-600 to-purple-700', title: '신상품 출시', sub: '2026 신제품 라인업', cta: '보러가기', href: '/shop?new=1' },
  { bg: 'from-cyan-600 to-teal-700', title: '베스트셀러', sub: '누적 판매 1위 상품', cta: '확인하기', href: '/shop?best=1' },
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
          {p.shop_categories && <p className="text-[10px] text-blue-500 mb-0.5">{p.shop_categories.name}</p>}
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

function ShopContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const showNew = searchParams.get('new') === '1';
  const showBest = searchParams.get('best') === '1';

  const [bannerIdx, setBannerIdx] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [newProducts, setNewProducts] = useState<Product[]>([]);
  const [bestProducts, setBestProducts] = useState<Product[]>([]);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // 배너 자동 슬라이드
  useEffect(() => {
    const t = setInterval(() => setBannerIdx(i => (i + 1) % BANNERS.length), 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch('/api/shop/categories').then(r => r.json()).then(d => setCategories(d.categories ?? []));
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    if (q || showNew || showBest) {
      const params = new URLSearchParams({ limit: '40' });
      if (q) params.set('q', q);
      if (showNew) params.set('new', '1');
      if (showBest) params.set('best', '1');
      const d = await fetch(`/api/shop/products?${params}`).then(r => r.json());
      setSearchResults(d.products ?? []);
    } else {
      const [fRes, nRes, bRes] = await Promise.all([
        fetch('/api/shop/products?featured=1&limit=8').then(r => r.json()),
        fetch('/api/shop/products?new=1&limit=8').then(r => r.json()),
        fetch('/api/shop/products?best=1&limit=8').then(r => r.json()),
      ]);
      setFeatured(fRes.products ?? []);
      setNewProducts(nRes.products ?? []);
      setBestProducts(bRes.products ?? []);
    }
    setLoading(false);
  }, [q, showNew, showBest]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const rootCats = categories.filter(c => !c.parent_id);

  if (q || showNew || showBest) {
    const title = q ? `"${q}" 검색 결과` : showNew ? '신상품' : '베스트셀러';
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 pb-20 md:pb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">{title} ({searchResults.length}개)</h2>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({length: 8}).map((_,i) => <div key={i} className="aspect-square bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">🔍</div>
            <p>검색 결과가 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {searchResults.map(p => <ProductCard key={p.id} p={p} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-0">
      {/* 배너 슬라이더 */}
      <section className="relative overflow-hidden">
        {BANNERS.map((b, i) => (
          <div key={i} className={`absolute inset-0 transition-opacity duration-700 ${i === bannerIdx ? 'opacity-100' : 'opacity-0'}`}>
            <div className={`bg-gradient-to-r ${b.bg} h-64 md:h-80 flex items-center justify-center`}>
              <div className="text-center text-white">
                <p className="text-sm mb-2 opacity-80">{b.sub}</p>
                <h1 className="text-3xl md:text-5xl font-black mb-6">{b.title}</h1>
                <Link href={b.href} className="inline-block bg-white text-gray-900 font-bold px-8 py-3 rounded-full hover:bg-gray-100 transition-colors">
                  {b.cta}
                </Link>
              </div>
            </div>
          </div>
        ))}
        <div className="relative h-64 md:h-80" />
        {/* 도트 인디케이터 */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {BANNERS.map((_, i) => (
            <button key={i} onClick={() => setBannerIdx(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === bannerIdx ? 'bg-white w-6' : 'bg-white/50'}`} />
          ))}
        </div>
      </section>

      {/* 카테고리 빠른 메뉴 */}
      {rootCats.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
            {rootCats.slice(0, 8).map(cat => (
              <Link key={cat.id} href={`/shop/${cat.slug}`}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-gray-50 hover:bg-blue-50 hover:text-blue-600 transition-colors group">
                <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  {cat.image_url ? <img src={cat.image_url} alt={cat.name} className="w-8 h-8 object-contain" /> : '💡'}
                </div>
                <span className="text-xs font-medium text-center leading-tight">{cat.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({length: 8}).map((_,i) => <div key={i} className="aspect-[3/4] bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        </div>
      ) : (
        <>
          {/* 추천 상품 */}
          {featured.length > 0 && (
            <section className="max-w-7xl mx-auto px-4 mb-12">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-black text-gray-900">✨ 추천 상품</h2>
                <Link href="/shop?featured=1" className="text-sm text-blue-600 hover:underline">더보기</Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {featured.map(p => <ProductCard key={p.id} p={p} />)}
              </div>
            </section>
          )}

          {/* 신상품 */}
          {newProducts.length > 0 && (
            <section className="max-w-7xl mx-auto px-4 mb-12">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-black text-gray-900">🆕 신상품</h2>
                <Link href="/shop?new=1" className="text-sm text-blue-600 hover:underline">더보기</Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {newProducts.map(p => <ProductCard key={p.id} p={p} />)}
              </div>
            </section>
          )}

          {/* 베스트 */}
          {bestProducts.length > 0 && (
            <section className="max-w-7xl mx-auto px-4 mb-12">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-black text-gray-900">🏆 베스트셀러</h2>
                <Link href="/shop?best=1" className="text-sm text-blue-600 hover:underline">더보기</Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {bestProducts.map(p => <ProductCard key={p.id} p={p} />)}
              </div>
            </section>
          )}

          {/* 상품이 없을 때 */}
          {featured.length === 0 && newProducts.length === 0 && bestProducts.length === 0 && (
            <div className="max-w-7xl mx-auto px-4 py-20 text-center text-gray-400">
              <div className="text-6xl mb-4">🛍️</div>
              <p className="text-lg font-medium mb-2">아직 상품이 없습니다</p>
              <p className="text-sm">관리자 페이지에서 상품을 등록해보세요</p>
              <Link href="/dashboard/shop" className="inline-block mt-6 px-6 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors">
                상품 관리하기
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400">불러오는 중...</div>}>
      <ShopContent />
    </Suspense>
  );
}
