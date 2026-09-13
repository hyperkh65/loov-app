/**
 * POST /api/wp-auto/gsc-sync
 * wp-auto로 만든 사이트 중 gsc_status='pending'인 것들을 확인해서, 실제로
 * 접속 가능해지면(=WebStation 가상호스트+DNS 수동 연결이 끝나면) Search
 * Console에 자동 등록 + 사이트맵 제출. 10분 크론(rewrite/auto-run)에 얹어서 돎.
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getOwnerGoogleAccessToken } from '@/lib/google-owner-token';
import { registerSiteWithGoogle, submitSitemapToGoogle } from '@/lib/google-search-console';
import { NAS_TARGETS, WEB_ROOT, type NasKey } from '@/lib/nas-targets';

export const maxDuration = 60;

function authOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: '인증 실패' }, { status: 401 });

  const ownerId = process.env.OWNER_USER_ID!;
  const supabase = createAdminClient();

  const { data: pending } = await supabase
    .from('wordpress_sites')
    .select('id, site_url, subdomain, nas, sitemap_url')
    .eq('user_id', ownerId)
    .eq('gsc_status', 'pending');

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, registered: 0 });
  }

  let registered = 0;
  const results: Array<{ site: string; status: string; error?: string }> = [];

  for (const site of pending) {
    if (!(await isReachable(site.site_url))) {
      results.push({ site: site.site_url, status: 'not_live_yet' });
      continue;
    }

    try {
      const accessToken = await getOwnerGoogleAccessToken();
      if (!accessToken) throw new Error('Google 연결 안 됨 (재연결 필요)');

      const target = NAS_TARGETS[(site.nas as NasKey) || 'hy64'];
      const wpDir = `${WEB_ROOT}/${site.subdomain}`;

      await registerSiteWithGoogle(accessToken, site.site_url, async (filename, content) => {
        await target.execWithStdin(`cat > ${wpDir}/${filename}`, content);
      });

      const sitemapUrl = site.sitemap_url || `${site.site_url.replace(/\/$/, '')}/sitemap_index.xml`;
      await submitSitemapToGoogle(accessToken, site.site_url, sitemapUrl);

      await supabase.from('wordpress_sites').update({
        gsc_status: 'done',
        gsc_registered_at: new Date().toISOString(),
        gsc_error: null,
      }).eq('id', site.id);

      registered++;
      results.push({ site: site.site_url, status: 'registered' });
    } catch (e) {
      await supabase.from('wordpress_sites').update({
        gsc_status: 'failed',
        gsc_error: String(e).slice(0, 500),
      }).eq('id', site.id);
      results.push({ site: site.site_url, status: 'failed', error: String(e).slice(0, 200) });
    }
  }

  return NextResponse.json({ ok: true, checked: pending.length, registered, results });
}
