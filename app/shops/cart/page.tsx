'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '@/lib/shop-cart';

function fmtPrice(n: number) { return n.toLocaleString('ko-KR') + '원'; }

export default function CartPage() {
  const { items, removeItem, updateQty, totalPrice, totalCount, clear } = useCart();
  const [removing, setRemoving] = useState<string | null>(null);

  const shipping = totalPrice() >= 30000 ? 0 : 3000;
  const finalTotal = totalPrice() + shipping;

  if (items.length === 0) return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/shops" className="flex items-center gap-2 text-gray-700 text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            쇼핑몰
          </Link>
          <span className="font-bold text-xl tracking-tight">LOOV</span>
          <div className="w-16" />
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-5">
        <div className="w-24 h-24 rounded-full bg-gray-50 flex items-center justify-center text-4xl">🛒</div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">장바구니가 비어 있습니다</h2>
          <p className="text-gray-500 text-sm">마음에 드는 상품을 담아보세요</p>
        </div>
        <Link href="/shops"
          className="px-8 py-3.5 bg-gray-900 text-white rounded-full font-semibold text-sm hover:bg-gray-700 transition">
          쇼핑 계속하기
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/shops" className="flex items-center gap-2 text-gray-700 text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            쇼핑몰
          </Link>
          <span className="font-bold text-xl tracking-tight">LOOV</span>
          <button onClick={clear} className="text-xs text-gray-400 hover:text-red-500 transition">전체 삭제</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">장바구니</h1>
        <p className="text-sm text-gray-400 mb-8">{totalCount()}개 상품</p>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* 장바구니 아이템 */}
          <div className="flex-1 space-y-3">
            {items.map(item => {
              const key = `${item.id}-${item.option_name}`;
              return (
                <div key={key}
                  className={`bg-white rounded-2xl p-4 flex gap-4 transition-all duration-200 ${removing === key ? 'opacity-0 scale-95' : ''}`}
                >
                  {/* 이미지 */}
                  <div className="w-20 h-20 rounded-xl bg-gray-50 overflow-hidden shrink-0 relative">
                    {item.thumbnail_url ? (
                      <Image src={item.thumbnail_url} alt={item.name} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl text-gray-200">📦</div>
                    )}
                  </div>

                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <Link href={`/shops/${item.id}`}>
                      <h3 className="font-semibold text-sm text-gray-900 hover:text-blue-600 truncate">{item.name}</h3>
                    </Link>
                    {item.option_name && (
                      <p className="text-xs text-gray-400 mt-0.5">{item.option_name}</p>
                    )}
                    <p className="text-sm font-bold text-gray-900 mt-2">{fmtPrice(item.price)}</p>
                  </div>

                  {/* 수량 + 삭제 */}
                  <div className="flex flex-col items-end justify-between">
                    <button
                      onClick={() => {
                        setRemoving(key);
                        setTimeout(() => { removeItem(item.id, item.option_name); setRemoving(null); }, 200);
                      }}
                      className="text-gray-300 hover:text-red-400 transition text-lg"
                    >
                      ✕
                    </button>
                    <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-1.5">
                      <button onClick={() => updateQty(item.id, item.option_name, item.qty - 1)} className="text-gray-400 hover:text-gray-900 font-bold text-sm">−</button>
                      <span className="w-5 text-center text-sm font-semibold">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, item.option_name, item.qty + 1)} className="text-gray-400 hover:text-gray-900 font-bold text-sm">+</button>
                    </div>
                    <p className="text-sm font-bold text-blue-600">{fmtPrice(item.price * item.qty)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 주문 요약 */}
          <div className="lg:w-80 shrink-0">
            <div className="bg-white rounded-2xl p-6 sticky top-20">
              <h2 className="font-bold text-gray-900 mb-5">주문 요약</h2>

              <div className="space-y-3 text-sm mb-5">
                <div className="flex justify-between text-gray-600">
                  <span>상품 합계</span>
                  <span>{fmtPrice(totalPrice())}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>배송비</span>
                  <span className={shipping === 0 ? 'text-blue-600 font-medium' : ''}>{shipping === 0 ? '무료' : fmtPrice(shipping)}</span>
                </div>
                {shipping > 0 && (
                  <p className="text-xs text-gray-400">3만원 이상 구매 시 무료배송</p>
                )}
                <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900">
                  <span>최종 금액</span>
                  <span className="text-lg">{fmtPrice(finalTotal)}</span>
                </div>
              </div>

              <Link href="/shops/checkout"
                className="block w-full py-4 bg-gray-900 text-white rounded-2xl font-semibold text-sm text-center hover:bg-gray-700 transition active:scale-[0.98]">
                주문하기
              </Link>
              <Link href="/shops"
                className="block w-full py-3 text-center text-sm text-gray-400 hover:text-gray-700 transition mt-2">
                쇼핑 계속하기
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
