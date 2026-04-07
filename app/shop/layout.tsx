'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useCart } from '@/lib/shop-cart';

interface Category { id: number; name: string; slug: string; parent_id: number | null; }

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const totalCount = useCart(s => s.totalCount());

  useEffect(() => {
    fetch('/api/shop/categories').then(r => r.json()).then(d => setCategories(d.categories ?? []));
  }, []);

  const rootCats = categories.filter(c => !c.parent_id);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) router.push(`/shop?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <div className="min-h-screen bg-white text-gray-800 flex flex-col">
      {/* ── 상단 헤더 ── */}
      <header className="border-b border-gray-200 sticky top-0 z-50 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          {/* 1행: 로고 + 검색 + 아이콘 */}
          <div className="flex items-center gap-4 h-16">
            {/* 모바일 메뉴 버튼 */}
            <button onClick={() => setMenuOpen(v => !v)} className="md:hidden text-gray-600 text-xl">☰</button>

            {/* 로고 */}
            <Link href="/shop" className="flex-shrink-0 font-black text-2xl tracking-tight text-gray-900">
              LOOV <span className="text-blue-600 text-sm font-semibold">SHOP</span>
            </Link>

            {/* 검색 */}
            <form onSubmit={handleSearch} className="flex-1 max-w-xl hidden md:flex">
              <div className="flex w-full border border-gray-300 rounded-full overflow-hidden focus-within:border-blue-500 transition-colors">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="상품 검색..."
                  className="flex-1 px-4 py-2 text-sm outline-none bg-transparent"
                />
                <button type="submit" className="px-4 bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">
                  검색
                </button>
              </div>
            </form>

            {/* 우측 아이콘 */}
            <div className="flex items-center gap-3 ml-auto md:ml-0">
              <Link href="/shop/orders" className="hidden md:flex flex-col items-center text-xs text-gray-500 hover:text-blue-600 transition-colors">
                <span className="text-lg">📦</span>
                <span>주문확인</span>
              </Link>
              <Link href="/shop/cart" className="flex flex-col items-center text-xs text-gray-500 hover:text-blue-600 transition-colors relative">
                <span className="text-lg">🛒</span>
                <span className="hidden md:block">장바구니</span>
                {totalCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {totalCount > 9 ? '9+' : totalCount}
                  </span>
                )}
              </Link>
              <Link href="/dashboard" className="hidden md:flex flex-col items-center text-xs text-gray-500 hover:text-blue-600 transition-colors">
                <span className="text-lg">⚙️</span>
                <span>관리</span>
              </Link>
            </div>
          </div>

          {/* 2행: 카테고리 네비 (데스크탑) */}
          <nav className="hidden md:flex items-center gap-1 h-10 overflow-x-auto scrollbar-hide">
            <Link href="/shop" className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors ${pathname === '/shop' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              전체
            </Link>
            {rootCats.map(cat => (
              <Link key={cat.id} href={`/shop/${cat.slug}`}
                className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors ${pathname === `/shop/${cat.slug}` ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {cat.name}
              </Link>
            ))}
          </nav>
        </div>

        {/* 모바일 메뉴 */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <form onSubmit={handleSearch} className="flex p-3 border-b border-gray-100">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="상품 검색..."
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-l-lg outline-none" />
              <button type="submit" className="px-4 bg-blue-600 text-white text-sm rounded-r-lg">검색</button>
            </form>
            <div className="p-3 flex flex-wrap gap-2">
              <Link href="/shop" onClick={() => setMenuOpen(false)}
                className="px-3 py-1.5 text-sm bg-gray-100 rounded-full text-gray-700">전체</Link>
              {rootCats.map(cat => (
                <Link key={cat.id} href={`/shop/${cat.slug}`} onClick={() => setMenuOpen(false)}
                  className="px-3 py-1.5 text-sm bg-gray-100 rounded-full text-gray-700">{cat.name}</Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ── 메인 컨텐츠 ── */}
      <main className="flex-1">
        {children}
      </main>

      {/* ── 푸터 ── */}
      <footer className="bg-gray-900 text-gray-400 text-sm py-10 mt-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="text-white font-semibold mb-3">LOOV SHOP</h4>
              <p className="text-xs leading-relaxed">최고 품질의 LED 조명을<br />합리적인 가격으로 제공합니다.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">고객서비스</h4>
              <ul className="space-y-1 text-xs">
                <li>공지사항</li>
                <li>자주 묻는 질문</li>
                <li>1:1 문의</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">쇼핑안내</h4>
              <ul className="space-y-1 text-xs">
                <li>배송 정책</li>
                <li>교환/반품</li>
                <li>이용약관</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">고객센터</h4>
              <p className="text-xs">평일 09:00 - 18:00</p>
              <p className="text-lg font-bold text-white mt-1">1588-0000</p>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-6 text-xs text-center">
            © 2026 LOOV SHOP. All rights reserved.
          </div>
        </div>
      </footer>

      {/* 모바일 하단 고정 바 */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50">
        {[
          { href: '/shop', icon: '🏠', label: '홈' },
          { href: '/shop?cat=all', icon: '📋', label: '카테고리' },
          { href: '/shop/cart', icon: '🛒', label: '장바구니', badge: totalCount },
          { href: '/shop/orders', icon: '📦', label: '주문' },
        ].map(item => (
          <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-2 relative text-gray-500 hover:text-blue-600 transition-colors">
            <span className="text-xl">{item.icon}</span>
            <span className="text-[10px] mt-0.5">{item.label}</span>
            {item.badge ? (
              <span className="absolute top-1 right-1/4 bg-blue-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
