import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { isMasterEmail } from '@/lib/ai-usage';

// 현재 유저의 마스터 상태 + 사용량 조회
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminSupabase = createAdminClient();

  const { data: profile } = await adminSupabase
    .from('bossai_profiles')
    .select('is_master, subscription_tier')
    .eq('id', user.id)
    .single();

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await adminSupabase
    .from('bossai_ai_usage')
    .select('call_count, usage_date')
    .eq('user_id', user.id)
    .eq('usage_date', today)
    .single();

  const isMaster = profile?.is_master || isMasterEmail(user.email || '');

  return NextResponse.json({
    email: user.email,
    isMaster,
    isMasterByEmail: isMasterEmail(user.email || ''),
    tier: profile?.subscription_tier || 'free',
    todayUsage: usage?.call_count ?? 0,
    unlimited: isMaster,
  });
}

// 마스터 권한 부여/해제 (마스터만 가능)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 요청자가 마스터인지 확인
  if (!isMasterEmail(user.email || '')) {
    const adminSupabase = createAdminClient();
    const { data: profile } = await adminSupabase
      .from('bossai_profiles')
      .select('is_master')
      .eq('id', user.id)
      .single();
    if (!profile?.is_master) {
      return NextResponse.json({ error: '마스터 권한이 필요합니다.' }, { status: 403 });
    }
  }

  const { targetEmail, grant } = await req.json() as { targetEmail: string; grant: boolean };
  const adminSupabase = createAdminClient();

  const { data: targetUser } = await adminSupabase.auth.admin.listUsers();
  const target = targetUser?.users?.find(u => u.email === targetEmail);
  if (!target) return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 });

  await adminSupabase
    .from('bossai_profiles')
    .update({ is_master: grant })
    .eq('id', target.id);

  return NextResponse.json({ ok: true, email: targetEmail, isMaster: grant });
}
