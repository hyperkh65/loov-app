import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { NAS_TARGETS, WEB_ROOT, type NasKey } from '@/lib/nas-targets';

export async function GET(req: NextRequest) {
  const nas = (new URL(req.url).searchParams.get('nas') === 'hy65' ? 'hy65' : 'hy64') as NasKey;
  const target = NAS_TARGETS[nas];
  try {
    // List directories in /volume1/web and check if they have wp-config.php
    const { stdout, code } = await target.exec(
      `ls -1 ${WEB_ROOT}/ 2>/dev/null | while read d; do
        if [ -f "${WEB_ROOT}/$d/wp-config.php" ]; then
          CREATED=$(stat -c %Y ${WEB_ROOT}/$d/wp-config.php 2>/dev/null || stat -f %m ${WEB_ROOT}/$d/wp-config.php 2>/dev/null)
          SIZE=$(du -sh ${WEB_ROOT}/$d 2>/dev/null | cut -f1)
          echo "$d|$CREATED|$SIZE"
        fi
      done`
    );
    if (code !== 0) return NextResponse.json({ sites: [] });

    // gsc_status는 Supabase(wordpress_sites)에 기록되므로 site_url로 조인해서 붙임
    const supabase = createAdminClient();
    const { data: tracked } = await supabase
      .from('wordpress_sites')
      .select('site_url, gsc_status, sitemap_url')
      .eq('user_id', process.env.OWNER_USER_ID!);
    const trackedByUrl = new Map((tracked || []).map(t => [t.site_url.replace(/\/$/, ''), t]));

    const sites = stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [name, created, size] = line.split('|');
        const url = `https://${name}.${target.domainSuffix}`;
        const t = trackedByUrl.get(url);
        return {
          name,
          domain: `${name}.${target.domainSuffix}`,
          url,
          adminUrl: `${url}/wp-admin/`,
          createdAt: created ? new Date(parseInt(created) * 1000).toISOString() : null,
          size: size || '?',
          sitemapUrl: t?.sitemap_url || `${url}/sitemap_index.xml`,
          gscStatus: t?.gsc_status || null,
        };
      });
    return NextResponse.json({ sites });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
