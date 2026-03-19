/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec, nas2daysExec } from '@/lib/nas-ssh';

export const maxDuration = 60;

async function getNasStatus(exec: typeof nasExec, paths: {
  dbDir: string; webMirror: string; webPkgMirror?: string; usbWebMirror?: string; usbDbDir?: string;
}) {
  // DB 백업 목록
  const dbRes = await exec(`ls -d ${paths.dbDir}/20??-??-??_?????? 2>/dev/null | sort -r || echo EMPTY`);
  const dbBackups = dbRes.stdout === 'EMPTY' ? [] :
    dbRes.stdout.split('\n').filter(Boolean).map(p => p.split('/').pop()!);

  // 웹미러 상태
  const webStatRes = await exec(`stat -c "%y" ${paths.webMirror} 2>/dev/null | cut -d. -f1 || echo NONE`);
  const webSizeRes = await exec(`du -sh ${paths.webMirror} 2>/dev/null | cut -f1 || echo -`);

  // web_packages 미러 상태 (2days.kr)
  let webPkg = null;
  if (paths.webPkgMirror) {
    const pkgStatRes = await exec(`stat -c "%y" ${paths.webPkgMirror} 2>/dev/null | cut -d. -f1 || echo NONE`);
    const pkgSizeRes = await exec(`du -sh ${paths.webPkgMirror} 2>/dev/null | cut -f1 || echo -`);
    webPkg = { lastSync: pkgStatRes.stdout.trim() === 'NONE' ? null : pkgStatRes.stdout.trim(), size: pkgSizeRes.stdout.trim() };
  }

  // USB 미러 (hy64)
  let usb = null;
  if (paths.usbWebMirror && paths.usbDbDir) {
    const usbWebStatRes = await exec(`stat -c "%y" ${paths.usbWebMirror} 2>/dev/null | cut -d. -f1 || echo NONE`);
    const usbWebSizeRes = await exec(`du -sh ${paths.usbWebMirror} 2>/dev/null | cut -f1 || echo -`);
    const usbDbRes = await exec(`ls -d ${paths.usbDbDir}/20??-??-??_?????? 2>/dev/null | sort -r || echo EMPTY`);
    const usbDbBackups = usbDbRes.stdout === 'EMPTY' ? [] :
      usbDbRes.stdout.split('\n').filter(Boolean).map(p => p.split('/').pop()!);
    usb = {
      web: { lastSync: usbWebStatRes.stdout.trim() === 'NONE' ? null : usbWebStatRes.stdout.trim(), size: usbWebSizeRes.stdout.trim() },
      db: usbDbBackups,
    };
  }

  // 최신 DB 상세
  let latestDbDetail: any = null;
  if (dbBackups.length > 0) {
    const latest = dbBackups[0];
    const filesRes = await exec(`ls -lh ${paths.dbDir}/${latest}/ 2>/dev/null | tail -n +2 | awk '{print $5, $9}'`);
    const sizeRes = await exec(`du -sh ${paths.dbDir}/${latest} 2>/dev/null | cut -f1 || echo -`);
    latestDbDetail = {
      timestamp: latest,
      totalSize: sizeRes.stdout.trim(),
      files: filesRes.stdout.split('\n').filter(Boolean).map(l => {
        const [size, name] = l.trim().split(/\s+/);
        return { size, name };
      }),
    };
  }

  // 디스크
  const diskRes = await exec('df -h /volume1 2>/dev/null | tail -1');
  const parts = diskRes.stdout.trim().split(/\s+/);
  const disk = parts.length >= 5 ? { size: parts[1], used: parts[2], avail: parts[3], pct: parts[4] } : null;

  return { db: { backups: dbBackups, latestDetail: latestDbDetail }, web: { lastSync: webStatRes.stdout.trim() === 'NONE' ? null : webStatRes.stdout.trim(), size: webSizeRes.stdout.trim() }, webPkg, usb, disk };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [hy64, days2, usbDisk] = await Promise.all([
      getNasStatus(nasExec, {
        dbDir: '/volume1/web/loov_backup/db',
        webMirror: '/volume1/web/loov_backup/web_mirror',
        usbWebMirror: '/volumeUSB1/usbshare/loov_backup/web_mirror',
        usbDbDir: '/volumeUSB1/usbshare/loov_backup/db',
      }),
      getNasStatus(nas2daysExec, {
        dbDir: '/volume1/web/loov_backup/db',
        webMirror: '/volume1/web/loov_backup/web_mirror',
        webPkgMirror: '/volume1/web/loov_backup/web_pkg_mirror',
      }),
      nasExec('df -h /volumeUSB1/usbshare 2>/dev/null | tail -1'),
    ]);

    // USB 디스크
    const usbParts = usbDisk.stdout.trim().split(/\s+/);
    const usbDiskInfo = usbParts.length >= 5 ? { size: usbParts[1], used: usbParts[2], avail: usbParts[3], pct: usbParts[4] } : null;

    // 최신 로그 (hy64)
    const logRes = await nasExec('ls /volume1/web/loov_backup/_logs/backup_*.log 2>/dev/null | sort -r | head -1 | xargs cat 2>/dev/null || echo "로그 없음"');
    const log2daysRes = await nas2daysExec('ls /volume1/web/loov_backup/_logs/backup_*.log 2>/dev/null | sort -r | head -1 | xargs cat 2>/dev/null || echo "로그 없음"');

    return NextResponse.json({
      hy64: { ...hy64, usbDisk: usbDiskInfo, latestLog: logRes.stdout, schedule: '매일 02:30' },
      days2: { ...days2, latestLog: log2daysRes.stdout, schedule: '매일 03:30' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, target } = await req.json().catch(() => ({ action: 'backup', target: 'hy64' }));

  if (action === 'backup') {
    if (target === 'hy64') {
      nasExec('echo "Aa050677##7759" | sudo -S /usr/local/bin/backup_all_mariadb.sh > /tmp/manual_backup.log 2>&1 &').catch(console.error);
    } else if (target === '2days') {
      nas2daysExec('echo "Fpahs60577##7759" | sudo -S /usr/local/bin/backup_2days.sh > /tmp/manual_backup.log 2>&1 &').catch(console.error);
    }
    return NextResponse.json({ ok: true, message: `${target} 백업 시작됨` });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
