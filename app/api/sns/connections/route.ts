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
    .select('platform, platform_user_id, platform_username, platform_display_name, platform_avatar, is_active, updated_at, extra')
    .eq('user_id', user.id);

  // extra.extra_accounts 확장 — 마이그레이션 없이 다계정 지원
  type ExtraAccount = {
    platform_user_id: string; platform_username: string; platform_display_name: string;
    platform_avatar?: string | null; is_active: boolean; caption_language?: string;
  };
  const expanded: unknown[] = [];
  for (const row of (data || [])) {
    const { extra_accounts: _, ...mainExtra } = (row.extra as Record<string, unknown> & { extra_accounts?: unknown[] }) || {};
    expanded.push({ ...row, extra: mainExtra });
    const extraAccounts: ExtraAccount[] = Array.isArray((row.extra as Record<string, unknown>)?.extra_accounts)
      ? ((row.extra as Record<string, unknown>).extra_accounts as ExtraAccount[]) : [];
    for (const acc of extraAccounts) {
      if (!acc.is_active) continue;
      expanded.push({
        platform: row.platform,
        platform_user_id: acc.platform_user_id,
        platform_username: acc.platform_username,
        platform_display_name: acc.platform_display_name,
        platform_avatar: acc.platform_avatar || null,
        is_active: true,
        updated_at: row.updated_at,
        extra: { caption_language: acc.caption_language || 'ko' },
        _extra_account: true,
      });
    }
  }
  return NextResponse.json(expanded);
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { platform, platform_user_id, caption_language } = await req.json();

  const { data: row } = await supabase
    .from('sns_connections')
    .select('platform_user_id, extra')
    .eq('user_id', user.id)
    .eq('platform', platform)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: '연결 없음' }, { status: 404 });

  if (row.platform_user_id === platform_user_id) {
    // 기본 계정 언어 변경
    const prevExtra = (row.extra as Record<string, unknown>) || {};
    const { error } = await supabase.from('sns_connections')
      .update({ extra: { ...prevExtra, caption_language } })
      .eq('user_id', user.id).eq('platform', platform);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // extra_accounts에서 해당 계정 언어 변경
    type ExtraAccount = Record<string, unknown>;
    const prevExtra = (row.extra as Record<string, unknown>) || {};
    const extraAccounts: ExtraAccount[] = Array.isArray(prevExtra.extra_accounts)
      ? (prevExtra.extra_accounts as ExtraAccount[]) : [];
    const idx = extraAccounts.findIndex((a) => a.platform_user_id === platform_user_id);
    if (idx >= 0) extraAccounts[idx] = { ...extraAccounts[idx], caption_language };
    const { error } = await supabase.from('sns_connections')
      .update({ extra: { ...prevExtra, extra_accounts: extraAccounts } })
      .eq('user_id', user.id).eq('platform', platform);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { platform, platform_user_id } = await req.json();

  if (!platform_user_id) {
    // platform 전체 삭제
    const { error } = await supabase.from('sns_connections').delete()
      .eq('user_id', user.id).eq('platform', platform);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const { data: row } = await supabase
    .from('sns_connections')
    .select('platform_user_id, extra')
    .eq('user_id', user.id).eq('platform', platform)
    .maybeSingle();

  if (!row) return NextResponse.json({ success: true });

  if (row.platform_user_id === platform_user_id) {
    // 기본 계정 삭제 — 행 전체 삭제
    const { error } = await supabase.from('sns_connections').delete()
      .eq('user_id', user.id).eq('platform', platform);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // extra_accounts에서 해당 계정 제거
    type ExtraAccount = Record<string, unknown>;
    const prevExtra = (row.extra as Record<string, unknown>) || {};
    const extraAccounts: ExtraAccount[] = Array.isArray(prevExtra.extra_accounts)
      ? (prevExtra.extra_accounts as ExtraAccount[]) : [];
    const filtered = extraAccounts.filter((a) => a.platform_user_id !== platform_user_id);
    const { error } = await supabase.from('sns_connections')
      .update({ extra: { ...prevExtra, extra_accounts: filtered } })
      .eq('user_id', user.id).eq('platform', platform);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
