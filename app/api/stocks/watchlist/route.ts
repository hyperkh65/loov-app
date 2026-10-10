import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = createAdminClient();
  const { data } = await db.from('bossai_stock_watchlist').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json() as { symbol: string; name?: string; market?: string };
  const db = createAdminClient();
  const { error, data } = await db
    .from('bossai_stock_watchlist')
    .upsert({ user_id: user.id, symbol: body.symbol, name: body.name || body.symbol, market: body.market || 'US' }, { onConflict: 'user_id,symbol' })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
