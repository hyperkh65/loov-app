/**
 * GET  /api/nas-recovery  — hy64 백업 현황 + loov-app 컨테이너 상태 조회
 * POST /api/nas-recovery  — 정전 등으로 죽은 컨테이너 복구
 *   body: { scope: 'loov' | 'all' }
 *     - 'loov'  : loov-app만 docker start (이미 떠있으면 무해, 즉시 끝남)
 *     - 'all'   : /volumeUSB1/usbshare/nas_backup/<최신날짜>/restore_containers.sh 실행
 *                 (이미 떠있는 컨테이너는 건드리지 않고, 없는 것만 재생성 — 멱등적)
 * Auth: 대시보드 로그인 세션 (다른 대시보드 트리거 라우트와 동일 패턴, 이 앱은
 * 단일 사용자 앱이라 로그인 여부 외 별도 role 체크 없음 — app/api/wp-auto와 동일)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec } from '@/lib/nas-ssh';

const DOCKER = '/var/packages/ContainerManager/target/usr/bin/docker';
const BACKUP_ROOT = '/volumeUSB1/usbshare/nas_backup';

function sudoPass() {
  return process.env.NAS_SSH_PASSWORD || 'Aa050677##7759';
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const [statusRes, backupRes] = await Promise.all([
    nasExec(`echo '${sudoPass()}' | sudo -S ${DOCKER} inspect -f '{{.State.Status}}' loov-app 2>&1`, 15_000).catch(e => ({ stdout: '', stderr: String(e), code: 1 })),
    nasExec(`ls -1 ${BACKUP_ROOT} 2>/dev/null | sort -r | head -1`, 15_000).catch(() => ({ stdout: '', stderr: '', code: 1 })),
  ]);

  return NextResponse.json({
    loovStatus: statusRes.stdout || 'unknown',
    latestBackup: backupRes.stdout || null,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });

  const { scope } = await req.json().catch(() => ({})) as { scope?: 'loov' | 'all' };
  if (scope !== 'loov' && scope !== 'all') {
    return NextResponse.json({ error: "scope는 'loov' 또는 'all'이어야 합니다" }, { status: 400 });
  }

  if (scope === 'loov') {
    const result = await nasExec(`echo '${sudoPass()}' | sudo -S ${DOCKER} start loov-app 2>&1`, 60_000);
    return NextResponse.json({ ok: result.code === 0, scope, stdout: result.stdout, stderr: result.stderr });
  }

  // scope === 'all' — 최신 백업 폴더 찾아서 restore_containers.sh 전체 실행.
  // 58개 컨테이너 중 이미 로컬에 이미지 있는 것들이라 이미지 pull 없이 대부분
  // 금방 끝나지만, 네트워크 상태에 따라 오래 걸릴 수 있어 넉넉히 잡음.
  const latest = await nasExec(`ls -1 ${BACKUP_ROOT} 2>/dev/null | sort -r | head -1`, 15_000);
  const dateDir = latest.stdout.trim();
  if (!dateDir) {
    return NextResponse.json({ ok: false, error: `${BACKUP_ROOT}에 백업 폴더가 없습니다` }, { status: 404 });
  }
  const scriptPath = `${BACKUP_ROOT}/${dateDir}/restore_containers.sh`;
  const result = await nasExec(`echo '${sudoPass()}' | sudo -S sh ${scriptPath} 2>&1`, 280_000);
  return NextResponse.json({ ok: result.code === 0, scope, backupUsed: dateDir, stdout: result.stdout, stderr: result.stderr });
}
