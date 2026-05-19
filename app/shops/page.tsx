'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/shop-cart';

interface Category { id: number; name: string; slug: string; icon?: string; }
interface Product {
  id: number; name: string; price: number; sale_price: number | null;
  thumbnail_url: string | null; is_featured: boolean; is_new: boolean; is_best: boolean;
  description: string | null;
  shop_categories: { id: number; name: string; slug: string } | null;
}

function fmtPrice(n: number) { return n.toLocaleString('ko-KR') + '원'; }

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${color}`}>{label}</span>;
}

function ProductCard({ p, onAdd }: { p: Product; onAdd: (p: Product) => void }) {
  const [hover, setHover] = useState(false);
  const discount = p.sale_price ? Math.round((1 - p.sale_price / p.price) * 100) : 0;
  const displayPrice = p.sale_price ?? p.price;

  return (
    <Link href={`/shops/${p.id}`}>
      <div
        className="group bg-white rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 cursor-pointer"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* 이미지 */}
        <div className="relative aspect-square bg-gray-50 overflow-hidden">
          {p.thumbnail_url ? (
            <Image src={p.thumbnail_url} alt={p.name} fill className="object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl text-gray-200 select-none">
              {p.shop_categories?.slug === 'lighting' ? '💡' : p.shop_categories?.slug === 'electronics' ? '💻' : '📦'}
            </div>
          )}
          {/* 뱃지 */}
          <div className="absolute top-3 left-3 flex flex-col gap-1">
            {p.is_new && <Badge label="NEW" color="bg-blue-500 text-white" />}
            {p.is_best && <Badge label="BEST" color="bg-orange-500 text-white" />}
            {discount >= 10 && <Badge label={`-${discount}%`} color="bg-red-500 text-white" />}
          </div>
          {/* 빠른 추가 버튼 */}
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onAdd(p); }}
            className={`absolute bottom-3 right-3 w-9 h-9 rounded-full bg-black text-white flex items-center justify-center text-lg transition-all duration-200 ${hover ? 'opacity-100 scale-100' : 'opacity-0 scale-75'} hover:bg-blue-600`}
          >
            +
          </button>
        </div>

        {/* 정보 */}
        <div className="p-4">
          <p className="text-xs text-gray-400 mb-1">{p.shop_categories?.name ?? ''}</p>
          <h3 className="text-sm font-semibold text-gray-900 truncate mb-2">{p.name}</h3>
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900">{fmtPrice(displayPrice)}</span>
            {p.sale_price && (
              <span className="text-xs text-gray-400 line-through">{fmtPrice(p.price)}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function ShopsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [activeSlug, setActiveSlug] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const heroRef = useRef<HTMLDivElement>(null);
  const { addItem, totalCount } = useCart();

  useEffect(() => {
    fetch('/api/shop/categories')
      .then(r => r.json())
      .then(d => {
        if (d.categories) setCategories([{ id: 0, name: '전체', slug: 'all' }, ...d.categories]);
      });
  }, []);

  const load = useCallback(async (slug: string, q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '60' });
    if (slug !== 'all') params.set('category', slug);
    if (q) params.set('q', q);
    const [prodRes, featRes] = await Promise.all([
      fetch(`/api/shop/products?${params}`),
      featured.length === 0 ? fetch('/api/shop/products?featured=1&limit=4') : Promise.resolve(null),
    ]);
    const prodData = await prodRes.json();
    if (prodData.products) setProducts(prodData.products);
    if (featRes) {
      const featData = await featRes.json();
      if (featData.products) setFeatured(featData.products);
    }
    setLoading(false);
  }, [featured.length]);

  useEffect(() => { load(activeSlug, search); }, [activeSlug]);

  const handleAdd = (p: Product) => {
    addItem({ id: p.id, name: p.name, price: p.sale_price ?? p.price, thumbnail_url: p.thumbnail_url });
    setToast(`"${p.name}" 장바구니에 추가됨`);
    setTimeout(() => setToast(''), 2500);
  };

  const scrollToProducts = () => {
    const el = document.getElementById('products-section');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ── 상단 네비게이션 ─────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/shops" className="text-white font-bold text-xl tracking-tight">LOOV</Link>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-1 bg-white/10 rounded-full px-3 py-1.5">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') load(activeSlug, search); }}
                placeholder="상품 검색..."
                className="bg-transparent text-white text-sm w-40 outline-none placeholder-gray-400"
              />
            </div>
            <Link href="/shops/cart" className="relative p-2">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
              {totalCount() > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">{totalCount()}</span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* ── 히어로 ───────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative bg-[#050505] min-h-screen flex flex-col items-center justify-center text-white overflow-hidden pt-14">
        {/* 배경 글로우 */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-blue-700/15 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[300px] bg-violet-700/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          <p className="text-xs tracking-[0.4em] text-blue-400 uppercase mb-8 font-medium">New Collection 2025</p>
          <h1 className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tight leading-none mb-6">
            당신의 공간을<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">완성하다</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-xl mx-auto leading-relaxed">
            전자제품, 생활용품, 조명 — 더 나은 일상을 위한 엄선된 컬렉션
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={scrollToProducts}
              className="px-8 py-3.5 bg-white text-black rounded-full font-semibold text-sm hover:bg-gray-100 transition-all duration-200 hover:scale-105"
            >
              지금 쇼핑하기
            </button>
            <Link href="/shops/cart"
              className="px-8 py-3.5 border border-white/20 rounded-full text-sm text-white hover:border-white/50 transition-all duration-200"
            >
              장바구니 보기
            </Link>
          </div>
        </div>

        {/* 스크롤 인디케이터 */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce opacity-40">
          <span className="text-xs tracking-widest text-gray-400">SCROLL</span>
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </section>

      {/* ── 추천 상품 (Feature Strip) ─────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="bg-[#111] py-20 px-5">
          <div className="max-w-7xl mx-auto">
            <p className="text-xs tracking-[0.3em] text-blue-400 uppercase mb-3 font-medium">Featured</p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-12">이 달의 추천 상품</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {featured.map(p => (
                <Link key={p.id} href={`/shops/${p.id}`}>
                  <div className="group bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/30 transition-all duration-300 hover:bg-white/8">
                    <div className="aspect-square bg-gray-900 relative overflow-hidden">
                      {p.thumbnail_url ? (
                        <Image src={p.thumbnail_url} alt={p.name} fill className="object-cover opacity-90 group-hover:opacity-100 transition-all duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-6xl">💡</div>
                      )}
                    </div>
                    <div className="p-5">
                      <p className="text-xs text-gray-500 mb-1">{p.shop_categories?.name}</p>
                      <h3 className="text-white font-semibold mb-3 text-sm leading-snug">{p.name}</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-blue-400 font-bold">{fmtPrice(p.sale_price ?? p.price)}</span>
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); handleAdd(p); }}
                          className="text-xs border border-white/20 text-white px-3 py-1 rounded-full hover:border-blue-400 hover:text-blue-400 transition"
                        >
                          담기
                        </button>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 전체 상품 ─────────────────────────────────────────────────── */}
      <section id="products-section" className="bg-[#f5f5f7] py-20 px-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
            <div>
              <p className="text-xs tracking-[0.3em] text-gray-500 uppercase mb-2 font-medium">All Products</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">전체 상품</h2>
            </div>

            {/* 카테고리 필터 */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map(c => (
                <button
                  key={c.slug}
                  onClick={() => { setActiveSlug(c.slug); }}
                  className={`shrink-0 px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    activeSlug === c.slug
                      ? 'bg-black text-white shadow-md'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* 상품 그리드 */}
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse">
                  <div className="aspect-square bg-gray-200" />
                  <div className="p-4 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-gray-400">
              <p className="text-5xl mb-4">📦</p>
              <p className="text-lg">상품이 없습니다</p>
              <p className="text-sm mt-2">관리자 페이지에서 상품을 추가해주세요</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map(p => <ProductCard key={p.id} p={p} onAdd={handleAdd} />)}
            </div>
          )}
        </div>
      </section>

      {/* ── 하단 배너 ──────────────────────────────────────────────── */}
      <section className="bg-black text-white py-20 px-5 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">더 나은 일상.<br />지금 시작하세요.</h2>
          <p className="text-gray-400 mb-8">무료배송 · 30일 무료반품 · 안전결제</p>
          <button onClick={scrollToProducts}
            className="px-8 py-3.5 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition">
            쇼핑 시작하기
          </button>
        </div>
      </section>

      {/* ── 토스트 ────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-full shadow-xl animate-fade-in">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
