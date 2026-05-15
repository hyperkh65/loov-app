/**
 * DB 테이블 (Supabase에서 직접 생성 필요):
 *
 * CREATE TABLE bossai_stock_predictions (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id uuid NOT NULL,
 *   symbol text NOT NULL,
 *   name text,
 *   prediction_date date NOT NULL,
 *   predicted_close numeric NOT NULL,
 *   actual_close numeric,
 *   accuracy_pct numeric,
 *   direction text,         -- 'up' | 'down' | 'neutral'
 *   note text,
 *   created_at timestamptz DEFAULT now(),
 *   UNIQUE(user_id, symbol, prediction_date)
 * );
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const symbol = req.nextUrl.searchParams.get('symbol');
  let query = supabase
    .from('bossai_stock_predictions')
    .select('*')
    .eq('user_id', user.id)
    .order('prediction_date', { ascending: false });
  if (symbol) query = query.eq('symbol', symbol);

  const { data } = await query.limit(100);
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    symbol: string; name?: string; prediction_date: string;
    predicted_close: number; direction?: string; note?: string;
  };
  const { error, data } = await supabase
    .from('bossai_stock_predictions')
    .upsert({ ...body, user_id: user.id }, { onConflict: 'user_id,symbol,prediction_date' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { id: string; actual_close: number };
  const accuracy_pct = body.actual_close > 0
    ? null // will be computed in next fetch
    : null;

  const { data: existing } = await supabase
    .from('bossai_stock_predictions')
    .select('predicted_close')
    .eq('id', body.id)
    .eq('user_id', user.id)
    .single();

  const acc = existing
    ? Math.round((1 - Math.abs(body.actual_close - existing.predicted_close) / body.actual_close) * 100 * 10) / 10
    : accuracy_pct;

  const { error, data } = await supabase
    .from('bossai_stock_predictions')
    .update({ actual_close: body.actual_close, accuracy_pct: acc })
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
