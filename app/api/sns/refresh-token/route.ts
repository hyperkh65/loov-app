import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: conn } = await supabase
    .from('sns_connections')
    .select('access_token, platform')
    .eq('user_id', user.id)
    .eq('platform', 'instagram')
    .eq('is_active', true)
    .single();

  if (!conn) return NextResponse.json({ error: 'Instagram 미연결' }, { status: 400 });

  try {
    const res = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${conn.access_token}`
    );
    const data = await res.json();

    if (!res.ok || !data.access_token) {
      return NextResponse.json(
        { error: '토큰 갱신 실패 — Instagram 재연결이 필요합니다.', detail: data },
        { status: 400 }
      );
    }

    await supabase
      .from('sns_connections')
      .update({ access_token: data.access_token, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('platform', 'instagram');

    return NextResponse.json({
      ok: true,
      expires_in: data.expires_in,
      token_type: data.token_type,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
