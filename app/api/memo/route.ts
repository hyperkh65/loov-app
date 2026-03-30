import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const date = searchParams.get('date');       // YYYY-MM-DD
  const month = searchParams.get('month');     // YYYY-MM (달력용)
  const category = searchParams.get('category');
  const tag = searchParams.get('tag');
  const q = searchParams.get('q');

  let query = supabase.from('bossai_memos')
    .select('*')
    .eq('user_id', user.id)
    .order('memo_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (date) query = query.eq('memo_date', date);
  if (month) query = query.gte('memo_date', `${month}-01`).lte('memo_date', `${month}-31`);
  if (category) query = query.eq('category', category);
  if (tag) query = query.contains('tags', [tag]);
  if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memos: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json();
  const { title = '', content, summary = '', tags = [], category = '기타', memo_date } = body;
  if (!content?.trim()) return NextResponse.json({ error: '내용 필요' }, { status: 400 });

  const { data, error } = await supabase.from('bossai_memos').insert({
    user_id: user.id,
    title,
    content,
    summary,
    tags,
    category,
    memo_date: memo_date || new Date().toISOString().split('T')[0],
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memo: data });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const { data, error } = await supabase.from('bossai_memos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memo: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const { error } = await supabase.from('bossai_memos')
    .delete().eq('id', id).eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
