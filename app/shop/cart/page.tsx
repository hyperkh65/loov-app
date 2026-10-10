'use client';

import { useCart } from '@/lib/shop-cart';
import Link from 'next/link';
import Image from 'next/image';

export default function CartPage() {
  const { items, removeItem, updateQty, totalPrice, clear } = useCart();

  if (items.length === 0) return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center pb-24 md:pb-20">
      <div className="text-7xl mb-6">🛒</div>
      <h2 className="text-2xl font-black text-gray-900 mb-2">장바구니가 비어 있습니다</h2>
      <p className="text-gray-500 mb-8">마음에 드는 상품을 담아보세요!</p>
      <Link href="/shop" className="inline-block bg-blue-600 text-white font-bold px-10 py-3 rounded-full hover:bg-blue-700 transition-colors">
        쇼핑 계속하기
      </Link>
    </div>
  );

  const SHIPPING_FEE = totalPrice() >= 50000 ? 0 : 3000;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-24 md:pb-8">
      <h1 className="text-2xl font-black text-gray-900 mb-8">장바구니</h1>

      <div className="md:grid md:grid-cols-3 md:gap-8">
        {/* 상품 목록 */}
        <div className="md:col-span-2 space-y-4 mb-6 md:mb-0">
          {items.map(item => {
            const key = `${item.id}-${item.option_name ?? ''}`;
            return (
              <div key={key} className="flex gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                {/* 이미지 */}
                <div className="w-20 h-20 flex-shrink-0 bg-gray-50 rounded-xl overflow-hidden">
                  {item.thumbnail_url
                    ? <img src={item.thumbnail_url} alt={item.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl text-gray-300">💡</div>
                  }
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm line-clamp-2">{item.name}</p>
                  {item.option_name && <p className="text-xs text-gray-500 mt-0.5">{item.option_name}</p>}
                  <p className="text-blue-600 font-bold mt-1">{item.price.toLocaleString()}원</p>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                      <button onClick={() => updateQty(item.id, item.option_name, item.qty - 1)}
                        className="w-8 h-8 text-gray-600 hover:bg-gray-100 transition-colors flex items-center justify-center font-bold">-</button>
                      <span className="w-10 text-center text-sm font-semibold">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, item.option_name, item.qty + 1)}
                        className="w-8 h-8 text-gray-600 hover:bg-gray-100 transition-colors flex items-center justify-center font-bold">+</button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-900">{(item.price * item.qty).toLocaleString()}원</span>
                      <button onClick={() => removeItem(item.id, item.option_name)}
                        className="text-gray-400 hover:text-red-500 transition-colors text-lg">✕</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <button onClick={clear} className="text-sm text-gray-400 hover:text-red-500 transition-colors underline">
            장바구니 전체 비우기
          </button>
        </div>

        {/* 주문 요약 */}
        <div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sticky top-20">
            <h3 className="font-bold text-gray-900 mb-4">주문 요약</h3>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between text-gray-600">
                <span>상품 금액</span>
                <span>{totalPrice().toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>배송비</span>
                <span className={SHIPPING_FEE === 0 ? 'text-blue-600 font-semibold' : ''}>
                  {SHIPPING_FEE === 0 ? '무료' : `${SHIPPING_FEE.toLocaleString()}원`}
                </span>
              </div>
              {SHIPPING_FEE > 0 && (
                <p className="text-[11px] text-orange-500">
                  {(50000 - totalPrice()).toLocaleString()}원 더 담으면 무료배송
                </p>
              )}
            </div>
            <div className="border-t border-gray-100 pt-3 mb-5">
              <div className="flex justify-between font-black text-lg text-gray-900">
                <span>총 결제금액</span>
                <span className="text-blue-600">{(totalPrice() + SHIPPING_FEE).toLocaleString()}원</span>
              </div>
            </div>
            <Link href="/shop/checkout"
              className="block w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-center rounded-2xl transition-colors">
              주문하기
            </Link>
            <Link href="/shop"
              className="block w-full py-3 text-center text-sm text-gray-500 hover:text-blue-600 transition-colors mt-2">
              쇼핑 계속하기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
