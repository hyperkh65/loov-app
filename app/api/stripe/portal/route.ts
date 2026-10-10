import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase-server';
import { getUserSettings } from '@/lib/user-settings';

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const settings = await getUserSettings(user.id);
  if (!settings?.stripe_customer_id) {
    return NextResponse.json({ error: '구독 정보 없음' }, { status: 400 });
  }

  const origin = req.headers.get('origin') || 'https://service.loov.co.kr';
  const stripe = getStripe();

  const session = await stripe.billingPortal.sessions.create({
    customer: settings.stripe_customer_id,
    return_url: `${origin}/dashboard/billing`,
  });

  return NextResponse.json({ url: session.url });
}
