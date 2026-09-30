/**
 * 쿠팡/토스/블로그 크로스포스팅이 서로 조율 없이 각자 @2dayskr 계열 계정에
 * 발행해서 같은 계정에 글이 몰리던 문제 — 플랫폼별로 실제 있는 자매 계정들을
 * 풀로 묶어 "주 타겟 계정 우선, 그다음 가장 오래 전에 쓴 계정" 순으로 하나
 * 골라주고, 전부 최근에 썼으면(최소 간격 미달) 이번 회차는 건너뛰게 한다.
 * (사용자 확정: @2days.kr이 주 타겟, 계정당 최소 30~40분 간격, 무신사/아고다
 * 전용 광고 계정은 이 로테이션과 무관.)
 */
import { createAdminClient } from '@/lib/supabase-server';

type AdminClient = ReturnType<typeof createAdminClient>;
export type SnsGroup = 'default' | 'aboda_miracool';
type RotatedPlatform = 'threads' | 'instagram';

// platform_user_id로 매칭한다 — platform_username은 "@2days.kr" vs "@2dayskr"처럼
// 점 유무만 다른 표기가 섞여있어 문자열 매칭이 실수로 다른 계정을 가리키기 쉬움
// (실사용 중 blog-runner.ts의 threadsAccountFor()가 실제로는 @2days.kr이 아니라
// 표기가 다른 별개 계정 @2dayskr를 가리키고 있었던 걸 확인).
const ROTATION_POOL: Record<SnsGroup, Partial<Record<RotatedPlatform, string[]>>> = {
  default: {
    threads: ['25873039292318366', '25203934249239577', '27198401606479414'], // @2days.kr(주 타겟) → @2dayskr → @2dayskr_korea
    instagram: ['34489947500650071', '27094702240139938'], // @2dayskr(주 타겟) → @2dayskr_korea
  },
  aboda_miracool: {
    threads: ['27529465156685675'], // @aboda_miracool — 전용 계정 1개뿐, 사실상 로테이션 없이 이거 하나만
    instagram: ['27282443521390270'], // @aboda_miracool
  },
};

const MIN_GAP_MS = 35 * 60 * 1000; // 30~40분 중간값

export function snsGroupFor(siteUrl: string): SnsGroup {
  return (siteUrl.includes('aboda.kr') || siteUrl.includes('miracool.co.kr')) ? 'aboda_miracool' : 'default';
}

interface SnsConn { platform: string; platform_user_id: string; access_token: string }

/**
 * 로테이션 풀에서 계정 하나를 고른다. 풀이 없는 그룹(aboda_miracool 등)은
 * 연결된 계정을 그대로 반환(기존 동작 유지). 후보 전부 MIN_GAP 안에 이미
 * 올렸으면 null(이번 회차는 이 플랫폼에 스킵).
 */
export async function pickRotatedAccount(
  admin: AdminClient,
  group: SnsGroup,
  platform: RotatedPlatform,
  connections: SnsConn[],
): Promise<SnsConn | null> {
  const pool = ROTATION_POOL[group][platform];
  if (!pool) return connections.find(c => c.platform === platform) || null;

  const available = pool
    .map(id => connections.find(c => c.platform === platform && c.platform_user_id === id))
    .filter((c): c is SnsConn => !!c);
  if (!available.length) return null;

  const { data: recent } = await admin
    .from('bossai_sns_post_log')
    .select('platform_user_id, posted_at')
    .eq('platform', platform)
    .in('platform_user_id', pool)
    .order('posted_at', { ascending: false })
    .limit(pool.length * 5);

  const lastPostedAt = new Map<string, number>();
  for (const r of (recent || []) as Array<{ platform_user_id: string; posted_at: string }>) {
    if (!lastPostedAt.has(r.platform_user_id)) lastPostedAt.set(r.platform_user_id, new Date(r.posted_at).getTime());
  }

  const now = Date.now();
  const gapOf = (id: string) => now - (lastPostedAt.get(id) || 0);

  // 주 타겟(pool[0])이 간격 조건을 만족하면 최우선
  const primary = available.find(c => c.platform_user_id === pool[0]);
  if (primary && gapOf(pool[0]) >= MIN_GAP_MS) return primary;

  // 나머지는 "가장 오래 전에 올린" 순으로 최초 조건 만족하는 것
  const sorted = [...available].sort((a, b) => gapOf(b.platform_user_id) - gapOf(a.platform_user_id));
  return sorted.find(c => gapOf(c.platform_user_id) >= MIN_GAP_MS) || null;
}

export async function logSnsPost(admin: AdminClient, platform: string, platformUserId: string): Promise<void> {
  try {
    await admin.from('bossai_sns_post_log').insert({ platform, platform_user_id: platformUserId });
  } catch { /* 로그 실패는 무시 — 다음 판단이 조금 부정확해질 뿐 발행 자체엔 영향 없음 */ }
}
