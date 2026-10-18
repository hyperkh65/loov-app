/**
 * GET  /api/wp-auto/adsense-guard  — 대상(미라쿨 계열) 사이트 목록만 확인(변경 없음)
 * POST /api/wp-auto/adsense-guard  — 미라쿨 계열 NAS 사이트에 AdSense 가드 mu-plugin 설치(덮어쓰기라 재실행 안전)
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { NAS_TARGETS, WEB_ROOT, type NasKey } from '@/lib/nas-targets';
import { adsenseGuardMuPlugin } from '@/lib/wp-adsense-guard';

async function targets() {
  const { data } = await createAdminClient().from('wordpress_sites').select('site_url, nas, subdomain, web_dir');
  return (data || []).filter(s => (s.site_url || '').includes('miracool.co.kr'));
}

export async function GET() {
  return NextResponse.json({ sites: (await targets()).map(s => s.site_url) });
}

export async function POST() {
  const code = adsenseGuardMuPlugin();
  const results: { site: string; ok: boolean; error?: string }[] = [];
  for (const s of await targets()) {
    const dir = s.web_dir || s.subdomain;
    if (!dir) { results.push({ site: s.site_url, ok: false, error: 'NAS 사이트 아님(건너뜀)' }); continue; }
    const target = NAS_TARGETS[(s.nas as NasKey) || 'hy64'];
    const wpDir = dir.startsWith('/') ? dir : `${WEB_ROOT}/${dir}`;
    try {
      await target.exec(`mkdir -p ${wpDir}/wp-content/mu-plugins`);
      const w = await target.execWithStdin(`cat > ${wpDir}/wp-content/mu-plugins/loov-adsense-guard.php`, code);
      if (w.code) throw new Error(w.stderr || `exit ${w.code}`);
      results.push({ site: s.site_url, ok: true });
    } catch (e) { results.push({ site: s.site_url, ok: false, error: String(e).slice(0, 120) }); }
  }
  return NextResponse.json({ results });
}
