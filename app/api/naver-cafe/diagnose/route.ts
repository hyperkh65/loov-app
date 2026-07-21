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

  // 1. 토큰 기본 유효성 + 네이버 계정 확인
  let profileOk = false;
  let profileError = '';
  let naverName = '';
  let naverEmail = '';
  try {
    const r = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.json() as { resultcode?: string; message?: string; response?: { name?: string; email?: string; nickname?: string } };
    profileOk = r.ok && body.resultcode === '00';
    naverName = body.response?.name || body.response?.nickname || '';
    naverEmail = body.response?.email || '';
    if (!profileOk) profileError = `HTTP ${r.status} / ${JSON.stringify(body).slice(0, 100)}`;
  } catch (e) {
    profileError = String(e);
  }

  // 2. 카페 실제 글쓰기 테스트 (진단용 임시 글 — 아래서 즉시 삭제 안 함)
  let cafePostStatus = 0;
  let cafePostBody = '';
  if (clubId && menuList?.[0]) {
    const testMenuId = menuList[0].menuId;
    const testForm = new FormData();
    testForm.append('subject', '[진단테스트] 자동삭제');
    testForm.append('content', '진단용 테스트 글입니다. 수동으로 삭제해주세요.');
    testForm.append('openYn', 'N');
    try {
      const r = await fetch(`https://openapi.naver.com/v1/cafe/${clubId}/menu/${testMenuId}/articles`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: testForm,
      });
      cafePostStatus = r.status;
      cafePostBody = (await r.text()).slice(0, 300);
    } catch (e) {
      cafePostBody = String(e);
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
    naver_account: profileOk ? `${naverName} (${naverEmail})` : `❌ ${profileError}`,
    cafe_post_status: cafePostStatus || '(skipped)',
    cafe_post_body: cafePostBody || '(skipped)',
    server_ip: serverIp,
  });
}
