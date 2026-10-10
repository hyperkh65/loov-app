/**
 * POST /api/wp-auto/analytics-install
 * wp-auto로 만든 모든 사이트(NAS)에 GA4 + 방문/체류시간 비콘 mu-plugin을 설치한다. 재실행해도 덮어쓰기라 안전.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { NAS_TARGETS, WEB_ROOT, type NasKey } from '@/lib/nas-targets';
import { analyticsMuPlugin } from '@/lib/wp-analytics';

export async function POST() {
  const { data: sites } = await createAdminClient()
    .from('wordpress_sites').select('site_url, nas, subdomain, web_dir');
  const code = analyticsMuPlugin();
  const results: { site: string; ok: boolean; error?: string }[] = [];
  for (const s of sites || []) {
    const dir = s.web_dir || s.subdomain;
    if (!dir) { results.push({ site: s.site_url, ok: false, error: 'NAS 사이트 아님(건너뜀)' }); continue; }
    const target = NAS_TARGETS[(s.nas as NasKey) || 'hy64'];
    const wpDir = dir.startsWith('/') ? dir : `${WEB_ROOT}/${dir}`;
    try {
      await target.exec(`mkdir -p ${wpDir}/wp-content/mu-plugins`);
      const w = await target.execWithStdin(`cat > ${wpDir}/wp-content/mu-plugins/loov-analytics.php`, code);
      if (w.code) throw new Error(w.stderr || `exit ${w.code}`);
      results.push({ site: s.site_url, ok: true });
    } catch (e) { results.push({ site: s.site_url, ok: false, error: String(e).slice(0, 120) }); }
  }
  return NextResponse.json({ results });
}
