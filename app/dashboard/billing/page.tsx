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

// 계좌 정보 (환경변수로 관리하거나 여기 직접 입력)
const BANK_INFO = {
  bank: '카카오뱅크',
  account: '3333-XX-XXXXXXX', // ← 실제 계좌번호로 변경
  holder: '김현', // ← 실제 예금주로 변경
};

// 카카오톡 채널 URL (카카오 채널 개설 후 변경)
const KAKAO_CHANNEL_URL = 'https://pf.kakao.com/_XXXXX'; // ← 실제 채널 URL로 변경

interface UserPlan {
  plan: string;
  plan_expires_at?: string;
  plan_start_at?: string;
  plan_billing_day?: number;
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState(false);

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
    if (searchParams.get('success')) showToast('문의가 확인되었습니다. 입금 후 카카오톡으로 알려주세요!');
  }, [searchParams]);

  const copyAccount = async () => {
    await navigator.clipboard.writeText(BANK_INFO.account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            <span className="text-xs bg-green-600/20 text-green-400 border border-green-600/30 px-2 py-0.5 rounded-full">
              활성
            </span>
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
          const isSelected = selectedPlan === plan.key;
          return (
            <div
              key={plan.key}
              onClick={() => plan.key !== 'free' && setSelectedPlan(isSelected ? null : plan.key)}
              className={`rounded-2xl p-6 border transition-all cursor-pointer ${
                plan.highlight ? 'bg-blue-600/10 border-blue-500' : 'bg-gray-800 border-gray-700'
              } ${isCurrent ? 'ring-2 ring-green-500' : ''} ${
                isSelected ? 'ring-2 ring-yellow-400' : ''
              } ${plan.key !== 'free' ? 'hover:border-gray-500' : 'cursor-default'}`}
            >
              <div className="flex gap-1.5 flex-wrap mb-3">
                {plan.highlight && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">추천</span>
                )}
                {isCurrent && (
                  <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">현재</span>
                )}
                {isSelected && (
                  <span className="bg-yellow-500 text-black text-xs px-2 py-0.5 rounded-full">선택됨</span>
                )}
              </div>
              <h3 className="text-lg font-bold text-white">{plan.name}</h3>
              <div className="mt-1 mb-3">
                <span className="text-2xl font-bold text-white">{plan.price}</span>
                <span className="text-gray-400 text-sm">{plan.period}</span>
              </div>
              <p className="text-gray-400 text-sm mb-4">{plan.desc}</p>
              <ul className="space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="text-green-400">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* 결제 안내 (플랜 선택 시 표시) */}
      {selectedPlan && selectedPlan !== 'free' && (
        <div className="bg-gray-800 border border-yellow-500/30 rounded-2xl p-6 space-y-5">
          <h3 className="text-white font-semibold text-lg">
            💳 {PLANS.find(p => p.key === selectedPlan)?.name} 플랜 신청
          </h3>

          {/* Step 1: 계좌 이체 */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-300">① 아래 계좌로 이체해 주세요</p>
            <div className="bg-gray-700/50 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">{BANK_INFO.bank} · {BANK_INFO.holder}</p>
                <p className="text-xl font-mono font-bold text-white mt-0.5">{BANK_INFO.account}</p>
                <p className="text-sm text-yellow-400 mt-1">
                  금액: {PLANS.find(p => p.key === selectedPlan)?.price}
                </p>
              </div>
              <button
                onClick={copyAccount}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded-lg transition"
              >
                {copied ? '복사됨 ✓' : '복사'}
              </button>
            </div>
          </div>

          {/* Step 2: 카카오톡 문의 */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-300">② 카카오톡으로 입금 확인 요청</p>
            <p className="text-xs text-gray-400">입금자명, 연락처, 신청 플랜을 알려주시면 확인 후 활성화해드립니다.</p>
            <a
              href={KAKAO_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium transition"
              style={{ backgroundColor: '#FEE500', color: '#191919' }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.554 1.408 4.8 3.563 6.207L4.5 21l4.438-2.344C9.908 18.878 10.94 19 12 19c5.523 0 10-3.477 10-7.5S17.523 3 12 3z"/>
              </svg>
              카카오톡 채널 상담하기
            </a>
          </div>

          <p className="text-xs text-gray-500 text-center">
            확인 후 보통 1시간 이내 활성화됩니다 · 평일 9시~18시 기준
          </p>
        </div>
      )}

      {/* 안내 */}
      <div className="text-center text-sm text-gray-500 space-y-1">
        <p>계좌이체 후 카카오톡 채널로 입금 확인을 요청해 주세요.</p>
        <p>플랜 변경 및 취소 문의도 카카오톡 채널을 이용해 주세요.</p>
      </div>
    </div>
  );
}
