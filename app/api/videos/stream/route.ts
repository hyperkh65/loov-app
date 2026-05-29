import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';

const VIDEO_DIR = '/volumeUSB1/usbshare/videos';
const VIDEO_PIN = process.env.VIDEO_PIN || '0506';
const STREAM_SCRIPT = '/tmp/loov_video_stream.py';

export const maxDuration = 300;

// NAS 연결 설정
/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require('ssh2');
const NAS = {
  host: process.env.NAS_SSH_HOST || 'hy64.synology.me',
  port: parseInt(process.env.NAS_SSH_PORT || '22'),
  username: process.env.NAS_SSH_USER || 'urjent',
  password: process.env.NAS_SSH_PASSWORD || 'Aa050677##7759',
  tryKeyboard: true,
  readyTimeout: 10000,
};

let scriptEnsured = false;

async function ensureStreamScript() {
  if (scriptEnsured) return;
  const script = `import sys
f=open(sys.argv[1],'rb')
f.seek(int(sys.argv[2]))
r=int(sys.argv[3])
while r>0:
    d=f.read(min(65536,r))
    if not d:break
    sys.stdout.buffer.write(d)
    r-=len(d)
`;
  await nasExecWithStdin(`cat > ${STREAM_SCRIPT}`, script);
  scriptEnsured = true;
}

function getContentType(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime',
    avi: 'video/x-msvideo', webm: 'video/webm', mkv: 'video/x-matroska',
    wmv: 'video/x-ms-wmv', flv: 'video/x-flv', ts: 'video/mp2t', mts: 'video/mp2t',
    '3gp': 'video/3gpp', hevc: 'video/mp4', h265: 'video/mp4',
  };
  return map[ext] || 'video/mp4';
}

function nasStream(cmd: string): Promise<ReadableStream<Uint8Array>> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conn.exec(cmd, (err: Error, sshStream: any) => {
        if (err) { conn.end(); reject(err); return; }
        const rs = new ReadableStream<Uint8Array>({
          start(ctrl) {
            sshStream.on('data', (d: Buffer) => ctrl.enqueue(new Uint8Array(d)));
            sshStream.on('end', () => { ctrl.close(); conn.end(); });
            sshStream.on('error', (e: Error) => { ctrl.error(e); conn.end(); });
          },
          cancel() { conn.end(); },
        });
        resolve(rs);
      });
    });
    conn.on('error', reject);
    conn.connect(NAS);
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = req.nextUrl;
  const filename = searchParams.get('file') || '';
  const pin = searchParams.get('pin') || req.headers.get('x-video-pin') || '';

  if (pin !== VIDEO_PIN) return new Response('비밀번호 오류', { status: 403 });

  // 경로 탈출 방지
  const safeName = filename.replace(/\.\./g, '').replace(/[/\\]/g, '');
  if (!safeName) return new Response('파일명 필요', { status: 400 });

  const filePath = `${VIDEO_DIR}/${safeName}`;

  // 파일 크기 조회
  const sizeResult = await nasExec(`stat -c%s "${filePath}" 2>/dev/null || echo 0`);
  const fileSize = parseInt(sizeResult.stdout.trim()) || 0;
  if (!fileSize) return new Response('파일을 찾을 수 없습니다', { status: 404 });

  // Range 헤더 파싱
  const rangeHeader = req.headers.get('range');
  let start = 0;
  let end = fileSize - 1;
  let isRange = false;

  if (rangeHeader) {
    const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      start = parseInt(m[1]);
      end = m[2] ? Math.min(parseInt(m[2]), fileSize - 1) : fileSize - 1;
      isRange = true;
    }
  }

  const length = end - start + 1;

  // 스트리밍 커맨드: 범위 요청은 Python3 스크립트로 정확하게 처리
  let cmd: string;
  if (!isRange || (start === 0 && end === fileSize - 1)) {
    cmd = `cat "${filePath}"`;
  } else {
    await ensureStreamScript();
    cmd = `python3 ${STREAM_SCRIPT} "${filePath}" ${start} ${length} 2>/dev/null`;
  }

  try {
    const stream = await nasStream(cmd);
    const headers: Record<string, string> = {
      'Content-Type': getContentType(safeName),
      'Content-Length': String(length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    };
    if (isRange) headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;

    return new Response(stream, { status: isRange ? 206 : 200, headers });
  } catch (e) {
    return new Response('스트리밍 오류: ' + String(e), { status: 500 });
  }
}
