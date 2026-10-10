import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { isOwner } from '@/lib/user-settings';

async function requireOwner() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !isOwner(user.id)) return null;
  return user;
}

// 전체 유저 목록 조회
export async function GET() {
  const user = await requireOwner();
  if (!user) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

  const admin = createAdminClient();

  // auth.users 목록
  const { data: authUsers, error: authError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

  // user_settings 목록
  const { data: settings } = await admin
    .from('user_settings')
    .select('user_id, plan, plan_start_at, plan_expires_at, plan_billing_day, plan_memo, stripe_customer_id, updated_at');

  const settingsMap = Object.fromEntries((settings || []).map(s => [s.user_id, s]));

  const list = authUsers.users
    .filter(u => !isOwner(u.id)) // 대표님 제외
    .map(u => ({
      user_id: u.id,
      email: u.email || '',
      joined_at: u.created_at,
      last_sign_in: u.last_sign_in_at,
      plan: settingsMap[u.id]?.plan || 'free',
      plan_start_at: settingsMap[u.id]?.plan_start_at || null,
      plan_expires_at: settingsMap[u.id]?.plan_expires_at || null,
      plan_billing_day: settingsMap[u.id]?.plan_billing_day || 1,
      plan_memo: settingsMap[u.id]?.plan_memo || '',
      settings_updated_at: settingsMap[u.id]?.updated_at || null,
    }));

  return NextResponse.json({ users: list });
}

// 특정 유저 플랜 업데이트
export async function PATCH(req: NextRequest) {
  const user = await requireOwner();
  if (!user) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

  const body = await req.json() as {
    user_id: string;
    plan?: 'free' | 'pro' | 'business';
    plan_start_at?: string;
    plan_expires_at?: string;
    plan_billing_day?: number;
    plan_memo?: string;
  };

  if (!body.user_id) return NextResponse.json({ error: 'user_id 필요' }, { status: 400 });

  const admin = createAdminClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.plan !== undefined) updates.plan = body.plan;
  if (body.plan_start_at !== undefined) updates.plan_start_at = body.plan_start_at || null;
  if (body.plan_expires_at !== undefined) updates.plan_expires_at = body.plan_expires_at || null;
  if (body.plan_billing_day !== undefined) updates.plan_billing_day = body.plan_billing_day;
  if (body.plan_memo !== undefined) updates.plan_memo = body.plan_memo;

  const { error } = await admin
    .from('user_settings')
    .upsert({ ...updates, user_id: body.user_id }, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
