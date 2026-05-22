import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));

  const { data, error } = await supabase
    .from('bossai_accounting_entries')
    .select('type, amount, date')
    .eq('user_id', user.id)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, income: 0, expense: 0 }));
  (data || []).forEach((e) => {
    const m = parseInt(e.date.split('-')[1]) - 1;
    if (e.type === 'income') monthly[m].income += e.amount;
    else monthly[m].expense += e.amount;
  });

  return NextResponse.json({ monthly });
}
