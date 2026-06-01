import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { isInternalRequest } from '@/lib/internal-auth';

export async function GET(req: NextRequest) {
  // 내부 요청(텔레그램 봇 등)은 인증 없이 전체 조회
  if (isInternalRequest(req)) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('sns_connections')
      .select('platform, platform_username, platform_display_name, platform_avatar, is_active, updated_at');
    return NextResponse.json(data || []);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase
    .from('sns_connections')
    .select('platform, platform_user_id, platform_username, platform_display_name, platform_avatar, is_active, updated_at')
    .eq('user_id', user.id);

  return NextResponse.json(data || []);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { platform, platform_user_id } = await req.json();
  let query = supabase.from('sns_connections').delete().eq('user_id', user.id).eq('platform', platform);
  if (platform_user_id) query = query.eq('platform_user_id', platform_user_id);
  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
