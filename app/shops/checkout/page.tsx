'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useCart } from '@/lib/shop-cart';

function fmtPrice(n: number) { return n.toLocaleString('ko-KR') + '원'; }

export default function CheckoutPage() {
  const router = useRouter();
  const { items, totalPrice, clear } = useCart();
  const [form, setForm] = useState({ name: '', phone: '', zipcode: '', addr: '', addr_detail: '', memo: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const shipping = totalPrice() >= 30000 ? 0 : 3000;
  const finalTotal = totalPrice() + shipping;

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.addr) { setError('필수 항목을 모두 입력해주세요'); return; }
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
          shipping: {
            name: form.name,
            phone: form.phone,
            addr: form.addr,
            addr_detail: form.addr_detail,
            zipcode: form.zipcode,
          },
          memo: form.memo,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || '주문 실패'); setSubmitting(false); return; }

      clear();
      router.push(`/shops/order-complete?no=${data.order.order_no}`);
    } catch { setError('네트워크 오류가 발생했습니다'); setSubmitting(false); }
  };

  if (items.length === 0) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6">
      <p className="text-5xl">🛒</p>
      <p className="text-gray-500">장바구니가 비어 있습니다</p>
      <Link href="/shops" className="px-8 py-3 bg-gray-900 text-white rounded-full text-sm font-semibold">쇼핑하기</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/shops/cart" className="flex items-center gap-2 text-gray-700 text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            장바구니
          </Link>
          <span className="font-bold text-xl tracking-tight">LOOV</span>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">주문서</h1>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* 배송 정보 */}
            <div className="flex-1 space-y-4">
              <div className="bg-white rounded-2xl p-6">
                <h2 className="font-bold text-gray-900 mb-5">배송 정보</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1.5">받는 분 <span className="text-red-500">*</span></label>
                      <input value={form.name} onChange={f('name')} required
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="홍길동" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1.5">연락처 <span className="text-red-500">*</span></label>
                      <input value={form.phone} onChange={f('phone')} required type="tel"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="010-0000-0000" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1.5">우편번호</label>
                    <input value={form.zipcode} onChange={f('zipcode')}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="12345" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1.5">주소 <span className="text-red-500">*</span></label>
                    <input value={form.addr} onChange={f('addr')} required
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="서울시 강남구 테헤란로" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1.5">상세 주소</label>
                    <input value={form.addr_detail} onChange={f('addr_detail')}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="동, 호수 등" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1.5">배송 메모</label>
                    <textarea value={form.memo} onChange={f('memo')} rows={2}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="배송 시 요청사항" />
                  </div>
                </div>
              </div>
            </div>

            {/* 주문 요약 */}
            <div className="lg:w-80 shrink-0 space-y-4">
              {/* 상품 목록 */}
              <div className="bg-white rounded-2xl p-5">
                <h2 className="font-bold text-gray-900 mb-4">주문 상품</h2>
                <div className="space-y-3">
                  {items.map(item => (
                    <div key={`${item.id}-${item.option_name}`} className="flex gap-3 items-center">
                      <div className="w-12 h-12 rounded-lg bg-gray-50 relative shrink-0 overflow-hidden">
                        {item.thumbnail_url ? (
                          <Image src={item.thumbnail_url} alt={item.name} fill className="object-cover" />
                        ) : <div className="w-full h-full flex items-center justify-center text-xl text-gray-200">📦</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{item.name}</p>
                        {item.option_name && <p className="text-[10px] text-gray-400">{item.option_name}</p>}
                        <p className="text-xs text-gray-500">{item.qty}개</p>
                      </div>
                      <p className="text-xs font-bold text-gray-900 shrink-0">{fmtPrice(item.price * item.qty)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 결제 금액 */}
              <div className="bg-white rounded-2xl p-5">
                <h2 className="font-bold text-gray-900 mb-4">결제 금액</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>상품 합계</span><span>{fmtPrice(totalPrice())}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>배송비</span>
                    <span className={shipping === 0 ? 'text-blue-600 font-medium' : ''}>{shipping === 0 ? '무료' : fmtPrice(shipping)}</span>
                  </div>
                  <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-gray-900">
                    <span>최종 결제</span>
                    <span className="text-lg text-blue-600">{fmtPrice(finalTotal)}</span>
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-500 text-center bg-red-50 rounded-xl p-3">{error}</p>}

              <button type="submit" disabled={submitting}
                className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold text-sm hover:bg-gray-700 transition disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]">
                {submitting ? '주문 처리 중...' : `${fmtPrice(finalTotal)} 주문하기`}
              </button>

              <p className="text-xs text-gray-400 text-center">주문 후 관리자 확인 후 발송됩니다</p>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
