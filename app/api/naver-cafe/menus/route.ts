import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data: conn } = await supabase.from('naver_cafe_connections')
    .select('club_id, access_token, token_expires_at')
    .eq('user_id', user.id)
    .single();

  if (!conn?.access_token) return NextResponse.json({ error: '카페 OAuth 연결 필요' }, { status: 400 });
  if (!conn.club_id) return NextResponse.json({ error: '카페 ID 미설정' }, { status: 400 });

  const res = await fetch(`https://openapi.naver.com/v1/cafe/${conn.club_id}/menu/list`, {
    headers: { Authorization: `Bearer ${conn.access_token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `메뉴 조회 실패: ${res.status} ${text.slice(0, 200)}` }, { status: 400 });
  }

  const data = await res.json() as {
    message?: {
      result?: {
        menuList?: { menuId: number; menuName: string; menuType: string }[];
      };
    };
  };
  const menus = data.message?.result?.menuList || [];

  // DB에 저장
  await supabase.from('naver_cafe_connections').update({
    menu_list: menus,
    updated_at: new Date().toISOString(),
  }).eq('user_id', user.id);

  return NextResponse.json({ menus });
}
