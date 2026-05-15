import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';

async function getUser() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  return user;
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createAdminClient();
  const symbol = req.nextUrl.searchParams.get('symbol');
  let query = db.from('bossai_stock_predictions').select('*').eq('user_id', user.id).order('prediction_date', { ascending: false });
  if (symbol) query = query.eq('symbol', symbol);
  const { data } = await query.limit(100);
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json() as { symbol: string; name?: string; prediction_date: string; predicted_close: number; direction?: string; note?: string };
  const db = createAdminClient();
  const { error, data } = await db.from('bossai_stock_predictions')
    .upsert({ ...body, user_id: user.id }, { onConflict: 'user_id,symbol,prediction_date' })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json() as { id: string; actual_close: number };
  const db = createAdminClient();
  const { data: existing } = await db.from('bossai_stock_predictions').select('predicted_close').eq('id', body.id).eq('user_id', user.id).single();
  const acc = existing
    ? Math.round((1 - Math.abs(body.actual_close - existing.predicted_close) / body.actual_close) * 100 * 10) / 10
    : null;
  const { error, data } = await db.from('bossai_stock_predictions')
    .update({ actual_close: body.actual_close, accuracy_pct: acc })
    .eq('id', body.id).eq('user_id', user.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
