import { NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

export async function GET() {
  try {
    // List directories in /volume1/web and check if they have wp-config.php
    const { stdout, code } = await nasExec(
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
          domain: `${name}.aboda.kr`,
          url: `https://${name}.aboda.kr`,
          adminUrl: `https://${name}.aboda.kr/wp-admin/`,
          createdAt: created ? new Date(parseInt(created) * 1000).toISOString() : null,
          size: size || '?',
        };
      });
    return NextResponse.json({ sites });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
