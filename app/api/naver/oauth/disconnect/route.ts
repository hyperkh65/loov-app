export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  await supabase.from('naver_connections').update({
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
  }).eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
