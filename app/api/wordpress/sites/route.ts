import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  void req;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase
    .from('wordpress_sites')
    .select('id, site_name, site_url, wp_username, is_active, created_at')
    .eq('user_id', user.id)
    .order('created_at');

  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { site_name, site_url, wp_username, app_password } = await req.json();
  if (!site_name || !site_url || !wp_username || !app_password)
    return NextResponse.json({ error: '모든 필드를 입력하세요' }, { status: 400 });

  // WP 연결 테스트
  const cleanUrl = site_url.replace(/\/$/, '');
  try {
    const auth = 'Basic ' + Buffer.from(`${wp_username}:${app_password}`).toString('base64');
    const test = await fetch(`${cleanUrl}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: auth },
    });
    if (!test.ok) return NextResponse.json({ error: `WP 연결 실패 (${test.status}) - URL·계정·앱비밀번호 확인` }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'WP 사이트에 연결할 수 없습니다' }, { status: 400 });
  }

  const { data, error } = await supabase.from('wordpress_sites').insert({
    user_id: user.id,
    site_name,
    site_url: cleanUrl,
    wp_username,
    app_password,
  }).select('id, site_name, site_url, wp_username, is_active, created_at').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { id } = await req.json();
  await supabase.from('wordpress_sites').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
