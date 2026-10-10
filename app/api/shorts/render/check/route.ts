import { NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';
import { createClient } from '@/lib/supabase-server';
import { findKoreanFont, findFfmpeg } from '@/lib/shorts/nas-ffmpeg';

export const maxDuration = 60;

// 실행 가능한 영구 설치 위치. /tmp는 noexec로 마운트돼 있어 다운로드해도
// 실행 자체가 안 됨 - 이 경로가 findFfmpeg()의 FFMPEG_PATHS 1순위와 일치해야 함.
const FFMPEG_INSTALL_PATH = '/volume1/homes/urjent/bin/ffmpeg';

async function installFfmpeg(): Promise<{ ok: boolean; path?: string; error?: string }> {
  // 정적 바이너리 다운로드 (Linux ARM64 또는 x86_64) - libx264/aac 포함된 완전판
  const arch = await nasExec('uname -m');
  const archStr = arch.stdout.trim();
  const url = archStr.includes('aarch64') || archStr.includes('arm')
    ? 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz'
    : 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz';

  const dl = await nasExec(
    `mkdir -p /volume1/homes/urjent/bin /tmp/ffmpeg_dl && cd /tmp/ffmpeg_dl && ` +
    `curl -L --max-time 120 "${url}" -o ffmpeg.tar.xz 2>&1 && ` +
    `tar -xJf ffmpeg.tar.xz --wildcards "*/ffmpeg" --strip-components=2 2>&1 && ` +
    `cp /tmp/ffmpeg_dl/ffmpeg ${FFMPEG_INSTALL_PATH} && chmod +x ${FFMPEG_INSTALL_PATH} && ` +
    `rm -rf /tmp/ffmpeg_dl && echo "ok"`,
    3 * 60_000
  );
  if (dl.stdout.includes('ok')) {
    const found = await findFfmpeg().catch(() => null);
    if (found) return { ok: true, path: found };
  }

  return { ok: false, error: dl.stderr || dl.stdout };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  // FFmpeg 확인 (libx264 인코더까지 있는지 검증)
  let ffmpegPath: string | null = await findFfmpeg().catch(() => null);
  let installed = false;

  if (!ffmpegPath) {
    const res = await installFfmpeg();
    if (res.ok) {
      ffmpegPath = res.path!;
      installed = true;
    }
  }

  // curl 가용성 확인 (이미지/오디오 다운로드용)
  const curlCheck = await nasExec('which curl && curl --version 2>&1 | head -1');

  // 한국어 폰트 탐색 (자막 오버레이용)
  const koreanFontPath = await findKoreanFont();

  // Python3 (edge-tts CLI 백업용)
  const pythonCheck = await nasExec('python3 --version 2>&1');
  const edgeTtsCheck = await nasExec('python3 -m edge_tts --version 2>&1 || echo "not installed"');

  let edgeTtsNas = !edgeTtsCheck.stdout.includes('not installed');
  if (!edgeTtsNas) {
    // pip으로 설치 시도
    const pip = await nasExec('pip3 install edge-tts 2>&1 | tail -2');
    edgeTtsNas = pip.stdout.includes('Successfully') || pip.stdout.includes('already satisfied');
  }

  return NextResponse.json({
    ffmpeg: {
      available: !!ffmpegPath,
      path: ffmpegPath,
      newlyInstalled: installed,
    },
    curl: { available: curlCheck.code === 0 },
    font: {
      available: !!koreanFontPath,
      path: koreanFontPath || '',
    },
    tts: {
      nasEdgeTts: edgeTtsNas,
      serverEdgeTtsApi: true, // NAS 자체 호스팅 edge-tts-api(포트 5050)를 서버에서 항상 호출 가능
    },
    python: pythonCheck.stdout.trim(),
    ready: !!(ffmpegPath && curlCheck.code === 0),
  });
}
