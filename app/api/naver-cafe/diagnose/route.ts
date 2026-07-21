import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data: conn } = await supabase.from('naver_cafe_connections')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!conn) return NextResponse.json({ error: '연결 없음' }, { status: 400 });

  const token = conn.access_token as string;
  const clubId = conn.club_id as string;
  const menuList = conn.menu_list as { menuId: number; menuName: string }[] | null;

  // 1. 토큰 기본 유효성 (네이버 프로필)
  let profileOk = false;
  let profileError = '';
  try {
    const r = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.json() as { resultcode?: string; message?: string };
    profileOk = r.ok && body.resultcode === '00';
    if (!profileOk) profileError = `HTTP ${r.status} / ${JSON.stringify(body).slice(0, 100)}`;
  } catch (e) {
    profileError = String(e);
  }

  // 2. 카페 API 접근 시도 (카페 게시판 목록 GET — 실제 글 쓰기는 안 함)
  let cafeApiStatus = 0;
  let cafeApiBody = '';
  if (clubId) {
    try {
      const r = await fetch(`https://openapi.naver.com/v1/cafe/${clubId}/members/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      cafeApiStatus = r.status;
      cafeApiBody = (await r.text()).slice(0, 200);
    } catch (e) {
      cafeApiBody = String(e);
    }
  }

  // 3. 서버 발신 IP 확인
  let serverIp = '';
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const d = await r.json() as { ip?: string };
    serverIp = d.ip || '';
  } catch {}

  return NextResponse.json({
    club_id: clubId || '(없음)',
    menu_count: menuList?.length ?? 0,
    menus: menuList?.map(m => `${m.menuId}: ${m.menuName}`) || [],
    token_expires_at: conn.token_expires_at,
    token_prefix: token ? token.slice(0, 6) + '...' : '(없음)',
    profile_api: profileOk ? '✅ 정상' : `❌ ${profileError}`,
    cafe_api_status: cafeApiStatus || '(skipped — club_id 없음)',
    cafe_api_body: cafeApiBody || '(skipped)',
    server_ip: serverIp,
  });
}
