'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function OrderContent() {
  const orderNo = useSearchParams().get('no');
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-8 px-5 text-center">
      <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center text-4xl animate-bounce">✓</div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">주문이 완료되었습니다!</h1>
        <p className="text-gray-500 text-sm mb-1">주문번호: <span className="font-mono font-semibold text-gray-700">{orderNo}</span></p>
        <p className="text-gray-400 text-xs">관리자 확인 후 빠르게 발송해드리겠습니다</p>
      </div>
      <div className="flex gap-3">
        <Link href="/shops" className="px-6 py-3 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-700 transition">계속 쇼핑하기</Link>
      </div>
    </div>
  );
}

export default function OrderCompletePage() {
  return <Suspense><OrderContent /></Suspense>;
}
