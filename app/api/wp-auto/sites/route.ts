import { NextRequest, NextResponse } from 'next/server';
import { nasExec, nas2daysExec } from '@/lib/nas-ssh';

const NAS_EXEC = { hy64: nasExec, hy65: nas2daysExec } as const;
const DOMAIN_SUFFIX = { hy64: 'aboda.kr', hy65: '2days.kr' } as const;

export async function GET(req: NextRequest) {
  const nas = (new URL(req.url).searchParams.get('nas') === 'hy65' ? 'hy65' : 'hy64') as keyof typeof NAS_EXEC;
  const suffix = DOMAIN_SUFFIX[nas];
  try {
    // List directories in /volume1/web and check if they have wp-config.php
    const { stdout, code } = await NAS_EXEC[nas](
      `ls -1 /volume1/web/ 2>/dev/null | while read d; do
        if [ -f "/volume1/web/$d/wp-config.php" ]; then
          CREATED=$(stat -c %Y /volume1/web/$d/wp-config.php 2>/dev/null || stat -f %m /volume1/web/$d/wp-config.php 2>/dev/null)
          SIZE=$(du -sh /volume1/web/$d 2>/dev/null | cut -f1)
          echo "$d|$CREATED|$SIZE"
        fi
      done`
    );
    if (code !== 0) return NextResponse.json({ sites: [] });

    const sites = stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [name, created, size] = line.split('|');
        return {
          name,
          domain: `${name}.${suffix}`,
          url: `https://${name}.${suffix}`,
          adminUrl: `https://${name}.${suffix}/wp-admin/`,
          createdAt: created ? new Date(parseInt(created) * 1000).toISOString() : null,
          size: size || '?',
        };
      });
    return NextResponse.json({ sites });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
