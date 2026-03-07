import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase
    .from('naver_connections')
    .select('blog_id, blog_name, nid_aut, nid_ses, categories, last_tested_at, access_token, token_expires_at')
    .eq('user_id', user.id)
    .single();

  if (!data) return NextResponse.json(null);

  const oauthConnected = !!(data.access_token && data.token_expires_at &&
    new Date(data.token_expires_at as string) > new Date());

  // access_token은 클라이언트에 노출하지 않음
  const { access_token: _, token_expires_at, ...safe } = data as typeof data & { access_token?: string; token_expires_at?: string };
  return NextResponse.json({ ...safe, oauth_connected: oauthConnected, token_expires_at });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { blog_id, blog_name, nid_aut, nid_ses } = await req.json();
  if (!blog_id?.trim()) return NextResponse.json({ error: '블로그 ID가 필요합니다' }, { status: 400 });

  const { data, error } = await supabase
    .from('naver_connections')
    .upsert({
      user_id: user.id,
      blog_id: blog_id.trim().toLowerCase(),
      blog_name: blog_name?.trim() || blog_id.trim(),
      nid_aut: nid_aut?.trim() || '',
      nid_ses: nid_ses?.trim() || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  await supabase.from('naver_connections').delete().eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
