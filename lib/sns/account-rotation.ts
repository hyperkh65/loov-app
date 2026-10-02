/**
 * 쿠팡/토스/블로그 크로스포스팅이 서로 조율 없이 각자 @2dayskr 계열 계정에
 * 발행해서 같은 계정에 글이 몰리던 문제 — 플랫폼별로 실제 있는 자매 계정들을
 * 풀로 묶어 "주 타겟 계정 우선, 그다음 가장 오래 전에 쓴 계정" 순으로 하나
 * 골라주고, 전부 최근에 썼으면(최소 간격 미달) 이번 회차는 건너뛰게 한다.
 * (사용자 확정: @2days.kr이 주 타겟, 계정당 최소 30~40분 간격, 무신사/아고다
 * 전용 광고 계정은 이 로테이션과 무관.)
 *
 * 2026-09-30 수정: 처음엔 쿠팡/토스 광고도 @2dayskr/@2dayskr_korea로
 * 로테이션시켰는데, lib/rewrite-publish.ts에 이미 더 예전부터 있던 규칙
 * (SNS_ACCOUNT_ROUTING_BY_SOURCE 주석, 2026-09-23/24)과 충돌함 — 그 규칙은
 * "@2dayskr_korea/@aboda_miracool은 니치 안 맞는 상품광고를 절대 안 섞는
 * 일반 콘텐츠 전용 계정"으로 명시적으로 분리해둔 것이었는데, 내 로테이션이
 * 그걸 모르고 쿠팡 상품광고를 @2dayskr_korea에 실제로 발행해버림(실사용 확인:
 * "냉장고 문 여는 순간..." 쿠팡 광고가 @2dayskr_korea에 게시됨). 그래서
 * "광고성 콘텐츠(쿠팡/토스)"와 "블로그 콘텐츠(blog_auto 크로스포스팅)"를
 * 분리 — 광고는 주 타겟 계정 하나만 쓰고(간격 안 되면 그냥 스킵, 다른 계정으로
 * 안 넘어감), 블로그 크로스포스팅만 기존 자매 계정 로테이션을 그대로 씀
 * (rewrite-publish.ts가 이미 그 계정들에 일반 블로그 콘텐츠를 문제없이
 * 섞어왔던 전례와 동일한 성격이라 안전).
 */
import { createAdminClient } from '@/lib/supabase-server';

type AdminClient = ReturnType<typeof createAdminClient>;
export type SnsGroup = 'default' | 'aboda_miracool' | 'ads_default' | 'twodays' | 'aboda';
type RotatedPlatform = 'threads' | 'instagram';

// platform_user_id로 매칭한다 — platform_username은 "@2days.kr" vs "@2dayskr"처럼
// 점 유무만 다른 표기가 섞여있어 문자열 매칭이 실수로 다른 계정을 가리키기 쉬움
// (실사용 중 blog-runner.ts의 threadsAccountFor()가 실제로는 @2days.kr이 아니라
// 표기가 다른 별개 계정 @2dayskr를 가리키고 있었던 걸 확인).
const ROTATION_POOL: Record<SnsGroup, Partial<Record<RotatedPlatform, string[]>>> = {
  default: {
    threads: ['25873039292318366', '25203934249239577'], // @2days.kr(주 타겟) → @2dayskr (@2dayskr_korea는 aboda 전용으로 분리, 2026-10-01)
    instagram: ['34489947500650071'], // @2dayskr
  },
  // 쿠팡/토스 상품광고 전용 — @2days.kr 하나만, 로테이션 없이 간격만 체크
  // (@2dayskr_korea/@aboda_miracool에 광고 섞임 방지, 위 코멘트 참고)
  ads_default: {
    threads: ['25873039292318366'], // @2days.kr
    instagram: ['27475655598789002'], // @2days.kr 인스타(2026-10-01 연결) — 스레드 @2days.kr과 짝
  },
  // 2days.kr 사이트 전용(사용자 확정 2026-10-01) — @2dayskr 스레드/인스타 고정, 로테이션 없음.
  // 이 계정이 메인이라 간격 체크도 면제(MIN_GAP 0) — 같은 계정을 쓰는 다른 그룹이 로그를 보고 양보함.
  twodays: {
    threads: ['25203934249239577'], // @2dayskr
    instagram: ['34489947500650071'], // @2dayskr
  },
  // aboda.kr 전용 — @2dayskr_korea 고정 (사용자 확정 2026-10-01)
  aboda: {
    threads: ['27198401606479414'], // @2dayskr_korea
    instagram: ['27094702240139938'], // @2dayskr_korea
  },
  aboda_miracool: {
    threads: ['27529465156685675'], // @aboda_miracool — 전용 계정 1개뿐, 사실상 로테이션 없이 이거 하나만
    instagram: ['27282443521390270'], // @aboda_miracool
  },
};

// 전부 20분으로 단축(2026-10-01 사용자 확정) — 기존 30~40분 중간값(35분)에서
// 앞당김. 그룹별로 다르게 둘 수 있게 Record로 유지.
const MIN_GAP_MS: Record<SnsGroup, number> = {
  // 2026-10-03 사용자 확정: 모든 계정 30분 단위
  default: 30 * 60 * 1000,
  ads_default: 30 * 60 * 1000,
  aboda_miracool: 30 * 60 * 1000,
  aboda: 30 * 60 * 1000,
  twodays: 30 * 60 * 1000,
};

export function snsGroupFor(siteUrl: string): SnsGroup {
  if (/\/\/(www\.)?2days\.kr(\/|$)/.test(siteUrl)) return 'twodays';
  if (siteUrl.includes('aboda.kr')) return 'aboda';
  return siteUrl.includes('miracool.co.kr') ? 'aboda_miracool' : 'default';
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

  const minGap = MIN_GAP_MS[group];

  // 주 타겟(pool[0])이 간격 조건을 만족하면 최우선
  const primary = available.find(c => c.platform_user_id === pool[0]);
  if (primary && gapOf(pool[0]) >= minGap) return primary;

  // 나머지는 "가장 오래 전에 올린" 순으로 최초 조건 만족하는 것
  const sorted = [...available].sort((a, b) => gapOf(b.platform_user_id) - gapOf(a.platform_user_id));
  return sorted.find(c => gapOf(c.platform_user_id) >= minGap) || null;
}

export async function logSnsPost(admin: AdminClient, platform: string, platformUserId: string): Promise<void> {
  try {
    await admin.from('bossai_sns_post_log').insert({ platform, platform_user_id: platformUserId });
  } catch { /* 로그 실패는 무시 — 다음 판단이 조금 부정확해질 뿐 발행 자체엔 영향 없음 */ }
}
