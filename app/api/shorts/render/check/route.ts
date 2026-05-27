import { NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 60;

// Synology NAS에서 ffmpeg 경로 탐색 순서
const FFMPEG_PATHS = [
  'ffmpeg',
  '/usr/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/volume1/@appstore/ffmpeg/bin/ffmpeg',
  '/var/packages/ffmpeg6/target/bin/ffmpeg',
  '/var/packages/MediaServer/target/bin/ffmpeg',
  '/opt/bin/ffmpeg',
  '/tmp/ffmpeg',
];

async function findFfmpeg(): Promise<string | null> {
  for (const p of FFMPEG_PATHS) {
    const r = await nasExec(`${p} -version 2>&1 | head -1`);
    if (r.code === 0 && r.stdout.includes('ffmpeg')) return p;
  }
  return null;
}

async function installFfmpeg(): Promise<{ ok: boolean; path?: string; error?: string }> {
  // Synology Package Center 방식
  const syno = await nasExec('synopkg install ffmpeg 2>&1 || synopkg install ffmpeg6 2>&1 || echo "synopkg failed"');
  if (!syno.stdout.includes('failed')) {
    const found = await findFfmpeg();
    if (found) return { ok: true, path: found };
  }

  // 정적 바이너리 다운로드 (Linux ARM64 또는 x86_64)
  const arch = await nasExec('uname -m');
  const archStr = arch.stdout.trim();
  const url = archStr.includes('aarch64') || archStr.includes('arm')
    ? 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz'
    : 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz';

  const dl = await nasExec(
    `mkdir -p /tmp/ffmpeg_dl && cd /tmp/ffmpeg_dl && ` +
    `curl -L --max-time 120 "${url}" -o ffmpeg.tar.xz 2>&1 && ` +
    `tar -xJf ffmpeg.tar.xz --wildcards "*/ffmpeg" --strip-components=2 2>&1 && ` +
    `chmod +x /tmp/ffmpeg_dl/ffmpeg && cp /tmp/ffmpeg_dl/ffmpeg /tmp/ffmpeg && ` +
    `rm -rf /tmp/ffmpeg_dl && echo "ok"`
  );
  if (dl.stdout.includes('ok')) {
    const r = await nasExec('/tmp/ffmpeg -version 2>&1 | head -1');
    if (r.code === 0 && r.stdout.includes('ffmpeg')) return { ok: true, path: '/tmp/ffmpeg' };
  }

  return { ok: false, error: dl.stderr || dl.stdout };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  // FFmpeg 확인
  let ffmpegPath = await findFfmpeg();
  let installed = false;

  if (!ffmpegPath) {
    const res = await installFfmpeg();
    if (res.ok) {
      ffmpegPath = res.path!;
      installed = true;
    }
  }

  // edge-tts (msedge-tts npm은 서버에서 직접 사용) - NAS가 아닌 Next.js 서버에서 실행
  // curl 가용성 확인 (이미지/오디오 다운로드용)
  const curlCheck = await nasExec('which curl && curl --version 2>&1 | head -1');

  // 한국어 폰트 탐색 (자막 오버레이용)
  const fontCheck = await nasExec(
    'find /usr/share/fonts /volume1 -name "*.ttf" -o -name "*.otf" 2>/dev/null | grep -i "nanum\\|gothic\\|korean\\|KR\\|kr" | head -1'
  );

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
      available: !!fontCheck.stdout.trim(),
      path: fontCheck.stdout.trim(),
    },
    tts: {
      nasEdgeTts: edgeTtsNas,
      serverMsEdgeTts: true, // npm msedge-tts는 Next.js 서버에서 항상 사용 가능
    },
    python: pythonCheck.stdout.trim(),
    ready: !!(ffmpegPath && curlCheck.code === 0),
  });
}
