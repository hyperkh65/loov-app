import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// GET: 저장된 메뉴 목록 반환
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data: conn } = await supabase.from('naver_cafe_connections')
    .select('menu_list')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({ menus: conn?.menu_list || [] });
}

// POST: 메뉴 목록 수동 저장 (Naver API에 메뉴 목록 조회 기능 없음)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { menus } = await req.json();

  const { error } = await supabase.from('naver_cafe_connections').update({
    menu_list: menus,
    updated_at: new Date().toISOString(),
  }).eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, menus });
}
