import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// GET: 연결 상태 조회
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase.from('naver_cafe_connections')
    .select('club_id, cafe_name, cafe_url, member_id, menu_list, extra_cafes, token_expires_at, is_active, updated_at')
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

// PUT: 추가 카페 목록 저장 (같은 네이버 계정, 기본 카페와 함께 발행)
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { extra_cafes } = await req.json();
  if (!Array.isArray(extra_cafes)) return NextResponse.json({ error: 'extra_cafes 배열 필요' }, { status: 400 });
  const clean = extra_cafes
    .filter((c: { club_id?: string; menu_id?: string | number }) => c?.club_id && c?.menu_id)
    .map((c: { club_id: string; cafe_name?: string; cafe_url?: string; menu_id: string | number; menu_name?: string }) => ({
      club_id: String(c.club_id), cafe_name: c.cafe_name || '', cafe_url: c.cafe_url || '',
      menu_id: String(c.menu_id), menu_name: c.menu_name || '',
    }));

  const { error } = await supabase.from('naver_cafe_connections')
    .update({ extra_cafes: clean, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: 연결 해제
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  // 행을 지우면 추가 카페·게시판 설정까지 날아가서 재연결 때마다 다시 등록해야 했음 — 토큰만 비움
  await supabase.from('naver_cafe_connections')
    .update({ access_token: '', refresh_token: '', token_expires_at: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
