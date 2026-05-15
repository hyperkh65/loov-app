/**
 * DB 테이블 (Supabase에서 직접 생성 필요):
 *
 * CREATE TABLE bossai_stock_journal (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id uuid NOT NULL,
 *   symbol text NOT NULL,
 *   name text,
 *   trade_date date NOT NULL,
 *   trade_type text NOT NULL,   -- 'buy' | 'sell'
 *   quantity integer NOT NULL,
 *   price numeric NOT NULL,
 *   fee numeric DEFAULT 0,
 *   memo text,
 *   created_at timestamptz DEFAULT now()
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
    .from('bossai_stock_journal')
    .select('*')
    .eq('user_id', user.id)
    .order('trade_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (symbol) query = query.eq('symbol', symbol);

  const { data } = await query.limit(200);
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    symbol: string; name?: string; trade_date: string;
    trade_type: 'buy' | 'sell'; quantity: number; price: number; fee?: number; memo?: string;
  };
  const { error, data } = await supabase
    .from('bossai_stock_journal')
    .insert({ ...body, user_id: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
