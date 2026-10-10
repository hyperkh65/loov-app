import { NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

const MOVIE_DIR = '/volume1/homes/urjent/loov/movie';
const ARCHIVE_DIR = process.env.NAS_ARCHIVE_PATH || '/volumeUSB1/usbshare1/loov_archive';
const MAX_BYTES = (parseInt(process.env.NAS_MOVIE_MAX_GB || '300')) * 1024 * 1024 * 1024;
const TARGET_BYTES = MAX_BYTES * 0.8; // 정리 후 목표: 80%

// GET: 스토리지 상태 조회
export async function GET() {
  try {
    // du -sb로 바이트 단위 크기
    const duResult = await nasExec(`du -sb "${MOVIE_DIR}" 2>/dev/null | awk '{print $1}'`);
    const usedBytes = parseInt(duResult.stdout.trim()) || 0;

    // 파일 수 조회
    const countResult = await nasExec(`ls "${MOVIE_DIR}" 2>/dev/null | wc -l`);
    const fileCount = parseInt(countResult.stdout.trim()) || 0;

    return NextResponse.json({
      usedBytes,
      usedGB: (usedBytes / 1024 / 1024 / 1024).toFixed(2),
      maxGB: (MAX_BYTES / 1024 / 1024 / 1024).toFixed(0),
      targetGB: (TARGET_BYTES / 1024 / 1024 / 1024).toFixed(0),
      usedPct: ((usedBytes / MAX_BYTES) * 100).toFixed(1),
      fileCount,
      needsCleanup: usedBytes > MAX_BYTES,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST: 수동 정리 트리거
export async function POST() {
  try {
    const result = await checkAndArchive();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// 내부용: 스토리지 자동 정리 (record API에서 fire-and-forget으로 호출)
export async function checkAndArchive(): Promise<{ ok: boolean; archived: string[]; message: string }> {
  // 1. 현재 크기 체크
  const duResult = await nasExec(`du -sb "${MOVIE_DIR}" 2>/dev/null | awk '{print $1}'`);
  const usedBytes = parseInt(duResult.stdout.trim()) || 0;

  if (usedBytes <= MAX_BYTES) {
    return { ok: true, archived: [], message: `스토리지 정상 (${(usedBytes / 1024 / 1024 / 1024).toFixed(2)}GB / ${(MAX_BYTES / 1024 / 1024 / 1024).toFixed(0)}GB)` };
  }

  // 2. 아카이브 폴더 생성 확인
  await nasExec(`mkdir -p "${ARCHIVE_DIR}"`);

  // 3. ls -lt로 파일 목록 (최신 순 → 오래된 것은 마지막)
  const lsResult = await nasExec(
    `ls -lt --time-style=+%s "${MOVIE_DIR}" 2>/dev/null | grep -v '^total'`
  );

  const lines = lsResult.stdout.split('\n').filter(Boolean);
  // ls -lt는 최신 순이므로 역순 처리 (오래된 파일부터)
  const files = lines.reverse().map(line => {
    const m = line.match(/^([d\-])[rwxst+\-]{9}[\+@\.]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!m || m[1] === 'd') return null;
    return { name: m[4].trim(), size: parseInt(m[2]) || 0 };
  }).filter((f): f is { name: string; size: number } => f !== null);

  // 4. TARGET_BYTES 이하가 될 때까지 오래된 파일부터 아카이브 이동
  let current = usedBytes;
  const archived: string[] = [];

  for (const file of files) {
    if (current <= TARGET_BYTES) break;
    if (!file.name || file.name.includes('..') || file.name.includes('/')) continue;

    const mvResult = await nasExec(
      `mv "${MOVIE_DIR}/${file.name}" "${ARCHIVE_DIR}/${file.name}" 2>&1`
    );

    if (mvResult.code === 0) {
      archived.push(file.name);
      current -= file.size;
    } else {
      console.error(`[storage] mv failed: ${file.name}`, mvResult.stderr);
    }
  }

  return {
    ok: true,
    archived,
    message: `${archived.length}개 파일 아카이브 완료. 현재 ${(current / 1024 / 1024 / 1024).toFixed(2)}GB`,
  };
}
