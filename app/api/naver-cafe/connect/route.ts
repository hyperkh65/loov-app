import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// GET: 연결 상태 조회
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase.from('naver_cafe_connections')
    .select('club_id, cafe_name, cafe_url, member_id, menu_list, token_expires_at, is_active, updated_at')
    .eq('user_id', user.id)
    .single();

  if (!data) return NextResponse.json({ connected: false });

  const oauthConnected = !!(data.token_expires_at && new Date(data.token_expires_at) > new Date());
  return NextResponse.json({ connected: true, oauth_connected: oauthConnected, ...data });
}

// POST: club_id, cafe_name, cafe_url 저장
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json();
  const { club_id, cafe_name, cafe_url } = body;
  if (!club_id) return NextResponse.json({ error: 'club_id 필요' }, { status: 400 });

  const { error } = await supabase.from('naver_cafe_connections').upsert({
    user_id: user.id,
    club_id,
    cafe_name: cafe_name || '',
    cafe_url: cafe_url || '',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: 연결 해제
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  await supabase.from('naver_cafe_connections').delete().eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
