import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('bossai_figma_connections')
    .select('figma_name, figma_email, figma_img_url, is_connected, created_at')
    .eq('user_id', user.id)
    .single();

  if (!data) return NextResponse.json({ connected: false });
  return NextResponse.json({ connected: true, ...data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accessToken } = await req.json();
  if (!accessToken?.trim()) return NextResponse.json({ error: 'Access Token이 필요합니다' }, { status: 400 });

  // Figma API로 토큰 검증
  const figmaRes = await fetch('https://api.figma.com/v1/me', {
    headers: { 'X-Figma-Token': accessToken },
  });
  if (!figmaRes.ok) {
    return NextResponse.json({ error: '유효하지 않은 Figma Access Token입니다' }, { status: 400 });
  }
  const me = await figmaRes.json() as { id: string; handle: string; email: string; img_url: string };

  await supabase.from('bossai_figma_connections').upsert({
    user_id: user.id,
    access_token: accessToken,
    figma_name: me.handle || '',
    figma_email: me.email || '',
    figma_img_url: me.img_url || '',
    is_connected: true,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ connected: true, handle: me.handle, email: me.email, imgUrl: me.img_url });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await supabase.from('bossai_figma_connections').delete().eq('user_id', user.id);
  return NextResponse.json({ disconnected: true });
}
