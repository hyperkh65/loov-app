/**
 * NAS 위 ffmpeg 실행에 필요한 공통 탐색/이스케이프 헬퍼.
 * app/api/shorts/render와 app/api/shorts/pattern/render가 공유한다.
 */
import { nasExec } from '@/lib/nas-ssh';

const FFMPEG_PATHS = [
  'ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/tmp/ffmpeg',
  '/volume1/@appstore/ffmpeg/bin/ffmpeg', '/var/packages/ffmpeg6/target/bin/ffmpeg',
  '/var/packages/MediaServer/target/bin/ffmpeg',
];

export async function findFfmpeg(): Promise<string> {
  for (const p of FFMPEG_PATHS) {
    const r = await nasExec(`${p} -version 2>&1 | head -1`);
    if (r.code === 0 && r.stdout.includes('ffmpeg')) return p;
  }
  throw new Error('NAS에 FFmpeg가 없습니다. /dashboard/shorts의 환경 체크를 먼저 실행하세요.');
}

/**
 * 한글이 그려지는 폰트 파일의 절대경로(없으면 null — 호출자가 영문 폴백 처리).
 * /volume1을 통째로 뒤지면(NAS 메인 스토리지, 데이터가 많으면 TB 단위) 2분
 * 넘게 걸리는 게 실사용 중 확인돼 렌더링 전체를 막았음 — 폰트가 실제로 있을
 * 법한 경로로 좁히고, timeout으로 한 번 더 안전장치를 둔다.
 */
export async function findKoreanFont(): Promise<string | null> {
  const r = await nasExec(
    'timeout 8 find /usr/share/fonts /opt/share/fonts /volume1/@appstore -maxdepth 6 -name "*.ttf" -o -name "*.otf" 2>/dev/null | grep -iE "nanum|gothic|korean|KR$" | head -1'
  );
  return r.stdout.trim() || null;
}

/** ffmpeg drawtext text= 안에 안전하게 넣기 위한 이스케이프(콜론/따옴표/백슬래시, 개행 제거). */
export function escapeDrawtext(s: string): string {
  return s.replace(/[\\':]/g, '\\$&').replace(/\n/g, ' ');
}
