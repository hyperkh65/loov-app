'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/shop-cart';
import { useRouter } from 'next/navigation';

interface Product {
  id: number; name: string; price: number; sale_price: number | null;
  description: string | null; thumbnail_url: string | null;
  is_new: boolean; is_best: boolean; stock: number;
  options: { name: string; values: string[] }[];
  specs: Record<string, string>;
  shop_categories?: { name: string; slug: string };
  shop_product_images: { url: string; sort_order: number }[];
}
interface Review { id: number; rating: number; content: string; created_at: string; }
interface RelatedProduct { id: number; name: string; price: number; sale_price: number | null; thumbnail_url: string | null; }

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const addItem = useCart(s => s.addItem);

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<'desc' | 'specs' | 'reviews'>('desc');
  const [addedMsg, setAddedMsg] = useState(false);

  useEffect(() => {
    fetch(`/api/shop/products/${id}`).then(r => r.json()).then(d => {
      setProduct(d.product ?? null);
      setReviews(d.reviews ?? []);
      setRelated(d.related ?? []);
      setLoading(false);
    });
  }, [id]);

  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="md:grid md:grid-cols-2 md:gap-10">
        <div className="aspect-square bg-gray-100 rounded-2xl animate-pulse mb-6 md:mb-0" />
        <div className="space-y-4">
          {[80, 60, 40, 40, 40].map((w, i) => <div key={i} className={`h-5 bg-gray-100 rounded animate-pulse w-${w}`} style={{width:`${w}%`}} />)}
        </div>
      </div>
    </div>
  );

  if (!product) return (
    <div className="text-center py-20 text-gray-400">
      <p className="text-5xl mb-4">❓</p>
      <p>상품을 찾을 수 없습니다</p>
      <Link href="/shop" className="inline-block mt-4 text-blue-600 hover:underline">쇼핑몰 홈으로</Link>
    </div>
  );

  const images = [
    ...(product.thumbnail_url ? [product.thumbnail_url] : []),
    ...product.shop_product_images.sort((a, b) => a.sort_order - b.sort_order).map(i => i.url),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const displayPrice = product.sale_price ?? product.price;
  const disc = product.sale_price ? Math.round((1 - product.sale_price / product.price) * 100) : 0;
  const optionStr = Object.values(selectedOptions).filter(Boolean).join(' / ');
  const avgRating = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;

  function handleAddCart() {
    addItem({ id: product!.id, name: product!.name, price: displayPrice, thumbnail_url: product!.thumbnail_url, option_name: optionStr || undefined }, qty);
    setAddedMsg(true);
    setTimeout(() => setAddedMsg(false), 2000);
  }

  function handleBuyNow() {
    addItem({ id: product!.id, name: product!.name, price: displayPrice, thumbnail_url: product!.thumbnail_url, option_name: optionStr || undefined }, qty);
    router.push('/shop/cart');
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-8">
      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/shop" className="hover:text-blue-600">홈</Link>
        {product.shop_categories && (<>
          <span>›</span>
          <Link href={`/shop/${product.shop_categories.slug}`} className="hover:text-blue-600">{product.shop_categories.name}</Link>
        </>)}
        <span>›</span>
        <span className="text-gray-900 truncate max-w-[200px]">{product.name}</span>
      </div>

      {/* 상품 메인 */}
      <div className="md:grid md:grid-cols-2 md:gap-12 mb-12">
        {/* 이미지 갤러리 */}
        <div>
          <div className="aspect-square bg-gray-50 rounded-2xl overflow-hidden mb-3 relative">
            {images.length > 0
              ? <img src={images[imgIdx]} alt={product.name} className="w-full h-full object-contain" />
              : <div className="w-full h-full flex items-center justify-center text-8xl text-gray-200">💡</div>
            }
            {disc > 0 && (
              <div className="absolute top-3 left-3 bg-red-500 text-white font-bold px-2 py-1 rounded-lg text-sm">-{disc}%</div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((url, i) => (
                <button key={i} onClick={() => setImgIdx(i)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${imgIdx === i ? 'border-blue-600' : 'border-transparent'}`}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 상품 정보 */}
        <div className="mt-6 md:mt-0">
          <div className="flex gap-2 mb-3">
            {product.is_new && <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded font-semibold">NEW</span>}
            {product.is_best && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded font-semibold">BEST</span>}
          </div>

          <h1 className="text-xl md:text-2xl font-bold text-gray-900 leading-snug mb-3">{product.name}</h1>

          {reviews.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <div className="flex text-yellow-400 text-sm">{'★'.repeat(Math.round(avgRating))}{'☆'.repeat(5 - Math.round(avgRating))}</div>
              <span className="text-sm text-gray-500">{avgRating.toFixed(1)} ({reviews.length}개 리뷰)</span>
            </div>
          )}

          {/* 가격 */}
          <div className="bg-gray-50 rounded-2xl p-4 mb-5">
            {product.sale_price ? (
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black text-gray-900">{displayPrice.toLocaleString()}원</span>
                  <span className="bg-red-100 text-red-600 text-sm font-bold px-2 py-0.5 rounded">{disc}% 할인</span>
                </div>
                <span className="text-sm text-gray-400 line-through">{product.price.toLocaleString()}원</span>
                <p className="text-sm text-blue-600 font-medium">💰 {(product.price - displayPrice).toLocaleString()}원 절약</p>
              </div>
            ) : (
              <span className="text-2xl font-black text-gray-900">{displayPrice.toLocaleString()}원</span>
            )}
          </div>

          {/* 옵션 */}
          {product.options?.map((opt) => (
            <div key={opt.name} className="mb-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">{opt.name}</p>
              <div className="flex flex-wrap gap-2">
                {opt.values.map(v => (
                  <button key={v} onClick={() => setSelectedOptions(prev => ({ ...prev, [opt.name]: v }))}
                    className={`px-3 py-1.5 rounded-lg text-sm border-2 transition-colors ${selectedOptions[opt.name] === v ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* 수량 */}
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm font-semibold text-gray-700">수량</span>
            <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-10 h-10 text-lg font-bold text-gray-600 hover:bg-gray-100 transition-colors">-</button>
              <span className="w-12 text-center font-bold text-gray-900">{qty}</span>
              <button onClick={() => setQty(q => q + 1)} className="w-10 h-10 text-lg font-bold text-gray-600 hover:bg-gray-100 transition-colors">+</button>
            </div>
            <span className="text-sm text-gray-500">재고 {product.stock}개</span>
          </div>

          {/* 총 금액 */}
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl mb-4">
            <span className="text-sm text-gray-600">총 금액</span>
            <span className="text-lg font-black text-blue-700">{(displayPrice * qty).toLocaleString()}원</span>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3">
            <button onClick={handleAddCart}
              className={`flex-1 py-3 border-2 border-blue-600 text-blue-600 font-bold rounded-2xl hover:bg-blue-50 transition-all ${addedMsg ? 'bg-blue-600 text-white' : ''}`}>
              {addedMsg ? '✓ 담겼습니다!' : '장바구니 담기'}
            </button>
            <button onClick={handleBuyNow}
              className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-colors">
              바로 구매
            </button>
          </div>

          {/* 배송 안내 */}
          <div className="mt-5 p-4 bg-gray-50 rounded-2xl text-sm text-gray-600 space-y-1">
            <p>🚚 <strong>무료배송</strong> (5만원 이상 주문)</p>
            <p>📅 오후 2시 이전 주문 시 당일 발송</p>
            <p>🔄 수령 후 7일 이내 교환/반품 가능</p>
          </div>
        </div>
      </div>

      {/* 탭: 설명 / 스펙 / 리뷰 */}
      <div className="border-b border-gray-200 mb-8">
        <div className="flex gap-1">
          {(['desc', 'specs', 'reviews'] as const).map((t, i) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {['상품 설명', '스펙', `리뷰 (${reviews.length})`][i]}
            </button>
          ))}
        </div>
      </div>

      {tab === 'desc' && (
        <div className="prose max-w-none text-gray-700 leading-relaxed mb-12">
          {product.description
            ? <div className="whitespace-pre-wrap">{product.description}</div>
            : <p className="text-gray-400 text-center py-10">상품 설명이 없습니다.</p>
          }
        </div>
      )}

      {tab === 'specs' && (
        <div className="mb-12">
          {Object.keys(product.specs ?? {}).length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <tbody>
                {Object.entries(product.specs).map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-semibold text-gray-600 w-1/3 bg-gray-50 px-4">{k}</td>
                    <td className="py-3 px-4 text-gray-800">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-gray-400 text-center py-10">스펙 정보가 없습니다.</p>}
        </div>
      )}

      {tab === 'reviews' && (
        <div className="mb-12">
          {reviews.length === 0
            ? <p className="text-gray-400 text-center py-10">아직 리뷰가 없습니다.</p>
            : reviews.map(r => (
              <div key={r.id} className="border-b border-gray-100 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex text-yellow-400 text-sm">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                  <span className="text-xs text-gray-400">{r.created_at.slice(0, 10)}</span>
                </div>
                <p className="text-sm text-gray-700">{r.content}</p>
              </div>
            ))
          }
        </div>
      )}

      {/* 관련 상품 */}
      {related.length > 0 && (
        <section>
          <h3 className="text-lg font-black text-gray-900 mb-4">관련 상품</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {related.map(p => (
              <Link key={p.id} href={`/shop/product/${p.id}`} className="group bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-md transition-shadow">
                <div className="aspect-square bg-gray-50 overflow-hidden">
                  {p.thumbnail_url
                    ? <img src={p.thumbnail_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    : <div className="w-full h-full flex items-center justify-center text-3xl text-gray-200">💡</div>
                  }
                </div>
                <div className="p-2">
                  <p className="text-xs text-gray-700 line-clamp-2">{p.name}</p>
                  <p className="text-xs font-bold mt-1">{(p.sale_price ?? p.price).toLocaleString()}원</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
