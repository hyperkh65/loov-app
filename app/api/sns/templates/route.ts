import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin.from('sns_post_templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json();
  const admin = createAdminClient();
  const { data, error } = await admin.from('sns_post_templates').insert({ user_id: user.id, ...body }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { id } = await req.json();
  const admin = createAdminClient();
  await admin.from('sns_post_templates').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ success: true });
}
