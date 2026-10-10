import { NextRequest, NextResponse } from 'next/server';
import { getStripe, PLANS, PlanKey } from '@/lib/stripe';
import { createClient } from '@/lib/supabase-server';
import { getUserSettings, saveUserSettings } from '@/lib/user-settings';

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { plan } = await req.json() as { plan: PlanKey };
  if (!plan || plan === 'free') return NextResponse.json({ error: '유효하지 않은 플랜' }, { status: 400 });

  const priceId = PLANS[plan]?.priceId;
  if (!priceId) return NextResponse.json({ error: 'Stripe Price ID 미설정' }, { status: 500 });

  const settings = await getUserSettings(user.id);
  const stripe = getStripe();

  let customerId = settings?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await saveUserSettings(user.id, { stripe_customer_id: customerId });
  }

  const origin = req.headers.get('origin') || 'https://service.loov.co.kr';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard/billing?success=1`,
    cancel_url: `${origin}/dashboard/billing?cancel=1`,
    subscription_data: {
      metadata: { user_id: user.id, plan },
    },
    locale: 'ko',
  });

  return NextResponse.json({ url: session.url });
}
