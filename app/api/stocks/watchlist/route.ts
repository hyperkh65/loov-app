/**
 * DB 테이블 (Supabase에서 직접 생성 필요):
 *
 * CREATE TABLE bossai_stock_watchlist (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id uuid NOT NULL,
 *   symbol text NOT NULL,
 *   name text,
 *   market text DEFAULT 'US',
 *   created_at timestamptz DEFAULT now(),
 *   UNIQUE(user_id, symbol)
 * );
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('bossai_stock_watchlist')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { symbol: string; name?: string; market?: string };
  const { error, data } = await supabase
    .from('bossai_stock_watchlist')
    .upsert({ user_id: user.id, symbol: body.symbol, name: body.name || body.symbol, market: body.market || 'US' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
