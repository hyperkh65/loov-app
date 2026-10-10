'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/shop-cart';

/* ─── 타입 ──────────────────────────────────────────────────────────────── */
interface Banner { id: number; title: string; subtitle: string; image_url: string | null; link_url: string | null; bg_color: string; text_color: string; badge_text: string | null; cta_text: string | null; sort_order: number; is_active: boolean; }
interface Category { id: number; name: string; slug: string; icon?: string; }
interface Product { id: number; name: string; price: number; sale_price: number | null; thumbnail_url: string | null; is_featured: boolean; is_new: boolean; is_best: boolean; description: string | null; shop_categories: { id: number; name: string; slug: string } | null; }

const ICONS: Record<string, string> = { all: '🛒', electronics: '💻', living: '🏠', lighting: '💡' };
const SORT_OPTIONS = [
  { value: 'sort_order', label: '추천순' },
  { value: 'newest', label: '최신순' },
  { value: 'price_asc', label: '낮은 가격순' },
  { value: 'price_desc', label: '높은 가격순' },
];

function fmt(n: number) { return n.toLocaleString('ko-KR'); }
function disc(orig: number, sale: number) { return Math.round((1 - sale / orig) * 100); }
function Stars({ n = 0 }: { n?: number }) {
  return <div className="flex gap-0.5">{[1,2,3,4,5].map(i => <span key={i} className={`text-[11px] ${i <= n ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>)}</div>;
}

/* ─── 퀵뷰 모달 ──────────────────────────────────────────────────────────── */
function QuickView({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: () => void }) {
  const sale = product.sale_price ?? product.price;
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col md:flex-row animate-[fadeInScale_0.2s_ease]" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-gray-700">✕</button>
        {/* 이미지 */}
        <div className="w-full md:w-64 aspect-square bg-gray-50 relative shrink-0">
          {product.thumbnail_url ? (
            <Image src={product.thumbnail_url} alt={product.name} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-6xl text-gray-200">📦</div>
          )}
        </div>
        {/* 정보 */}
        <div className="flex-1 p-6 flex flex-col justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-1">{product.shop_categories?.name}</p>
            <h3 className="text-lg font-bold text-gray-900 mb-2 leading-snug">{product.name}</h3>
            {product.description && <p className="text-sm text-gray-500 mb-4 line-clamp-3">{product.description}</p>}
            <Stars n={4} />
            <div className="flex items-end gap-2 mt-3">
              <span className="text-2xl font-black text-red-500">{fmt(sale)}원</span>
              {product.sale_price && <span className="text-sm text-gray-400 line-through">{fmt(product.price)}원</span>}
              {product.sale_price && <span className="text-xs bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded">{disc(product.price, product.sale_price)}% 할인</span>}
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button onClick={onAdd} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition active:scale-95">장바구니 담기</button>
            <Link href={`/shops/${product.id}`} onClick={onClose}
              className="px-5 py-3 border-2 border-gray-900 text-gray-900 font-bold rounded-xl hover:bg-gray-900 hover:text-white transition text-sm flex items-center">
              상세보기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 상품 카드 ──────────────────────────────────────────────────────────── */
function ProductCard({ p, wished, onToggleWish, onAdd, onQuickView }: {
  p: Product;
  wished: boolean;
  onToggleWish: () => void;
  onAdd: () => void;
  onQuickView: () => void;
}) {
  const sale = p.sale_price ?? p.price;
  const d = p.sale_price ? disc(p.price, p.sale_price) : 0;

  return (
    <div className="group bg-white border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300 rounded-xl overflow-hidden flex flex-col">
      {/* 이미지 */}
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        <Link href={`/shops/${p.id}`}>
          {p.thumbnail_url ? (
            <Image src={p.thumbnail_url} alt={p.name} fill className="object-cover transition-transform duration-500 group-hover:scale-108" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl text-gray-200 select-none">
              {ICONS[p.shop_categories?.slug ?? ''] ?? '📦'}
            </div>
          )}
        </Link>

        {/* 뱃지 */}
        <div className="absolute top-2 left-2 flex flex-col gap-0.5">
          {d >= 5 && <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded">{d}%</span>}
          {p.is_new && <span className="bg-blue-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded">NEW</span>}
          {p.is_best && <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded">BEST</span>}
        </div>

        {/* 위시리스트 */}
        <button onClick={onToggleWish}
          className={`absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center transition-all duration-200 hover:scale-110 ${wished ? 'text-red-500' : 'text-gray-300 hover:text-red-400'}`}>
          {wished ? '♥' : '♡'}
        </button>

        {/* 호버 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end gap-1 p-2">
          <button onClick={onAdd}
            className="flex-1 py-2 bg-white text-gray-900 text-xs font-bold rounded-lg hover:bg-red-500 hover:text-white transition-colors shadow">
            🛒 담기
          </button>
          <button onClick={onQuickView}
            className="px-3 py-2 bg-white text-gray-900 text-xs font-bold rounded-lg hover:bg-gray-900 hover:text-white transition-colors shadow">
            👁
          </button>
        </div>
      </div>

      {/* 텍스트 */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{p.shop_categories?.name}</p>
        <Link href={`/shops/${p.id}`}>
          <h3 className="text-sm text-gray-800 leading-snug line-clamp-2 hover:text-red-500 transition-colors font-medium">{p.name}</h3>
        </Link>
        <Stars n={4} />
        <div className="flex items-end gap-1.5 mt-auto pt-1">
          <span className={`text-sm font-black ${p.sale_price ? 'text-red-500' : 'text-gray-900'}`}>{fmt(sale)}원</span>
          {p.sale_price && <span className="text-[11px] text-gray-400 line-through">{fmt(p.price)}원</span>}
        </div>
      </div>
    </div>
  );
}

/* ─── 히어로 슬라이더 ─────────────────────────────────────────────────────── */
const DEFAULT_BANNERS: Banner[] = [
  { id: 0, title: '여름 특가 세일', subtitle: '전 품목 최대 50% 할인', image_url: null, link_url: null, bg_color: 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)', text_color: '#ffffff', badge_text: '🔥 LIMITED', cta_text: '지금 쇼핑하기', sort_order: 0, is_active: true },
  { id: 0, title: '신상 조명 컬렉션', subtitle: '공간을 바꾸는 빛의 예술', image_url: null, link_url: null, bg_color: 'linear-gradient(135deg,#2d1b69,#11998e,#38ef7d)', text_color: '#ffffff', badge_text: '✨ NEW', cta_text: '컬렉션 보기', sort_order: 1, is_active: true },
  { id: 0, title: '스마트 생활가전', subtitle: '더 스마트한 일상을 위한 선택', image_url: null, link_url: null, bg_color: 'linear-gradient(135deg,#c94b4b,#4b134f)', text_color: '#ffffff', badge_text: '💻 TECH', cta_text: '지금 확인', sort_order: 2, is_active: true },
];

function HeroBanner({ banners }: { banners: Banner[] }) {
  const list = banners.length > 0 ? banners : DEFAULT_BANNERS;
  const [cur, setCur] = useState(0);
  const [fade, setFade] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback((idx: number) => {
    setFade(false);
    setTimeout(() => { setCur(idx); setFade(true); }, 200);
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => go((cur + 1) % list.length), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [cur, list.length, go]);

  const b = list[cur];
  const scrollToProducts = () => document.getElementById('all-products')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="relative h-80 md:h-[480px] overflow-hidden">
      {/* 배경 레이어 */}
      <div className={`absolute inset-0 transition-opacity duration-500 ${fade ? 'opacity-100' : 'opacity-0'}`}>
        {b.image_url ? (
          <>
            <Image src={b.image_url} alt={b.title} fill className="object-cover scale-105 transition-transform duration-[8000ms] hover:scale-100" priority />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
          </>
        ) : (
          <div className="absolute inset-0" style={{ background: b.bg_color }} />
        )}
      </div>

      {/* 콘텐츠 */}
      <div className={`relative z-10 h-full flex flex-col items-center justify-center text-center px-6 transition-all duration-500 ${fade ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        style={{ color: b.image_url ? '#ffffff' : b.text_color }}>
        {b.badge_text && (
          <span className="text-xs font-black bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full mb-5 tracking-widest border border-white/30">
            {b.badge_text}
          </span>
        )}
        <h2 className="text-4xl md:text-6xl font-black leading-tight mb-3 drop-shadow-2xl">{b.title}</h2>
        <p className="text-base md:text-xl opacity-90 mb-8 font-medium drop-shadow">{b.subtitle}</p>
        <button onClick={b.link_url ? undefined : scrollToProducts}
          className="px-8 py-3.5 bg-white text-gray-900 hover:bg-gray-100 rounded-full text-sm font-black transition hover:scale-105 active:scale-95 shadow-xl">
          {b.cta_text ?? '쇼핑하기'} →
        </button>
      </div>

      {/* 이전/다음 */}
      <button onClick={() => go((cur - 1 + list.length) % list.length)}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-sm text-white flex items-center justify-center text-xl transition shadow-lg">‹</button>
      <button onClick={() => go((cur + 1) % list.length)}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-sm text-white flex items-center justify-center text-xl transition shadow-lg">›</button>

      {/* 도트 */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
        {list.map((_, i) => (
          <button key={i} onClick={() => go(i)}
            className={`rounded-full transition-all duration-300 ${i === cur ? 'w-7 h-2.5 bg-white' : 'w-2.5 h-2.5 bg-white/40 hover:bg-white/70'}`} />
        ))}
      </div>

      {/* 슬라이드 인디케이터 (우하단) */}
      <div className="absolute bottom-5 right-5 text-white/60 text-xs font-medium tabular-nums">
        {cur + 1} / {list.length}
      </div>
    </div>
  );
}

/* ─── 가로 스크롤 섹션 ────────────────────────────────────────────────────── */
function HSection({ title, badge, color, products, wished, onToggleWish, onAdd, onQuickView, href }: {
  title: string; badge: string; color: string; products: Product[];
  wished: Set<number>; onToggleWish: (id: number) => void;
  onAdd: (p: Product) => void; onQuickView: (p: Product) => void;
  href?: string;
}) {
  if (products.length === 0) return null;
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
          <span className={`text-[11px] font-black px-2 py-1 rounded ${color}`}>{badge}</span>
          {title}
        </h2>
        {href && <Link href={href} className="text-xs text-gray-400 hover:text-red-500 transition font-medium">더보기 →</Link>}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4">
        {products.map(p => (
          <div key={p.id} className="shrink-0 w-48 md:w-56">
            <ProductCard p={p} wished={wished.has(p.id)} onToggleWish={() => onToggleWish(p.id)} onAdd={() => onAdd(p)} onQuickView={() => onQuickView(p)} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── 메인 페이지 ─────────────────────────────────────────────────────────── */
export default function ShopsPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [newItems, setNewItems] = useState<Product[]>([]);
  const [bestItems, setBestItems] = useState<Product[]>([]);
  const [activeSlug, setActiveSlug] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('sort_order');
  const [loading, setLoading] = useState(true);
  const [quickView, setQuickView] = useState<Product | null>(null);
  const [wished, setWished] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: 'cart' | 'wish' } | null>(null);
  const { addItem, totalCount } = useCart();

  /* 위시리스트 로드 */
  useEffect(() => {
    try { const w = JSON.parse(localStorage.getItem('loov_wishlist') ?? '[]'); setWished(new Set(w)); } catch { /* ok */ }
  }, []);

  /* 초기 데이터 */
  useEffect(() => {
    fetch('/api/shop/banners').then(r => r.json()).then(d => { if (d.banners) setBanners(d.banners.filter((b: Banner) => b.is_active)); });
    fetch('/api/shop/categories').then(r => r.json()).then(d => {
      if (d.categories) setCategories([{ id: 0, name: '전체', slug: 'all', icon: '🛒' }, ...d.categories]);
    });
    Promise.all([
      fetch('/api/shop/products?featured=1&limit=12').then(r => r.json()),
      fetch('/api/shop/products?new=1&limit=12').then(r => r.json()),
      fetch('/api/shop/products?best=1&limit=12').then(r => r.json()),
    ]).then(([f, n, b]) => {
      if (f.products) setFeatured(f.products);
      if (n.products) setNewItems(n.products);
      if (b.products) setBestItems(b.products);
    });
  }, []);

  /* 상품 로드 */
  const loadProducts = useCallback(async (slug: string, q: string, s: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100', sort: s });
    if (slug !== 'all') params.set('category', slug);
    if (q) params.set('q', q);
    const res = await fetch(`/api/shop/products?${params}`);
    const d = await res.json();
    if (d.products) setProducts(d.products);
    setLoading(false);
  }, []);

  useEffect(() => { loadProducts(activeSlug, '', sort); }, [activeSlug, sort]);

  /* 위시리스트 토글 */
  const toggleWish = (id: number) => {
    setWished(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      localStorage.setItem('loov_wishlist', JSON.stringify([...next]));
      return next;
    });
    setToast({ msg: wished.has(id) ? '위시리스트에서 제거됨' : '위시리스트에 추가됨', type: 'wish' });
    setTimeout(() => setToast(null), 2000);
  };

  /* 장바구니 추가 */
  const handleAdd = (p: Product) => {
    addItem({ id: p.id, name: p.name, price: p.sale_price ?? p.price, thumbnail_url: p.thumbnail_url });
    setToast({ msg: `"${p.name.slice(0, 18)}…" 담았습니다`, type: 'cart' });
    setTimeout(() => setToast(null), 2200);
  };

  const cartCount = totalCount();

  return (
    <div className="min-h-screen bg-[#f5f5f5]">

      {/* ── 헤더 ─────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4">
          {/* 상단 바 */}
          <div className="flex items-center gap-4 py-3">
            <Link href="/shops" className="shrink-0 flex items-center gap-1">
              <span className="text-2xl font-black tracking-tighter text-gray-900">LOOV</span>
              <span className="text-2xl font-black text-red-500">.</span>
            </Link>

            {/* 검색 */}
            <form onSubmit={e => { e.preventDefault(); loadProducts(activeSlug, search, sort); }} className="flex-1 max-w-2xl">
              <div className="flex items-center border-2 border-gray-200 focus-within:border-red-400 rounded-xl overflow-hidden transition-colors">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="찾고 싶은 상품을 검색해보세요"
                  className="flex-1 px-4 py-2.5 text-sm outline-none bg-white" />
                {search && <button type="button" onClick={() => { setSearch(''); loadProducts(activeSlug, '', sort); }} className="px-2 text-gray-300 hover:text-gray-600">✕</button>}
                <button type="submit" className="bg-red-500 hover:bg-red-600 transition px-5 py-2.5 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>
              </div>
            </form>

            {/* 아이콘 */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setToast({ msg: `위시리스트 ${wished.size}개`, type: 'wish' })}
                className="hidden md:flex flex-col items-center gap-0.5 p-2 hover:text-red-500 transition-colors">
                <span className="text-lg relative">♥<span className="absolute -top-1 -right-2 text-[10px] bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">{wished.size}</span></span>
                <span className="text-[10px] text-gray-500">위시리스트</span>
              </button>
              <Link href="/shops/cart" className="flex flex-col items-center gap-0.5 p-2 hover:text-red-500 transition-colors">
                <span className="text-xl relative">
                  🛒{cartCount > 0 && <span className="absolute -top-1 -right-2 text-[10px] bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">{cartCount}</span>}
                </span>
                <span className="text-[10px] text-gray-500 hidden md:block">장바구니</span>
              </Link>
              <Link href="/dashboard/shop"
                className="hidden md:flex flex-col items-center gap-0.5 p-2 hover:text-gray-900 transition-colors text-gray-400"
                title="관리자 페이지">
                <span className="text-lg">⚙️</span>
                <span className="text-[10px]">관리자</span>
              </Link>
            </div>
          </div>

          {/* 카테고리 탭 */}
          <div className="flex items-center overflow-x-auto scrollbar-hide -mx-4 px-4 border-t border-gray-100">
            {categories.map(c => (
              <button key={c.slug} onClick={() => setActiveSlug(c.slug)}
                className={`shrink-0 flex items-center gap-1.5 px-5 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${activeSlug === c.slug ? 'border-red-500 text-red-500' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
                <span>{ICONS[c.slug] ?? '📂'}</span> {c.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── 히어로 슬라이더 ──────────────────────────────────────────── */}
      <HeroBanner banners={banners} />

      {/* ── 카테고리 아이콘 그리드 ───────────────────────────────────── */}
      {categories.length > 1 && (
        <div className="bg-white border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 py-5 flex gap-4 overflow-x-auto scrollbar-hide">
            {categories.slice(1).map(c => (
              <button key={c.slug} onClick={() => setActiveSlug(c.slug)}
                className={`shrink-0 flex flex-col items-center gap-2 group transition-all ${activeSlug === c.slug ? 'scale-105' : ''}`}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all shadow-sm group-hover:shadow-md ${activeSlug === c.slug ? 'bg-red-500 text-white shadow-red-200' : 'bg-gray-50 group-hover:bg-red-50'}`}>
                  {ICONS[c.slug] ?? '📂'}
                </div>
                <span className={`text-xs font-semibold transition-colors ${activeSlug === c.slug ? 'text-red-500' : 'text-gray-600 group-hover:text-red-400'}`}>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* ── 특가/신상/베스트 가로 섹션 ───────────────────────────── */}
        {activeSlug === 'all' && !search && <>
          <HSection title="특가 상품" badge="🔥 SALE" color="bg-red-500 text-white" products={featured} wished={wished} onToggleWish={toggleWish} onAdd={handleAdd} onQuickView={setQuickView} />
          <HSection title="신상품" badge="✨ NEW" color="bg-blue-500 text-white" products={newItems} wished={wished} onToggleWish={toggleWish} onAdd={handleAdd} onQuickView={setQuickView} />
          <HSection title="베스트셀러" badge="🏆 BEST" color="bg-amber-500 text-white" products={bestItems} wished={wished} onToggleWish={toggleWish} onAdd={handleAdd} onQuickView={setQuickView} />
        </>}

        {/* ── 전체 상품 ─────────────────────────────────────────────── */}
        <section id="all-products">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <h2 className="text-lg font-black text-gray-900">
              {activeSlug === 'all' ? '전체 상품' : categories.find(c => c.slug === activeSlug)?.name ?? ''}
              {!loading && <span className="text-sm text-gray-400 font-normal ml-2">({products.length}개)</span>}
            </h2>
            <div className="flex items-center gap-2">
              <select value={sort} onChange={e => setSort(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-red-400 cursor-pointer">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-xl overflow-hidden bg-white">
                  <div className="aspect-square bg-gray-100" />
                  <div className="p-3 space-y-2"><div className="h-3 bg-gray-100 rounded w-1/2" /><div className="h-4 bg-gray-100 rounded w-full" /><div className="h-3 bg-gray-100 rounded w-2/3" /></div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 text-gray-400">
              <span className="text-5xl mb-4">🔍</span>
              <p className="font-bold text-lg">상품이 없습니다</p>
              <p className="text-sm mt-1">{search ? `"${search}" 검색 결과가 없습니다` : '관리자 페이지에서 상품을 추가해주세요'}</p>
              {search && <button onClick={() => { setSearch(''); loadProducts(activeSlug, '', sort); }} className="mt-4 text-sm text-red-500 underline">검색 초기화</button>}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {products.map(p => (
                <ProductCard key={p.id} p={p} wished={wished.has(p.id)} onToggleWish={() => toggleWish(p.id)} onAdd={() => handleAdd(p)} onQuickView={() => setQuickView(p)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── 푸터 ──────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs text-gray-500 mb-8">
            {[['🚚','무료배송','3만원 이상 구매 시'],['🔄','30일 무료반품','단순 변심 포함'],['🔒','안전결제','100% 구매 보장'],['💬','빠른 응답','채팅 고객센터']].map(([icon,t,s]) => (
              <div key={t} className="flex items-center gap-3">
                <span className="text-2xl">{icon}</span>
                <div><p className="font-bold text-gray-700 text-sm">{t}</p><p>{s}</p></div>
              </div>
            ))}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-t border-gray-100 pt-6">
            <span className="text-2xl font-black text-gray-900">LOOV<span className="text-red-500">.</span></span>
            <p className="text-xs text-gray-400">© 2025 LOOV. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* ── 플로팅 장바구니 버튼 ────────────────────────────────────── */}
      {cartCount > 0 && (
        <Link href="/shops/cart"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-5 py-3.5 rounded-full shadow-2xl shadow-red-200 font-bold text-sm transition-all hover:scale-105 active:scale-95 animate-[bounceIn_0.3s_ease]">
          🛒 장바구니 <span className="bg-white text-red-500 rounded-full w-6 h-6 flex items-center justify-center text-xs font-black">{cartCount}</span>
        </Link>
      )}

      {/* ── 퀵뷰 ──────────────────────────────────────────────────────── */}
      {quickView && (
        <QuickView product={quickView} onClose={() => setQuickView(null)} onAdd={() => { handleAdd(quickView); setQuickView(null); }} />
      )}

      {/* ── 토스트 ────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 text-white text-sm px-5 py-3 rounded-full shadow-xl whitespace-nowrap transition-all ${toast.type === 'cart' ? 'bg-gray-900' : 'bg-red-500'}`}>
          {toast.type === 'cart' ? '🛒' : '♥'} {toast.msg}
        </div>
      )}
    </div>
  );
}
