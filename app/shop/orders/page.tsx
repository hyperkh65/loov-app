'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface OrderItem { product_name: string; option_name?: string; price: number; qty: number; }
interface Order { id: number; order_no: string; status: string; total_amount: number; created_at: string; shipping_name: string; shop_order_items: OrderItem[]; }

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:  { label: '입금 대기', color: 'text-orange-600 bg-orange-50' },
  paid:     { label: '결제 완료', color: 'text-blue-600 bg-blue-50' },
  shipping: { label: '배송 중', color: 'text-indigo-600 bg-indigo-50' },
  done:     { label: '배송 완료', color: 'text-green-600 bg-green-50' },
  cancel:   { label: '취소', color: 'text-gray-500 bg-gray-100' },
};

function OrdersContent() {
  const searchParams = useSearchParams();
  const newOrderNo = searchParams.get('new');

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/shop/orders').then(r => r.json()).then(d => {
      if (d.error) setError(d.error);
      else setOrders(d.orders ?? []);
      setLoading(false);
    }).catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-24 md:pb-8">
      {/* 주문 완료 메시지 */}
      {newOrderNo && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-8 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="text-xl font-black text-green-800 mb-1">주문이 완료되었습니다!</h2>
          <p className="text-sm text-green-700">주문번호: <strong>{newOrderNo}</strong></p>
          <p className="text-xs text-green-600 mt-2">입금 확인 후 발송됩니다. 감사합니다!</p>
          <Link href="/shop" className="inline-block mt-4 px-6 py-2 bg-green-600 text-white font-bold rounded-full text-sm hover:bg-green-700 transition-colors">
            쇼핑 계속하기
          </Link>
        </div>
      )}

      <h1 className="text-2xl font-black text-gray-900 mb-6">주문 내역</h1>

      {loading ? (
        <div className="space-y-4">
          {[1,2].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-4">🔒</p>
          <p className="font-medium text-gray-600 mb-2">로그인이 필요합니다</p>
          <p className="text-sm mb-6">주문 내역을 보려면 로그인하세요</p>
          <Link href="/login" className="inline-block px-8 py-3 bg-blue-600 text-white font-bold rounded-full hover:bg-blue-700 transition-colors">
            로그인하기
          </Link>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-4">📦</p>
          <p className="font-medium text-gray-600 mb-4">주문 내역이 없습니다</p>
          <Link href="/shop" className="inline-block px-8 py-3 bg-blue-600 text-white font-bold rounded-full hover:bg-blue-700 transition-colors">
            쇼핑하기
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const st = STATUS_MAP[order.status] ?? { label: order.status, color: 'text-gray-500 bg-gray-100' };
            return (
              <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{order.order_no}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{order.created_at.slice(0, 10)}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${st.color}`}>{st.label}</span>
                </div>

                <div className="space-y-2 mb-3">
                  {order.shop_order_items?.map((item, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <div className="text-gray-700">
                        {item.product_name}
                        {item.option_name && <span className="text-xs text-gray-400 ml-1">({item.option_name})</span>}
                        <span className="text-gray-400 ml-1">x{item.qty}</span>
                      </div>
                      <span className="font-semibold text-gray-900">{(item.price * item.qty).toLocaleString()}원</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                  <span className="text-sm text-gray-500">배송지: {order.shipping_name}</span>
                  <div className="text-right">
                    <span className="text-sm text-gray-500">총 결제금액 </span>
                    <span className="font-black text-blue-600">{order.total_amount.toLocaleString()}원</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-8 text-center text-gray-400">불러오는 중...</div>}>
      <OrdersContent />
    </Suspense>
  );
}
