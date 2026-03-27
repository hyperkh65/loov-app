import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/telegram/setup?secret=TELEGRAM_WEBHOOK_SECRET
 *
 * Registers the Telegram webhook for this app.
 * Pass `?secret=<TELEGRAM_WEBHOOK_SECRET>` to authenticate the request.
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN       - from @BotFather
 *   TELEGRAM_WEBHOOK_SECRET  - used both to verify this setup call and as the webhook secret token
 *   NEXT_PUBLIC_APP_URL      - e.g. https://loov.co.kr
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret') ?? '';

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!webhookSecret || secret !== webhookSecret) {
    return NextResponse.json({ error: 'Unauthorized — pass ?secret=<TELEGRAM_WEBHOOK_SECRET>' }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  if (!botToken) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN env var is not set' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (!appUrl) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL env var is not set' }, { status: 500 });
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`;

  const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    }),
  });

  const result = await tgRes.json() as { ok: boolean; description?: string };

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Telegram setWebhook failed', detail: result.description },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: '✅ Telegram webhook registered successfully',
    webhook_url: webhookUrl,
    telegram_response: result,
  });
}

/**
 * GET /api/telegram/setup?secret=...&action=info
 * Returns current webhook info without changing anything.
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret') ?? '';

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  if (!webhookSecret || secret !== webhookSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  if (!botToken) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, { status: 500 });
  }

  const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: true }),
  });

  const result = await tgRes.json() as { ok: boolean; description?: string };

  return NextResponse.json({
    ok: result.ok,
    message: result.ok ? '✅ Webhook removed' : '❌ Failed to remove webhook',
    detail: result.description,
  });
}
