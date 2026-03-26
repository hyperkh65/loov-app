import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase
    .from('ameba_connections')
    .select('blog_id, email, cookies_updated_at')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({ connected: !!data, connection: data || null });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { email, blog_id, password } = await req.json() as {
    email?: string;
    blog_id?: string;
    password?: string;
  };
  if (!email || !blog_id) return NextResponse.json({ error: 'email, blog_id 필요' }, { status: 400 });

  const upsertData: Record<string, unknown> = {
    user_id: user.id,
    email,
    blog_id,
    updated_at: new Date().toISOString(),
  };
  if (password) upsertData.password_plain = password;

  const { error } = await supabase
    .from('ameba_connections')
    .upsert(upsertData, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  await supabase.from('ameba_connections').delete().eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
