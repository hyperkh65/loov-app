import { createClient, createAdminClient } from '@/lib/supabase-server';

// 등급별 일일 AI 호출 제한
const DAILY_LIMITS: Record<string, number> = {
  free:         20,
  basic:        100,
  starter:      300,
  professional: 1000,
  enterprise:   5000,
  master:       Infinity,
};

// 마스터 도메인 목록
const MASTER_DOMAINS = ['2days.kr', 'loov.co.kr'];

export function isMasterEmail(email: string): boolean {
  return MASTER_DOMAINS.some(d => email.toLowerCase().endsWith(`@${d}`));
}

export async function checkAndIncrementUsage(): Promise<{
  allowed: boolean;
  isMaster: boolean;
  remaining: number;
  limit: number;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { allowed: false, isMaster: false, remaining: 0, limit: 0 };

  // 마스터 이메일이면 즉시 허용
  if (isMasterEmail(user.email || '')) {
    // 그래도 사용량은 기록
    await incrementUsage(user.id).catch(() => null);
    return { allowed: true, isMaster: true, remaining: Infinity, limit: Infinity };
  }

  // DB에서 is_master 체크
  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase
    .from('bossai_profiles')
    .select('is_master, subscription_tier')
    .eq('id', user.id)
    .single();

  const isMaster = profile?.is_master || false;
  if (isMaster) {
    await incrementUsage(user.id).catch(() => null);
    return { allowed: true, isMaster: true, remaining: Infinity, limit: Infinity };
  }

  // 일반 유저: 등급별 제한 확인
  const tier = profile?.subscription_tier || 'free';
  const limit = DAILY_LIMITS[tier] ?? DAILY_LIMITS.free;
  const today = new Date().toISOString().slice(0, 10);

  const { data: usage } = await adminSupabase
    .from('bossai_ai_usage')
    .select('call_count')
    .eq('user_id', user.id)
    .eq('usage_date', today)
    .single();

  const currentCount = usage?.call_count ?? 0;

  if (currentCount >= limit) {
    return { allowed: false, isMaster: false, remaining: 0, limit };
  }

  // 사용량 증가
  await incrementUsage(user.id);
  return { allowed: true, isMaster: false, remaining: limit - currentCount - 1, limit };
}

async function incrementUsage(userId: string) {
  const adminSupabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  await adminSupabase.rpc('increment_ai_usage', { p_user_id: userId, p_date: today });
}
