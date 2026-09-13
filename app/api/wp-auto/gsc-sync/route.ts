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
import { ensureWordPressRewrite } from '@/lib/nginx-rewrite-fix';

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

    let nginxFixNote = '';
    try {
      // WebStation의 일반 PHP 서비스 프로필은 워드프레스 퍼머링크에 필요한
      // nginx try_files 폴백이 기본으로 없어서 홈 화면 말고는(사이트맵 포함) 다
      // 404가 나는 문제가 있음 — 사이트맵 제출 전에 매번 확인/자동수정
      const fqdn = site.site_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const nginxFix = await ensureWordPressRewrite((site.nas as NasKey) || 'hy64', fqdn)
        .catch(e => ({ fixed: false, note: `예외: ${String(e).slice(0, 200)}` }));
      nginxFixNote = `[nginx] ${nginxFix.note}`;

      const accessToken = await getOwnerGoogleAccessToken();
      if (!accessToken) throw new Error('Google 연결 안 됨 (재연결 필요)');

      const target = NAS_TARGETS[(site.nas as NasKey) || 'hy64'];
      const wpDir = `${WEB_ROOT}/${site.subdomain}`;

      await registerSiteWithGoogle(accessToken, site.site_url, async (filename, content) => {
        await target.execWithStdin(`cat > ${wpDir}/${filename}`, content);
      });

      const sitemapUrl = site.sitemap_url || `${site.site_url.replace(/\/$/, '')}/wp-sitemap.xml`;
      await submitSitemapToGoogle(accessToken, site.site_url, sitemapUrl);

      await supabase.from('wordpress_sites').update({
        gsc_status: 'done',
        gsc_registered_at: new Date().toISOString(),
        gsc_error: null,
      }).eq('id', site.id);

      registered++;
      results.push({ site: site.site_url, status: 'registered', error: nginxFixNote });
    } catch (e) {
      // 실패해도 gsc_status는 'pending'으로 유지 — nginx 문제처럼 다음
      // 크론에서 저절로 해결될 수 있는 원인이 많아서 계속 재시도하는 게 나음.
      // 몇 번째 실패인지는 gsc_error에만 남기고 상태는 안 바꿈.
      await supabase.from('wordpress_sites').update({
        gsc_error: `${nginxFixNote} | ${String(e).slice(0, 400)}`,
      }).eq('id', site.id);
      results.push({ site: site.site_url, status: 'retry_pending', error: `${nginxFixNote} | ${String(e).slice(0, 200)}` });
    }
  }

  return NextResponse.json({ ok: true, checked: pending.length, registered, results });
}
