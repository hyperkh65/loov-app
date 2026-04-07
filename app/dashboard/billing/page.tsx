'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '0원',
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

interface UserPlan {
  plan: string;
  plan_expires_at?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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
        stripe_customer_id: data.settings?.stripe_customer_id,
        stripe_subscription_id: data.settings?.stripe_subscription_id,
      });
    } catch {
      setUserPlan({ plan: 'free' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    const success = searchParams.get('success');
    const cancel = searchParams.get('cancel');
    if (success) showToast('구독이 완료되었습니다! 잠시 후 플랜이 업데이트됩니다.');
    if (cancel) showToast('결제가 취소되었습니다.');
  }, [searchParams]);

  const handleCheckout = async (planKey: string) => {
    if (planKey === 'free') return;
    setActionLoading(planKey);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error || '오류가 발생했습니다');
      }
    } catch {
      showToast('결제 페이지 로딩 실패');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePortal = async () => {
    setActionLoading('portal');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error || '포털 로딩 실패');
      }
    } catch {
      showToast('구독 관리 페이지 로딩 실패');
    } finally {
      setActionLoading(null);
    }
  };

  const currentPlan = userPlan?.plan || 'free';
  const hasSubscription = !!(userPlan?.stripe_subscription_id);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        로딩 중...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* 토스트 */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* 현재 플랜 */}
      <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400 mb-1">현재 플랜</p>
            <h2 className="text-2xl font-bold text-white capitalize">{currentPlan}</h2>
            {userPlan?.plan_expires_at && (
              <p className="text-sm text-gray-400 mt-1">
                다음 결제일: {new Date(userPlan.plan_expires_at).toLocaleDateString('ko-KR')}
              </p>
            )}
          </div>
          {hasSubscription && (
            <button
              onClick={handlePortal}
              disabled={actionLoading === 'portal'}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-xl transition disabled:opacity-50"
            >
              {actionLoading === 'portal' ? '로딩...' : '구독 관리'}
            </button>
          )}
        </div>
      </div>

      {/* 플랜 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          return (
            <div
              key={plan.key}
              className={`rounded-2xl p-6 border transition-all ${
                plan.highlight
                  ? 'bg-blue-600/10 border-blue-500'
                  : 'bg-gray-800 border-gray-700'
              } ${isCurrent ? 'ring-2 ring-green-500' : ''}`}
            >
              {plan.highlight && (
                <span className="inline-block bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full mb-3">
                  추천
                </span>
              )}
              {isCurrent && (
                <span className="inline-block bg-green-600 text-white text-xs px-2 py-0.5 rounded-full mb-3 ml-1">
                  현재 플랜
                </span>
              )}
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
                <button
                  disabled
                  className="w-full py-2.5 rounded-xl bg-gray-700 text-gray-400 text-sm cursor-default"
                >
                  {isCurrent ? '현재 플랜' : '기본 플랜'}
                </button>
              ) : isCurrent ? (
                <button
                  onClick={handlePortal}
                  disabled={actionLoading === 'portal'}
                  className="w-full py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm transition disabled:opacity-50"
                >
                  {actionLoading === 'portal' ? '로딩...' : '구독 관리'}
                </button>
              ) : (
                <button
                  onClick={() => handleCheckout(plan.key)}
                  disabled={!!actionLoading}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50 ${
                    plan.highlight
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  {actionLoading === plan.key ? '로딩...' : plan.key === 'business' ? '영업팀 문의' : '업그레이드'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 안내 */}
      <div className="text-center text-sm text-gray-500">
        <p>결제는 Stripe를 통해 안전하게 처리됩니다.</p>
        <p className="mt-1">구독 취소 시 현재 결제 기간 종료까지 서비스 이용 가능합니다.</p>
      </div>
    </div>
  );
}
