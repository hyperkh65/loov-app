/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec, nas2daysExec } from '@/lib/nas-ssh';

export const maxDuration = 60;

async function getNasStatus(exec: typeof nasExec, paths: {
  dbDir: string; webMirror: string; webPkgMirror?: string;
  usbWebMirror?: string; usbDbDir?: string;
}) {
  // ── 1번 SSH: 핵심 정보 전부 한방에 ──────────────────────────
  const cmd1 = [
    // DB 목록
    `echo '===DB==='`,
    `ls -d ${paths.dbDir}/20??-??-??_?????? 2>/dev/null | sort -r | head -5 | xargs -I{} basename {} 2>/dev/null || echo EMPTY`,
    // 웹미러
    `echo '===WEB==='`,
    `stat -c "%y" ${paths.webMirror} 2>/dev/null | cut -d. -f1 || echo NONE`,
    `du -sh ${paths.webMirror} 2>/dev/null | cut -f1 || echo -`,
    // webPkg (2days)
    ...(paths.webPkgMirror ? [
      `echo '===PKG==='`,
      `stat -c "%y" ${paths.webPkgMirror} 2>/dev/null | cut -d. -f1 || echo NONE`,
      `du -sh ${paths.webPkgMirror} 2>/dev/null | cut -f1 || echo -`,
    ] : []),
    // USB (hy64)
    ...(paths.usbWebMirror && paths.usbDbDir ? [
      `echo '===USB==='`,
      `stat -c "%y" ${paths.usbWebMirror} 2>/dev/null | cut -d. -f1 || echo NONE`,
      `du -sh ${paths.usbWebMirror} 2>/dev/null | cut -f1 || echo -`,
      `ls -d ${paths.usbDbDir}/20??-??-??_?????? 2>/dev/null | sort -r | head -5 | xargs -I{} basename {} 2>/dev/null || echo EMPTY`,
      `df -h /volumeUSB1/usbshare 2>/dev/null | tail -1 || echo NOUSBDISK`,
    ] : []),
    // 디스크
    `echo '===DISK==='`,
    `df -h /volume1 2>/dev/null | tail -1`,
    // 최신 DB 상세
    `echo '===DBDETAIL==='`,
    `LATEST=$(ls -d ${paths.dbDir}/20??-??-??_?????? 2>/dev/null | sort -r | head -1); if [ -n "$LATEST" ]; then echo $(basename $LATEST); du -sh "$LATEST" 2>/dev/null | cut -f1; ls -lh "$LATEST"/ 2>/dev/null | tail -n +2 | awk '{print $5"\\t"$9}'; else echo NONE; fi`,
  ].join('; ');

  // ── 2번 SSH: 로그만 ──────────────────────────────────────
  const cmd2 = `ls /volume1/web/loov_backup/_logs/backup_*.log 2>/dev/null | sort -r | head -1 | xargs tail -c 3000 2>/dev/null || echo "로그 없음"`;

  const [r1, r2] = await Promise.all([exec(cmd1), exec(cmd2)]);
  const lines = r1.stdout.split('\n');

  // 섹션별 파싱
  const sections: Record<string, string[]> = {};
  let cur = '';
  for (const line of lines) {
    const m = line.match(/^===(\w+)===/);
    if (m) { cur = m[1]; sections[cur] = []; }
    else if (cur && line.trim()) sections[cur].push(line.trim());
  }

  const sec = (k: string) => sections[k] || [];

  // DB 목록
  const dbBackups = sec('DB').filter(l => l !== 'EMPTY');

  // 웹미러
  const [webStat, webSize] = sec('WEB');
  const web = { lastSync: webStat === 'NONE' ? null : webStat || null, size: webSize || '-' };

  // webPkg
  let webPkg = null;
  if (paths.webPkgMirror) {
    const [pStat, pSize] = sec('PKG');
    webPkg = { lastSync: pStat === 'NONE' ? null : pStat || null, size: pSize || '-' };
  }

  // USB
  let usb = null;
  let usbDisk = undefined;
  if (paths.usbWebMirror && paths.usbDbDir) {
    const usbLines = sec('USB');
    const uWebStat = usbLines[0] || 'NONE';
    const uWebSize = usbLines[1] || '-';
    const uDbBackups = usbLines.slice(2, -1).filter(l => l !== 'EMPTY' && !l.startsWith('Filesystem'));
    const uDiskLine = usbLines[usbLines.length - 1] || '';
    usb = {
      web: { lastSync: uWebStat === 'NONE' ? null : uWebStat, size: uWebSize },
      db: uDbBackups,
    };
    if (uDiskLine && uDiskLine !== 'NOUSBDISK' && !uDiskLine.startsWith('Filesystem')) {
      const p = uDiskLine.split(/\s+/);
      usbDisk = p.length >= 5 ? { size: p[1], used: p[2], avail: p[3], pct: p[4] } : null;
    } else {
      usbDisk = null;
    }
  }

  // 디스크
  const diskLine = sec('DISK')[0] || '';
  const dp = diskLine.split(/\s+/);
  const disk = dp.length >= 5 ? { size: dp[1], used: dp[2], avail: dp[3], pct: dp[4] } : null;

  // 최신 DB 상세
  let latestDetail = null;
  const ddLines = sec('DBDETAIL');
  if (ddLines.length > 0 && ddLines[0] !== 'NONE') {
    const ts = ddLines[0];
    const totalSize = ddLines[1] || '-';
    const files = ddLines.slice(2).map(l => {
      const [size, name] = l.split('\t');
      return { size: size || '', name: name || '' };
    }).filter(f => f.name);
    latestDetail = { timestamp: ts, totalSize, files };
  }

  return { db: { backups: dbBackups, latestDetail }, web, webPkg, usb, disk, usbDisk, latestLog: r2.stdout };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [hy64, days2] = await Promise.all([
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
    ]);

    return NextResponse.json({
      hy64: { ...hy64, schedule: '매일 02:30' },
      days2: { ...days2, schedule: '매일 03:30' },
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
