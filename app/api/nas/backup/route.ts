/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec } from '@/lib/nas-ssh';

export const maxDuration = 60;

// 백업 목록 및 상태 조회
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // NAS 백업 목록
    const nasListRes = await nasExec(
      'ls -d /volume1/web/loov_backup/20??-??-??_?????? 2>/dev/null | sort -r || echo EMPTY'
    );
    const nasBackups = nasListRes.stdout === 'EMPTY' ? [] :
      nasListRes.stdout.split('\n').filter(Boolean).map(p => p.split('/').pop()!);

    // USB 백업 목록
    const usbListRes = await nasExec(
      'ls -d /volumeUSB1/usbshare/loov_backup/20??-??-??_?????? 2>/dev/null | sort -r || echo EMPTY'
    );
    const usbBackups = usbListRes.stdout === 'EMPTY' ? [] :
      usbListRes.stdout.split('\n').filter(Boolean).map(p => p.split('/').pop()!);

    // 디스크 사용량
    const diskRes = await nasExec(
      'df -h /volume1 /volumeUSB1/usbshare 2>/dev/null | tail -n +2'
    );
    const diskLines = diskRes.stdout.split('\n').filter(Boolean);
    const parseDisk = (line: string) => {
      const parts = line.trim().split(/\s+/);
      return { size: parts[1], used: parts[2], avail: parts[3], pct: parts[4], mount: parts[5] };
    };

    // 최신 백업 상세 (NAS)
    let latestDetail: any = null;
    if (nasBackups.length > 0) {
      const latest = nasBackups[0];
      const detailRes = await nasExec(
        `ls -lh /volume1/web/loov_backup/${latest}/db/ 2>/dev/null | tail -n +2 | awk '{print $5, $9}'; ` +
        `ls -lh /volume1/web/loov_backup/${latest}/web/ 2>/dev/null | tail -n +2 | awk '{print $5, $9}'`
      );
      const dbSizeRes = await nasExec(`du -sh /volume1/web/loov_backup/${latest}/db 2>/dev/null | cut -f1 || echo -`);
      const webSizeRes = await nasExec(`du -sh /volume1/web/loov_backup/${latest}/web 2>/dev/null | cut -f1 || echo -`);

      latestDetail = {
        timestamp: latest,
        dbSize: dbSizeRes.stdout.trim(),
        webSize: webSizeRes.stdout.trim(),
        files: detailRes.stdout.split('\n').filter(Boolean).map(l => {
          const [size, name] = l.trim().split(/\s+/);
          return { size, name };
        }),
      };
    }

    // 최신 로그
    const logRes = await nasExec(
      'ls /volume1/web/loov_backup/_logs/ 2>/dev/null | sort -r | head -1 | xargs -I{} cat /volume1/web/loov_backup/_logs/{} 2>/dev/null || echo "로그 없음"'
    );

    return NextResponse.json({
      nas: {
        backups: nasBackups,
        disk: diskLines[0] ? parseDisk(diskLines[0]) : null,
      },
      usb: {
        backups: usbBackups,
        disk: diskLines[1] ? parseDisk(diskLines[1]) : null,
      },
      latestDetail,
      latestLog: logRes.stdout,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// 수동 백업 실행
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action } = await req.json().catch(() => ({ action: 'backup' }));

  if (action === 'backup') {
    // 백그라운드 실행 (fire and forget)
    nasExec('echo "Aa050677##7759" | sudo -S /usr/local/bin/backup_all_mariadb.sh > /tmp/manual_backup.log 2>&1 &')
      .catch(console.error);
    return NextResponse.json({ ok: true, message: '백업 시작됨 (백그라운드)' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
