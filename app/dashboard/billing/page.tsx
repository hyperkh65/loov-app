'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '무료',
    period: '',
    desc: '소규모 팀을 위한 무료 플랜',
    features: ['AI 채팅 월 100회', '직원 3명', '기본 ERP', '1GB 스토리지'],
    highlight: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '29,000원',
    period: '/월',
    desc: '성장하는 비즈니스를 위한 플랜',
    features: ['AI 채팅 무제한', '직원 20명', '전체 ERP + 자동화', '50GB', 'NAS 연동', '우선 지원'],
    highlight: true,
  },
  {
    key: 'business',
    name: 'Business',
    price: '99,000원',
    period: '/월',
    desc: '대규모 조직을 위한 엔터프라이즈',
    features: ['AI 무제한', '직원 무제한', '전체 기능', '500GB', 'NAS+CCTV+WordPress', '전담 지원'],
    highlight: false,
  },
];

// 카카오톡 채널 URL (개설 후 변경: https://pf.kakao.com/_xxxxx)
const KAKAO_CHANNEL_URL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || 'https://pf.kakao.com/_ixeGIX';

interface UserPlan {
  plan: string;
  plan_expires_at?: string;
  plan_billing_day?: number;
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadPlan = useCallback(async () => {
    try {
      const res = await fetch('/api/user-settings');
      const data = await res.json();
      setUserPlan({
        plan: data.settings?.plan || 'free',
        plan_expires_at: data.settings?.plan_expires_at,
        plan_billing_day: data.settings?.plan_billing_day,
      });
    } catch {
      setUserPlan({ plan: 'free' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPlan(); }, [loadPlan]);
  useEffect(() => {
    if (searchParams.get('success')) showToast('문의가 확인되었습니다!');
  }, [searchParams]);

  const openKakao = (planName?: string) => {
    const msg = planName ? `${planName} 플랜 업그레이드 신청합니다.` : '';
    const url = `${KAKAO_CHANNEL_URL}/chat${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const currentPlan = userPlan?.plan || 'free';

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">로딩 중...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* 현재 플랜 */}
      <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
        <p className="text-sm text-gray-400 mb-1">현재 플랜</p>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white capitalize">{currentPlan}</h2>
          {currentPlan !== 'free' && (
            <span className="text-xs bg-green-600/20 text-green-400 border border-green-600/30 px-2 py-0.5 rounded-full">활성</span>
          )}
        </div>
        {userPlan?.plan_expires_at && (
          <p className="text-sm text-gray-400 mt-1">
            만료일: {new Date(userPlan.plan_expires_at).toLocaleDateString('ko-KR')}
            {userPlan.plan_billing_day && ` · 매월 ${userPlan.plan_billing_day}일 결제`}
          </p>
        )}
      </div>

      {/* 플랜 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          return (
            <div
              key={plan.key}
              className={`rounded-2xl p-6 border transition-all ${
                plan.highlight ? 'bg-blue-600/10 border-blue-500' : 'bg-gray-800 border-gray-700'
              } ${isCurrent ? 'ring-2 ring-green-500' : ''}`}
            >
              <div className="flex gap-1.5 flex-wrap mb-3">
                {plan.highlight && <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">추천</span>}
                {isCurrent && <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">현재</span>}
              </div>
              <h3 className="text-lg font-bold text-white">{plan.name}</h3>
              <div className="mt-1 mb-3">
                <span className="text-2xl font-bold text-white">{plan.price}</span>
                <span className="text-gray-400 text-sm">{plan.period}</span>
              </div>
              <p className="text-gray-400 text-sm mb-4">{plan.desc}</p>
              <ul className="space-y-1.5 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="text-green-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              {plan.key === 'free' ? (
                <button disabled className="w-full py-2.5 rounded-xl bg-gray-700 text-gray-400 text-sm cursor-default">
                  {isCurrent ? '현재 플랜' : '기본 플랜'}
                </button>
              ) : isCurrent ? (
                <button
                  onClick={() => openKakao()}
                  className="w-full py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm transition"
                >
                  구독 변경 문의
                </button>
              ) : (
                <button
                  onClick={() => openKakao(plan.name)}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition ${
                    plan.highlight ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  업그레이드 신청
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 결제 안내 */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-6 space-y-4">
        <h3 className="text-white font-semibold text-sm">💬 결제 안내</h3>
        <ul className="space-y-2.5 text-sm text-gray-400">
          <li className="flex items-start gap-2">
            <span className="text-yellow-400 mt-0.5 flex-shrink-0">①</span>
            <span>원하는 플랜의 <strong className="text-white">업그레이드 신청</strong> 버튼을 누르면 카카오톡 채널 상담창이 열립니다.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-400 mt-0.5 flex-shrink-0">②</span>
            <span>담당자가 <strong className="text-white">계좌번호와 입금 안내</strong>를 카카오톡으로 보내드립니다.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-400 mt-0.5 flex-shrink-0">③</span>
            <span>입금 확인 후 <strong className="text-white">1시간 이내</strong> 플랜이 활성화됩니다. <span className="text-gray-500">(평일 9시~18시 기준)</span></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-400 mt-0.5 flex-shrink-0">④</span>
            <span>구독 취소·변경도 카카오톡으로 문의해 주세요. 당월 결제일 전 요청 시 다음 달부터 적용됩니다.</span>
          </li>
        </ul>

        {/* 카카오톡 버튼 */}
        <button
          onClick={() => openKakao()}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition hover:opacity-90"
          style={{ backgroundColor: '#FEE500', color: '#191919' }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#191919">
            <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.554 1.408 4.8 3.563 6.207L4.5 21l4.438-2.344C9.908 18.878 10.94 19 12 19c5.523 0 10-3.477 10-7.5S17.523 3 12 3z"/>
          </svg>
          카카오톡으로 문의하기
        </button>
      </div>

      <p className="text-center text-xs text-gray-600">
        계좌이체 방식으로 운영됩니다 · 세금계산서 발행 문의는 카카오톡으로 요청해 주세요
      </p>
    </div>
  );
}
