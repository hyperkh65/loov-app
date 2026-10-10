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
  let query = db.from('bossai_stock_journal').select('*').eq('user_id', user.id).order('trade_date', { ascending: false }).order('created_at', { ascending: false });
  if (symbol) query = query.eq('symbol', symbol);
  const { data } = await query.limit(200);
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json() as { symbol: string; name?: string; trade_date: string; trade_type: 'buy'|'sell'; quantity: number; price: number; fee?: number; memo?: string };
  const db = createAdminClient();
  const { error, data } = await db.from('bossai_stock_journal').insert({ ...body, user_id: user.id }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
