import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { isInternalRequest } from '@/lib/internal-auth';
import { refreshTwitterToken } from '@/lib/sns/platforms-server';

export const maxDuration = 120;

const URLS: Record<string, string> = {
  threads: 'https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token',
  instagram: 'https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token',
};
const REFRESH_WITHIN_MS = 20 * 24 * 3600 * 1000;

async function refresh(platform: string, token: string): Promise<{ token: string; expires: string } | { error: string }> {
  try {
    const res = await fetch(`${URLS[platform]}&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15_000) });
    const d = await res.json().catch(() => null);
    if (!res.ok || !d?.access_token) return { error: String(d?.error?.message || `HTTP ${res.status}`).slice(0, 200) };
    return { token: d.access_token, expires: new Date(Date.now() + (d.expires_in || 5_184_000) * 1000).toISOString() };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

// 스레드/인스타 장기토큰(60일)은 만료 20일 전부터, X(2시간 토큰+회전 refresh_token)는 매 회차 갱신.
// 이미 만료된 토큰은 갱신 불가 → 실패 로그에 남겨 재연결 안내.
export async function POST(req: NextRequest) {
  if (!isInternalRequest(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: conns } = await admin.from('sns_connections')
    .select('id, user_id, platform, platform_user_id, access_token, token_expires_at, extra')
    .in('platform', ['threads', 'instagram']).eq('is_active', true);

  const due = (exp?: string | null) => !exp || new Date(exp).getTime() < Date.now() + REFRESH_WITHIN_MS;
  const summary = { refreshed: 0, failed: 0, skipped: 0 };
  const fail = async (userId: string, platform: string, id: string, msg: string) => {
    summary.failed++;
    await admin.from('sns_post_logs').insert({ user_id: userId, platform, status: 'failed', error_message: `[토큰 자동갱신] ${id}: ${msg} — 재연결 필요할 수 있음` }).then(() => {}, () => {});
  };

  for (const c of conns || []) {
    if (c.access_token && due(c.token_expires_at)) {
      const r = await refresh(c.platform, c.access_token);
      if ('error' in r) await fail(c.user_id, c.platform, c.platform_user_id, r.error);
      else {
        summary.refreshed++;
        await admin.from('sns_connections').update({ access_token: r.token, token_expires_at: r.expires }).eq('id', c.id);
      }
    } else summary.skipped++;

    const extra = c.extra as { extra_accounts?: { platform_user_id: string; access_token: string; token_expires_at?: string; is_active?: boolean }[] } | null;
    if (c.platform === 'threads' && extra?.extra_accounts?.length) {
      let changed = false;
      for (const a of extra.extra_accounts) {
        if (a.is_active === false || !a.access_token || !due(a.token_expires_at)) continue;
        const r = await refresh('threads', a.access_token);
        if ('error' in r) await fail(c.user_id, 'threads', a.platform_user_id, r.error);
        else { a.access_token = r.token; a.token_expires_at = r.expires; summary.refreshed++; changed = true; }
      }
      if (changed) await admin.from('sns_connections').update({ extra }).eq('id', c.id);
    }
  }

  const { data: tw } = await admin.from('sns_connections')
    .select('user_id, platform_user_id, refresh_token').eq('platform', 'twitter').eq('is_active', true);
  for (const c of tw || []) {
    if (!c.refresh_token) { summary.skipped++; continue; }
    const ok = await refreshTwitterToken(c.platform_user_id, c.refresh_token).catch(() => null);
    if (ok) summary.refreshed++; else await fail(c.user_id, 'twitter', c.platform_user_id, '갱신 실패');
  }
  return NextResponse.json(summary);
}
