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

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get('ls')) {
    const out: Record<string, string[]> = {};
    for (const k of Object.keys(NAS_TARGETS) as NasKey[]) {
      try { out[k] = (await NAS_TARGETS[k].exec(`ls -d ${WEB_ROOT}/*/wp-config.php ${WEB_ROOT}/*/*/wp-config.php 2>/dev/null`)).stdout.split('\n').filter(Boolean); } catch (e) { out[k] = [String(e).slice(0, 80)]; }
    }
    return NextResponse.json(out);
  }
  return NextResponse.json({ sites: (await targets()).map(s => s.site_url) });
}

// 미라쿨 서브도메인 WP는 wordpress_sites에 없고 hy64의 /volume1/web/{sub}.wordpress 에 있음(?ls=1로 확인)
const SUBS = ['ai', 'av', 'blog', 'china', 'eco', 'edu', 'iot', 'it', 'know', 'kstar', 'life', 'music', 'os', 'spt', 'tech'];

export async function POST() {
  const code = adsenseGuardMuPlugin();
  const results: { site: string; ok: boolean; error?: string }[] = [];
  const list = [
    ...(await targets()).map(s => ({ site: s.site_url as string, dir: (s.web_dir || s.subdomain) as string | null, nas: ((s.nas as NasKey) || 'hy64') })),
    ...SUBS.map(x => ({ site: `https://${x}.miracool.co.kr`, dir: `${x}.wordpress` as string | null, nas: 'hy64' as NasKey })),
  ];
  for (const s of list) {
    if (!s.dir) { results.push({ site: s.site, ok: false, error: 'NAS 사이트 아님(건너뜀)' }); continue; }
    const target = NAS_TARGETS[s.nas];
    const wpDir = s.dir.startsWith('/') ? s.dir : `${WEB_ROOT}/${s.dir}`;
    try {
      await target.exec(`mkdir -p ${wpDir}/wp-content/mu-plugins`);
      const w = await target.execWithStdin(`cat > ${wpDir}/wp-content/mu-plugins/loov-adsense-guard.php`, code);
      if (w.code) throw new Error(w.stderr || `exit ${w.code}`);
      results.push({ site: s.site, ok: true });
    } catch (e) { results.push({ site: s.site, ok: false, error: String(e).slice(0, 120) }); }
  }
  return NextResponse.json({ results });
}
