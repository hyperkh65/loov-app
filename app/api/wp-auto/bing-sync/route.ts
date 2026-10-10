/**
 * POST /api/wp-auto/bing-sync
 * 보유 사이트를 Bing Webmaster Tools에 등록 + 사이트맵 제출.
 * gsc-sync와 같은 패턴 — 아직 등록 안 된(bing_status IS NULL 또는 'pending')
 * 활성 사이트만 처리하고, 결과를 bing_status/bing_error에 기록한다.
 * Auth: Bearer CRON_SECRET (크론) 또는 대시보드 로그인 세션
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { bingAddSite, bingSubmitSitemap, bingGetUserSites } from '@/lib/bing-webmaster';

export const maxDuration = 120;

function cronAuthOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!cronAuthOk(req)) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: '인증 실패' }, { status: 401 });
  }

  const apiKey = await getSetting('BING_API_KEY');
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: 'BING_API_KEY가 설정되지 않았습니다. Bing Webmaster Tools → 설정 → API 액세스에서 키를 발급받아 앱 설정에 저장하세요.',
    }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: sites } = await supabase
    .from('wordpress_sites')
    .select('id, site_url, sitemap_url, bing_status')
    .eq('user_id', process.env.OWNER_USER_ID!)
    .eq('is_active', true);

  const targets = (sites || []).filter((s) => !s.bing_status || s.bing_status === 'pending' || s.bing_status === 'failed');
  if (targets.length === 0) return NextResponse.json({ ok: true, checked: 0, registered: 0 });

  // 이미 빙에 있는 사이트는 AddSite가 오류를 내므로 먼저 목록을 받아 비교
  let existing: string[] = [];
  try {
    existing = (await bingGetUserSites(apiKey)).map((s) => (s.Url || '').replace(/\/+$/, ''));
  } catch { /* 목록 조회 실패해도 AddSite 시도는 해본다 */ }

  let registered = 0;
  const results: Array<{ site: string; status: string; error?: string }> = [];

  for (const site of targets) {
    const clean = site.site_url.replace(/\/+$/, '');
    try {
      if (!existing.includes(clean)) {
        await bingAddSite(apiKey, clean);
      }
      // 사이트맵은 있으면 제출(없으면 워드프레스 기본 경로로 시도)
      const sitemap = site.sitemap_url || `${clean}/wp-sitemap.xml`;
      try {
        await bingSubmitSitemap(apiKey, clean, sitemap);
      } catch (e) {
        // 사이트맵 제출 실패는 등록 자체를 실패로 보지 않는다(미인증 상태면 거부될 수 있음)
        results.push({ site: clean, status: 'added(사이트맵 제출 실패)', error: String(e).slice(0, 150) });
        await supabase.from('wordpress_sites')
          .update({ bing_status: 'added', bing_error: String(e).slice(0, 300), bing_registered_at: new Date().toISOString() })
          .eq('id', site.id);
        registered++;
        continue;
      }

      await supabase.from('wordpress_sites')
        .update({ bing_status: 'done', bing_error: null, bing_registered_at: new Date().toISOString() })
        .eq('id', site.id);
      results.push({ site: clean, status: 'done' });
      registered++;
    } catch (e) {
      const msg = String(e).slice(0, 300);
      await supabase.from('wordpress_sites')
        .update({ bing_status: 'failed', bing_error: msg })
        .eq('id', site.id);
      results.push({ site: clean, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({ ok: true, checked: targets.length, registered, results });
}
