'use client';

import { useState } from 'react';
import { useCart } from '@/lib/shop-cart';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function CheckoutPage() {
  const { items, totalPrice, clear } = useCart();
  const router = useRouter();

  const [form, setForm] = useState({
    name: '', phone: '', zipcode: '', addr: '', addr_detail: '', memo: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const SHIPPING_FEE = totalPrice() >= 50000 ? 0 : 3000;

  function update(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.phone || !form.addr) { setError('필수 항목을 입력해주세요'); return; }
    if (items.length === 0) { setError('장바구니가 비어 있습니다'); return; }

    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/shop/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({
            product_id: i.id,
            product_name: i.name,
            option_name: i.option_name,
            price: i.price,
            qty: i.qty,
          })),
          shipping: { name: form.name, phone: form.phone, addr: form.addr, addr_detail: form.addr_detail, zipcode: form.zipcode },
          memo: form.memo,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      clear();
      router.push(`/shop/orders?new=${d.order.order_no}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center pb-24 md:pb-20">
      <div className="text-7xl mb-6">🛒</div>
      <p className="text-gray-500 mb-6">장바구니가 비어 있습니다</p>
      <Link href="/shop" className="inline-block bg-blue-600 text-white font-bold px-8 py-3 rounded-full hover:bg-blue-700">쇼핑하기</Link>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-24 md:pb-8">
      <h1 className="text-2xl font-black text-gray-900 mb-8">주문 / 결제</h1>

      <form onSubmit={handleSubmit}>
        <div className="md:grid md:grid-cols-3 md:gap-8">
          {/* 배송 정보 */}
          <div className="md:col-span-2 space-y-6 mb-6 md:mb-0">
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4">📦 배송 정보</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">받는 분 <span className="text-red-500">*</span></label>
                    <input value={form.name} onChange={e => update('name', e.target.value)} required
                      placeholder="홍길동"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">연락처 <span className="text-red-500">*</span></label>
                    <input value={form.phone} onChange={e => update('phone', e.target.value)} required
                      placeholder="010-0000-0000"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">주소 <span className="text-red-500">*</span></label>
                  <input value={form.addr} onChange={e => update('addr', e.target.value)} required
                    placeholder="기본 주소"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 mb-2" />
                  <input value={form.addr_detail} onChange={e => update('addr_detail', e.target.value)}
                    placeholder="상세 주소 (동/호수)"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">배송 메모</label>
                  <select value={form.memo} onChange={e => update('memo', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-white">
                    <option value="">메모 없음</option>
                    <option value="문 앞에 놓아주세요">문 앞에 놓아주세요</option>
                    <option value="경비실에 맡겨주세요">경비실에 맡겨주세요</option>
                    <option value="전화 후 배송해주세요">전화 후 배송해주세요</option>
                  </select>
                </div>
              </div>
            </section>

            {/* 결제 수단 */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4">💳 결제 수단</h2>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">무통장 입금</p>
                <p>기업은행 000-000000-00-000</p>
                <p className="text-xs mt-1 text-blue-600">예금주: (주)LOOV | 주문 후 2일 이내 입금 시 자동 확인</p>
              </div>
            </section>

            {/* 주문 상품 확인 */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 mb-4">🛒 주문 상품</h2>
              <div className="space-y-3">
                {items.map(item => (
                  <div key={`${item.id}-${item.option_name}`} className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-50 rounded-lg overflow-hidden flex-shrink-0">
                      {item.thumbnail_url
                        ? <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-xl text-gray-300">💡</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                      {item.option_name && <p className="text-xs text-gray-500">{item.option_name}</p>}
                      <p className="text-xs text-gray-500">{item.qty}개</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{(item.price * item.qty).toLocaleString()}원</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* 결제 요약 */}
          <div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sticky top-20">
              <h3 className="font-bold text-gray-900 mb-4">결제 금액</h3>
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
              </div>
              <div className="border-t border-gray-100 pt-3 mb-5">
                <div className="flex justify-between font-black text-xl text-gray-900">
                  <span>총 금액</span>
                  <span className="text-blue-600">{(totalPrice() + SHIPPING_FEE).toLocaleString()}원</span>
                </div>
              </div>

              {error && <p className="text-red-500 text-sm mb-3 p-2 bg-red-50 rounded-lg">{error}</p>}

              <button type="submit" disabled={submitting}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-lg rounded-2xl transition-colors">
                {submitting ? '처리 중...' : `${(totalPrice() + SHIPPING_FEE).toLocaleString()}원 결제하기`}
              </button>
              <p className="text-[11px] text-gray-400 text-center mt-2">위 내용에 동의하고 결제를 진행합니다</p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
