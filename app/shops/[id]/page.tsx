'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/shop-cart';

interface Product {
  id: number; name: string; price: number; sale_price: number | null;
  thumbnail_url: string | null; description: string | null; detail_html: string | null;
  is_new: boolean; is_best: boolean; stock: number; options: string[] | null;
  shop_categories: { id: number; name: string; slug: string } | null;
  shop_product_images: Array<{ url: string; sort_order: number }>;
  spec: Record<string, string> | null;
}
interface RelatedProduct {
  id: number; name: string; price: number; sale_price: number | null; thumbnail_url: string | null;
}

function fmtPrice(n: number) { return n.toLocaleString('ko-KR') + '원'; }

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [option, setOption] = useState('');
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(false);
  const { addItem, totalCount } = useCart();

  useEffect(() => {
    fetch(`/api/shop/products/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.product) { setProduct(d.product); if (d.product.options?.[0]) setOption(d.product.options[0]); }
        if (d.related) setRelated(d.related);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleAdd = () => {
    if (!product) return;
    addItem({ id: product.id, name: product.name, price: product.sale_price ?? product.price, thumbnail_url: product.thumbnail_url, option_name: option || undefined });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const allImages = product
    ? [product.thumbnail_url, ...product.shop_product_images.sort((a, b) => a.sort_order - b.sort_order).map(i => i.url)].filter(Boolean) as string[]
    : [];

  const displayPrice = product ? (product.sale_price ?? product.price) : 0;
  const discount = product?.sale_price ? Math.round((1 - product.sale_price / product.price) * 100) : 0;

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
    </div>
  );

  if (!product) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
      <p className="text-5xl">😕</p>
      <p className="text-gray-500">상품을 찾을 수 없습니다</p>
      <Link href="/shops" className="text-blue-600 underline text-sm">← 쇼핑몰 돌아가기</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      {/* 헤더 */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/shops" className="flex items-center gap-2 text-gray-600 hover:text-red-500 text-sm transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            쇼핑몰
          </Link>
          <Link href="/shops" className="font-black text-xl tracking-tight text-gray-900">LOOV<span className="text-red-500">.</span></Link>
          <Link href="/shops/cart" className="relative p-2">
            <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
            {totalCount() > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">{totalCount()}</span>}
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-12">
        {/* 브레드크럼 */}
        <nav className="text-xs text-gray-400 mb-8 flex items-center gap-2">
          <Link href="/shops" className="hover:text-gray-700">쇼핑몰</Link>
          <span>›</span>
          <Link href={`/shops?category=${product.shop_categories?.slug}`} className="hover:text-gray-700">{product.shop_categories?.name ?? '전체'}</Link>
          <span>›</span>
          <span className="text-gray-700">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-20">
          {/* 이미지 갤러리 */}
          <div className="space-y-4">
            <div className="relative aspect-square bg-gray-50 rounded-3xl overflow-hidden">
              {allImages[imgIdx] ? (
                <Image src={allImages[imgIdx]} alt={product.name} fill className="object-contain p-6" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-8xl text-gray-200">📦</div>
              )}
              {product.is_new && (
                <span className="absolute top-4 left-4 text-xs font-bold bg-blue-500 text-white px-2 py-1 rounded-full">NEW</span>
              )}
              {product.is_best && (
                <span className="absolute top-4 left-4 mt-7 text-xs font-bold bg-orange-500 text-white px-2 py-1 rounded-full">BEST</span>
              )}
            </div>
            {allImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {allImages.map((url, i) => (
                  <button key={i} onClick={() => setImgIdx(i)}
                    className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition ${imgIdx === i ? 'border-blue-500' : 'border-transparent'}`}>
                    <Image src={url} alt="" width={64} height={64} className="object-cover w-full h-full" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 상품 정보 */}
          <div className="flex flex-col">
            <p className="text-sm text-gray-400 mb-2">{product.shop_categories?.name}</p>
            <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-snug">{product.name}</h1>

            {product.description && (
              <p className="text-gray-500 text-sm leading-relaxed mb-6">{product.description}</p>
            )}

            {/* 가격 */}
            <div className="flex items-end gap-3 mb-8">
              <span className="text-4xl font-bold text-gray-900">{fmtPrice(displayPrice)}</span>
              {product.sale_price && (
                <>
                  <span className="text-xl text-gray-400 line-through mb-0.5">{fmtPrice(product.price)}</span>
                  <span className="text-sm font-bold text-red-500 mb-1">{discount}% 할인</span>
                </>
              )}
            </div>

            {/* 옵션 */}
            {product.options && product.options.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-700 mb-2">옵션 선택</p>
                <div className="flex flex-wrap gap-2">
                  {product.options.map(opt => (
                    <button key={opt} onClick={() => setOption(opt)}
                      className={`px-4 py-2 rounded-xl text-sm border-2 transition ${option === opt ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 수량 */}
            <div className="flex items-center gap-4 mb-8">
              <p className="text-sm font-medium text-gray-700">수량</p>
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-2">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="text-gray-500 hover:text-gray-900 font-bold">−</button>
                <span className="w-8 text-center font-semibold">{qty}</span>
                <button onClick={() => setQty(q => q + 1)} className="text-gray-500 hover:text-gray-900 font-bold">+</button>
              </div>
              <span className="text-sm text-gray-400">= {fmtPrice(displayPrice * qty)}</span>
            </div>

            {/* 구매 버튼 */}
            <div className="flex gap-3 mb-8">
              <button
                onClick={handleAdd}
                className={`flex-1 py-4 rounded font-semibold text-sm transition-all duration-200 ${added ? 'bg-green-500 text-white' : 'bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]'}`}
              >
                {added ? '✓ 장바구니 추가됨' : '장바구니 담기'}
              </button>
              <Link href="/shops/cart"
                className="px-6 py-4 rounded border-2 border-gray-900 text-gray-900 font-semibold text-sm hover:bg-gray-900 hover:text-white transition text-center">
                바로 구매
              </Link>
            </div>

            {/* 배송 안내 */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
              {[['🚚', '무료배송', '3만원 이상 주문'], ['🔄', '30일 무료반품', '단순 변심 포함'], ['🔒', '안전결제', '100% 구매 보장']].map(([icon, title, desc]) => (
                <div key={title} className="flex items-center gap-3">
                  <span className="text-lg">{icon}</span>
                  <span className="font-medium text-gray-800">{title}</span>
                  <span className="text-gray-500 text-xs ml-auto">{desc}</span>
                </div>
              ))}
            </div>

            {/* 스펙 */}
            {product.spec && Object.keys(product.spec).length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-semibold text-gray-900 mb-3">제품 사양</p>
                <div className="divide-y divide-gray-100">
                  {Object.entries(product.spec).map(([k, v]) => (
                    <div key={k} className="flex py-2 text-sm">
                      <span className="w-28 text-gray-500 shrink-0">{k}</span>
                      <span className="text-gray-800">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 상세 설명 */}
        {product.detail_html && (
          <div className="border-t border-gray-100 pt-16 mb-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">상품 상세</h2>
            <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: product.detail_html }} />
          </div>
        )}

        {/* 연관 상품 */}
        {related.length > 0 && (
          <div className="border-t border-gray-100 pt-16">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">같은 카테고리 상품</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {related.map(r => (
                <Link key={r.id} href={`/shops/${r.id}`}>
                  <div className="bg-gray-50 rounded-2xl overflow-hidden hover:shadow-md transition">
                    <div className="aspect-square relative bg-gray-100">
                      {r.thumbnail_url ? (
                        <Image src={r.thumbnail_url} alt={r.name} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl text-gray-300">📦</div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-medium text-gray-800 truncate">{r.name}</p>
                      <p className="text-xs text-blue-600 font-bold mt-1">{fmtPrice(r.sale_price ?? r.price)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
