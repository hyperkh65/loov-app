/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec } from '@/lib/nas-ssh';

export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // DB 백업 목록 (NAS)
    const nasDbRes = await nasExec(
      'ls -d /volume1/web/loov_backup/db/20??-??-??_?????? 2>/dev/null | sort -r || echo EMPTY'
    );
    const nasDbBackups = nasDbRes.stdout === 'EMPTY' ? [] :
      nasDbRes.stdout.split('\n').filter(Boolean).map(p => p.split('/').pop()!);

    // DB 백업 목록 (USB)
    const usbDbRes = await nasExec(
      'ls -d /volumeUSB1/usbshare/loov_backup/db/20??-??-??_?????? 2>/dev/null | sort -r || echo EMPTY'
    );
    const usbDbBackups = usbDbRes.stdout === 'EMPTY' ? [] :
      usbDbRes.stdout.split('\n').filter(Boolean).map(p => p.split('/').pop()!);

    // 웹파일 미러 상태
    const webMirrorRes = await nasExec(
      'stat -c "%y" /volume1/web/loov_backup/web_mirror 2>/dev/null | cut -d. -f1 || echo NONE'
    );
    const usbWebRes = await nasExec(
      'stat -c "%y" /volumeUSB1/usbshare/loov_backup/web_mirror 2>/dev/null | cut -d. -f1 || echo NONE'
    );
    const webMirrorSize = await nasExec(
      'du -sh /volume1/web/loov_backup/web_mirror 2>/dev/null | cut -f1 || echo -'
    );
    const usbWebSize = await nasExec(
      'du -sh /volumeUSB1/usbshare/loov_backup/web_mirror 2>/dev/null | cut -f1 || echo -'
    );

    // 최신 DB 백업 상세
    let latestDbDetail: any = null;
    if (nasDbBackups.length > 0) {
      const latest = nasDbBackups[0];
      const filesRes = await nasExec(
        `ls -lh /volume1/web/loov_backup/db/${latest}/ 2>/dev/null | tail -n +2 | awk '{print $5, $9}'`
      );
      const sizeRes = await nasExec(
        `du -sh /volume1/web/loov_backup/db/${latest} 2>/dev/null | cut -f1 || echo -`
      );
      latestDbDetail = {
        timestamp: latest,
        totalSize: sizeRes.stdout.trim(),
        files: filesRes.stdout.split('\n').filter(Boolean).map(l => {
          const [size, name] = l.trim().split(/\s+/);
          return { size, name };
        }),
      };
    }

    // 디스크 사용량
    const diskRes = await nasExec(
      'df -h /volume1 /volumeUSB1/usbshare 2>/dev/null | tail -n +2'
    );
    const diskLines = diskRes.stdout.split('\n').filter(Boolean);
    const parseDisk = (line: string) => {
      const parts = line.trim().split(/\s+/);
      return { size: parts[1], used: parts[2], avail: parts[3], pct: parts[4], mount: parts[5] };
    };

    // 최신 로그
    const logRes = await nasExec(
      'ls /volume1/web/loov_backup/_logs/backup_*.log 2>/dev/null | sort -r | head -1 | xargs cat 2>/dev/null || echo "로그 없음"'
    );

    return NextResponse.json({
      db: {
        nas: nasDbBackups,
        usb: usbDbBackups,
        latestDetail: latestDbDetail,
      },
      web: {
        nas: {
          lastSync: webMirrorRes.stdout.trim() === 'NONE' ? null : webMirrorRes.stdout.trim(),
          size: webMirrorSize.stdout.trim(),
        },
        usb: {
          lastSync: usbWebRes.stdout.trim() === 'NONE' ? null : usbWebRes.stdout.trim(),
          size: usbWebSize.stdout.trim(),
        },
      },
      disk: {
        nas: diskLines[0] ? parseDisk(diskLines[0]) : null,
        usb: diskLines[1] ? parseDisk(diskLines[1]) : null,
      },
      latestLog: logRes.stdout,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await req.json().catch(() => ({ action: 'backup' }));

  if (action === 'backup') {
    nasExec('echo "Aa050677##7759" | sudo -S /usr/local/bin/backup_all_mariadb.sh > /tmp/manual_backup.log 2>&1 &')
      .catch(console.error);
    return NextResponse.json({ ok: true, message: '백업 시작됨 (백그라운드)' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
