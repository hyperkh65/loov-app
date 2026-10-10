/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec, nas2daysExec } from '@/lib/nas-ssh';

export const maxDuration = 30;

async function getNasStatus(exec: typeof nasExec, paths: {
  dbDir: string; webMirror: string; webPkgMirror?: string;
  usbWebMirror?: string; usbDbDir?: string;
}) {
  // 단 2번의 병렬 SSH 연결 — du -sh 절대 사용 안 함 (수백GB 폴더에서 수분 소요)
  const [r1, r2] = await Promise.all([
    // ── 연결 1: 목록·날짜·디스크 (모두 즉시 응답) ────────────
    exec([
      `echo ===DB===`,
      `ls -d ${paths.dbDir}/20??-??-??_?????? 2>/dev/null | sort -r | head -5 | xargs -I{} basename {} 2>/dev/null || echo EMPTY`,
      `echo ===WEB===`,
      `stat -c "%y" ${paths.webMirror} 2>/dev/null | cut -d. -f1 || echo NONE`,
      ...(paths.webPkgMirror ? [
        `echo ===PKG===`,
        `stat -c "%y" ${paths.webPkgMirror} 2>/dev/null | cut -d. -f1 || echo NONE`,
      ] : []),
      ...(paths.usbWebMirror && paths.usbDbDir ? [
        `echo ===USB===`,
        `stat -c "%y" ${paths.usbWebMirror} 2>/dev/null | cut -d. -f1 || echo NONE`,
        `ls -d ${paths.usbDbDir}/20??-??-??_?????? 2>/dev/null | sort -r | head -5 | xargs -I{} basename {} 2>/dev/null || echo EMPTY`,
        `df -h /volumeUSB1/usbshare 2>/dev/null | tail -1 || echo NOUSBDISK`,
      ] : []),
      `echo ===DISK===`,
      `df -h /volume1 2>/dev/null | tail -1`,
      `echo ===DBFILES===`,
      `LATEST=$(ls -d ${paths.dbDir}/20??-??-??_?????? 2>/dev/null | sort -r | head -1); [ -n "$LATEST" ] && ls -lh "$LATEST"/ 2>/dev/null | tail -n +2 | awk '{print $5" "$9}' || echo NONE`,
    ].join('; ')),
    // ── 연결 2: 로그 ─────────────────────────────────────────
    exec(`ls /volume1/web/loov_backup/_logs/backup_*.log 2>/dev/null | sort -r | head -1 | xargs tail -c 2000 2>/dev/null || echo "로그 없음"`),
  ]);

  const lines = r1.stdout.split('\n').map(l => l.trim()).filter(Boolean);
  const sections: Record<string, string[]> = {};
  let cur = '';
  for (const line of lines) {
    if (line.startsWith('===') && line.endsWith('===')) {
      cur = line.replace(/=/g, '');
    } else if (cur) {
      (sections[cur] = sections[cur] || []).push(line);
    }
  }
  const sec = (k: string) => sections[k] || [];

  const dbBackups = sec('DB').filter(l => l !== 'EMPTY');

  const webStat = sec('WEB')[0] || 'NONE';
  const web = { lastSync: webStat === 'NONE' ? null : webStat, size: '' };

  let webPkg = null;
  if (paths.webPkgMirror) {
    const pStat = sec('PKG')[0] || 'NONE';
    webPkg = { lastSync: pStat === 'NONE' ? null : pStat, size: '' };
  }

  let usb = null;
  let usbDisk = undefined;
  if (paths.usbWebMirror && paths.usbDbDir) {
    const uLines = sec('USB');
    const uWebStat = uLines[0] || 'NONE';
    const uDbBackups = uLines.slice(1).filter(l => !l.match(/^\//i) && l !== 'EMPTY' && !l.startsWith('Filesystem') && !l.startsWith('NOUSBDISK'));
    const diskLine = uLines.find(l => l.match(/^\//));
    usb = { web: { lastSync: uWebStat === 'NONE' ? null : uWebStat, size: '' }, db: uDbBackups };
    if (diskLine) {
      const p = diskLine.split(/\s+/);
      usbDisk = p.length >= 5 ? { size: p[1], used: p[2], avail: p[3], pct: p[4] } : null;
    } else {
      usbDisk = null;
    }
  }

  const diskLine = sec('DISK')[0] || '';
  const dp = diskLine.split(/\s+/);
  const disk = dp.length >= 5 ? { size: dp[1], used: dp[2], avail: dp[3], pct: dp[4] } : null;

  const dbFilesLines = sec('DBFILES');
  let latestDetail = null;
  if (dbBackups.length > 0 && dbFilesLines[0] !== 'NONE') {
    const files = dbFilesLines.map(l => {
      const sp = l.indexOf(' ');
      return { size: l.slice(0, sp), name: l.slice(sp + 1) };
    }).filter(f => f.name && f.name !== 'NONE');
    latestDetail = { timestamp: dbBackups[0], totalSize: '', files };
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
