import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY 환경변수가 설정되지 않았습니다');
    _stripe = new Stripe(key, { apiVersion: '2025-03-31.basil' });
  }
  return _stripe;
}

export const PLANS = {
  free: {
    name: 'Free',
    priceId: null,
    price: 0,
    features: ['AI 채팅 월 100회', '직원 3명', '기본 ERP', '1GB 스토리지'],
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID || '',
    price: 29000,
    features: ['AI 채팅 무제한', '직원 20명', '전체 ERP + 자동화', '50GB', 'NAS 연동', '우선 지원'],
  },
  business: {
    name: 'Business',
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID || '',
    price: 99000,
    features: ['AI 무제한', '직원 무제한', '전체 기능', '500GB', 'NAS+CCTV+WordPress', '전담 지원'],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
