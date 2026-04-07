import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { saveUserSettings } from '@/lib/user-settings';
import type Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

async function handleSubscription(sub: Stripe.Subscription, eventType: string) {
  const userId = sub.metadata?.user_id;
  const plan = (sub.metadata?.plan || 'free') as 'free' | 'pro' | 'business';
  if (!userId) return;

  if (eventType === 'customer.subscription.deleted' || sub.status === 'canceled') {
    await saveUserSettings(userId, { plan: 'free', stripe_subscription_id: '', plan_expires_at: undefined });
    return;
  }

  if (['active', 'trialing'].includes(sub.status)) {
    const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
    const expiresAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : undefined;
    await saveUserSettings(userId, {
      plan,
      stripe_subscription_id: sub.id,
      plan_expires_at: expiresAt,
    });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') || '';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Webhook error: ${msg}` }, { status: 400 });
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscription(event.data.object as Stripe.Subscription, event.type);
      break;
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription' && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        await handleSubscription(sub, 'checkout.session.completed');
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
