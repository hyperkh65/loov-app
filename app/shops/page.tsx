'use client';

import { useState, useEffect, useCallback } from 'react';
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

function fmtPrice(n: number) { return n.toLocaleString('ko-KR'); }
function discount(orig: number, sale: number) { return Math.round((1 - sale / orig) * 100); }

// ── 상품 카드 ─────────────────────────────────────────────────────────────────
function ProductCard({ p, onAdd }: { p: Product; onAdd: (p: Product) => void }) {
  const sale = p.sale_price ?? p.price;
  const disc = p.sale_price ? discount(p.price, p.sale_price) : 0;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex flex-col bg-white border border-gray-100 hover:border-gray-300 hover:shadow-md transition-all duration-200 group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 이미지 */}
      <Link href={`/shops/${p.id}`} className="block">
        <div className="relative aspect-square bg-gray-50 overflow-hidden">
          {p.thumbnail_url ? (
            <Image src={p.thumbnail_url} alt={p.name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl text-gray-200 select-none">
              {p.shop_categories?.slug === 'lighting' ? '💡' : p.shop_categories?.slug === 'electronics' ? '💻' : '📦'}
            </div>
          )}
          {/* 뱃지 */}
          <div className="absolute top-0 left-0 flex flex-col gap-0">
            {disc >= 5 && <span className="bg-red-500 text-white text-[11px] font-bold px-1.5 py-0.5">{disc}%</span>}
            {p.is_new && <span className="bg-blue-500 text-white text-[11px] font-bold px-1.5 py-0.5">NEW</span>}
            {p.is_best && <span className="bg-orange-500 text-white text-[11px] font-bold px-1.5 py-0.5">BEST</span>}
          </div>
          {/* 호버 버튼 */}
          <div className={`absolute inset-x-0 bottom-0 flex transition-all duration-200 ${hovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onAdd(p); }}
              className="flex-1 py-2.5 bg-gray-900 text-white text-xs font-medium hover:bg-red-500 transition-colors"
            >
              장바구니 담기
            </button>
          </div>
        </div>
      </Link>

      {/* 텍스트 */}
      <div className="p-3 flex flex-col gap-1">
        <p className="text-[11px] text-gray-400">{p.shop_categories?.name}</p>
        <Link href={`/shops/${p.id}`}>
          <p className="text-sm text-gray-800 leading-snug line-clamp-2 hover:text-red-500 transition-colors">{p.name}</p>
        </Link>
        <div className="mt-1.5 flex items-end gap-1.5">
          {p.sale_price ? (
            <>
              <span className="text-base font-bold text-red-500">{fmtPrice(p.sale_price)}원</span>
              <span className="text-xs text-gray-400 line-through mb-0.5">{fmtPrice(p.price)}원</span>
            </>
          ) : (
            <span className="text-base font-bold text-gray-900">{fmtPrice(p.price)}원</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 가로 스크롤 상품 섹션 ───────────────────────────────────────────────────
function HScrollSection({ title, badge, products, onAdd }: {
  title: string; badge?: string; products: Product[]; onAdd: (p: Product) => void;
}) {
  if (products.length === 0) return null;
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3 px-4 md:px-0">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          {badge && <span className="text-[11px] bg-red-500 text-white px-1.5 py-0.5 font-bold">{badge}</span>}
          {title}
        </h2>
        <Link href="/shops" className="text-xs text-gray-400 hover:text-gray-700">더보기 →</Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 px-4 md:px-0 scrollbar-hide">
        {products.map(p => (
          <div key={p.id} className="shrink-0 w-44 md:w-52">
            <ProductCard p={p} onAdd={onAdd} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 메인 ────────────────────────────────────────────────────────────────────
export default function ShopsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [newItems, setNewItems] = useState<Product[]>([]);
  const [bestItems, setBestItems] = useState<Product[]>([]);
  const [activeSlug, setActiveSlug] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const { addItem, totalCount } = useCart();

  useEffect(() => {
    fetch('/api/shop/categories')
      .then(r => r.json())
      .then(d => {
        if (d.categories) setCategories([{ id: 0, name: '전체', slug: 'all' }, ...d.categories]);
      });

    // 특성별 상품 로드
    Promise.all([
      fetch('/api/shop/products?featured=1&limit=10').then(r => r.json()),
      fetch('/api/shop/products?new=1&limit=10').then(r => r.json()),
      fetch('/api/shop/products?best=1&limit=10').then(r => r.json()),
    ]).then(([f, n, b]) => {
      if (f.products) setFeatured(f.products);
      if (n.products) setNewItems(n.products);
      if (b.products) setBestItems(b.products);
    });
  }, []);

  const loadProducts = useCallback(async (slug: string, q: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '80' });
    if (slug !== 'all') params.set('category', slug);
    if (q) params.set('q', q);
    const res = await fetch(`/api/shop/products?${params}`);
    const d = await res.json();
    if (d.products) setProducts(d.products);
    setLoading(false);
  }, []);

  useEffect(() => { loadProducts(activeSlug, ''); }, [activeSlug]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadProducts(activeSlug, search);
  };

  const handleAdd = (p: Product) => {
    addItem({ id: p.id, name: p.name, price: p.sale_price ?? p.price, thumbnail_url: p.thumbnail_url });
    setToast(`"${p.name.slice(0, 20)}..." 담았습니다`);
    setTimeout(() => setToast(''), 2200);
  };

  const cartCount = totalCount();

  return (
    <div className="min-h-screen bg-[#f7f7f7] text-gray-800">

      {/* ── 상단 헤더 ───────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        {/* 로고 + 검색 + 아이콘 */}
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          {/* 로고 */}
          <Link href="/shops" className="shrink-0">
            <div className="text-xl font-black tracking-tight text-gray-900">LOOV<span className="text-red-500">.</span></div>
          </Link>

          {/* 검색 */}
          <form onSubmit={handleSearch} className="flex-1 max-w-xl">
            <div className="flex border border-gray-300 hover:border-gray-400 focus-within:border-red-400 transition rounded overflow-hidden">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="상품명을 검색하세요"
                className="flex-1 px-4 py-2.5 text-sm outline-none bg-white"
              />
              <button type="submit" className="bg-red-500 hover:bg-red-600 transition px-4 flex items-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </form>

          {/* 아이콘 그룹 */}
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            <Link href="/shops/cart" className="flex flex-col items-center gap-0.5 relative">
              <div className="relative">
                <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{cartCount}</span>
                )}
              </div>
              <span className="text-[10px] text-gray-500 hidden md:block">장바구니</span>
            </Link>
          </div>
        </div>

        {/* 카테고리 탭 */}
        <div className="border-t border-gray-100 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide">
              {categories.map(c => (
                <button
                  key={c.slug}
                  onClick={() => setActiveSlug(c.slug)}
                  className={`shrink-0 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeSlug === c.slug
                      ? 'border-red-500 text-red-500'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* ── 배너 ──────────────────────────────────────────────────── */}
        {activeSlug === 'all' && !search && (
          <div className="mb-8 rounded-xl overflow-hidden bg-gradient-to-r from-gray-900 to-gray-700 text-white flex items-center justify-between px-10 py-10 relative">
            <div>
              <p className="text-xs tracking-widest uppercase text-gray-400 mb-2">Special Offer</p>
              <h2 className="text-2xl md:text-3xl font-black leading-tight mb-3">
                여름 특가<br />
                <span className="text-red-400">최대 50% 할인</span>
              </h2>
              <p className="text-sm text-gray-300 mb-5">전자제품 · 생활용품 · 조명 전 품목</p>
              <button
                onClick={() => document.getElementById('all-products')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-6 py-2.5 bg-red-500 hover:bg-red-600 rounded text-sm font-semibold transition"
              >
                쇼핑하기
              </button>
            </div>
            <div className="hidden md:flex text-8xl select-none opacity-20 absolute right-10 top-1/2 -translate-y-1/2">💡</div>
          </div>
        )}

        {/* ── 특가 상품 ────────────────────────────────────────────── */}
        {activeSlug === 'all' && !search && (
          <>
            <HScrollSection title="특가 상품" badge="SALE" products={featured} onAdd={handleAdd} />
            <HScrollSection title="신상품" badge="NEW" products={newItems} onAdd={handleAdd} />
            <HScrollSection title="베스트" badge="BEST" products={bestItems} onAdd={handleAdd} />
          </>
        )}

        {/* ── 전체 상품 그리드 ───────────────────────────────────────── */}
        <section id="all-products">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              {activeSlug === 'all' ? '전체 상품' : categories.find(c => c.slug === activeSlug)?.name ?? ''}
              {products.length > 0 && (
                <span className="text-xs font-normal text-gray-400">({products.length}개)</span>
              )}
            </h2>
            {search && (
              <button onClick={() => { setSearch(''); loadProducts(activeSlug, ''); }}
                className="text-xs text-gray-400 hover:text-red-500">
                검색 초기화 ✕
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-square bg-gray-200" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-2/3" />
                    <div className="h-4 bg-gray-200 rounded w-full" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <p className="text-4xl mb-3">🔍</p>
              <p className="font-medium">상품이 없습니다</p>
              <p className="text-sm mt-1">
                {search ? `"${search}" 검색 결과가 없습니다` : '관리자 페이지에서 상품을 추가해주세요'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {products.map(p => <ProductCard key={p.id} p={p} onAdd={handleAdd} />)}
            </div>
          )}
        </section>
      </div>

      {/* ── 하단 정보 ─────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row gap-8 md:gap-16 text-sm text-gray-500">
            <div>
              <div className="font-black text-gray-900 text-lg mb-2">LOOV<span className="text-red-500">.</span></div>
              <p className="text-xs leading-relaxed">
                더 나은 일상을 위한 전자제품, 생활용품, 조명<br />
                고객만족센터: 평일 09:00 ~ 18:00
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-4 text-xs text-gray-400">
              {[['🚚', '무료배송', '3만원 이상'], ['🔄', '30일 반품', '단순 변심 포함'], ['🔒', '안전결제', '100% 보장'], ['💬', '고객센터', '빠른 응답']].map(([i, t, s]) => (
                <div key={t} className="flex items-center gap-2">
                  <span className="text-lg">{i}</span>
                  <div><p className="font-medium text-gray-700">{t}</p><p>{s}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* ── 토스트 ────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded shadow-xl whitespace-nowrap">
          🛒 {toast}
        </div>
      )}
    </div>
  );
}
