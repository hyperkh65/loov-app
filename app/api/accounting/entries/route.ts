import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
  const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null;
  const type = searchParams.get('type') || null;

  const startDate = month
    ? `${year}-${String(month).padStart(2, '0')}-01`
    : `${year}-01-01`;
  const endDate = month
    ? new Date(year, month, 0).toISOString().split('T')[0]
    : `${year}-12-31`;

  let query = supabase
    .from('bossai_accounting_entries')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (type && (type === 'income' || type === 'expense')) {
    query = query.eq('type', type);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = data || [];
  const totalIncome = items.filter((e) => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
  const totalExpense = items.filter((e) => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);

  return NextResponse.json({ items, totalIncome, totalExpense });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json();
  const { type, amount, account_category, description, date, memo, attachments } = body;

  if (!type || !amount || !account_category || !date) {
    return NextResponse.json({ error: '필수 항목을 입력해주세요 (유형, 금액, 계정과목, 날짜)' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('bossai_accounting_entries')
    .insert({
      user_id: user.id,
      type,
      amount: parseFloat(String(amount)),
      account_category,
      description: description || null,
      date,
      memo: memo || null,
      attachments: attachments || [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  if (updates.amount !== undefined) {
    updates.amount = parseFloat(String(updates.amount));
  }

  const { data, error } = await supabase
    .from('bossai_accounting_entries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const { error } = await supabase
    .from('bossai_accounting_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
