import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase
    .from('sns_connections')
    .select('platform, platform_username, platform_display_name, platform_avatar, is_active, updated_at')
    .eq('user_id', user.id);

  return NextResponse.json(data || []);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { platform } = await req.json();
  await supabase.from('sns_connections').delete().eq('user_id', user.id).eq('platform', platform);

  return NextResponse.json({ success: true });
}
