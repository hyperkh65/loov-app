import { NextRequest, NextResponse } from 'next/server';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';

const DL_PATH = '/volume1/homes/urjent/missav_downloads';

function toSrt(segments: { start: number; end: number; text: string }[]): string {
  return segments.map((seg, i) => {
    const fmt = (s: number) => {
      const h = Math.floor(s / 3600).toString().padStart(2, '0');
      const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
      const sec = Math.floor(s % 60).toString().padStart(2, '0');
      const ms = Math.round((s % 1) * 1000).toString().padStart(3, '0');
      return `${h}:${m}:${sec},${ms}`;
    };
    return `${i + 1}\n${fmt(seg.start)} --> ${fmt(seg.end)}\n${seg.text.trim()}\n`;
  }).join('\n');
}

export async function POST(req: NextRequest) {
  const { filename } = await req.json() as { filename: string };
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const baseName = filename.replace(/\.[^.]+$/, '');
  const srtPath = `${DL_PATH}/${baseName}.srt`;
  const videoPath = `${DL_PATH}/${filename}`;
  const audioPath = `/tmp/dl_audio_${Date.now()}.mp3`;

  // 이미 자막 있으면 반환
  const checkRes = await nasExec(`cat "${srtPath}" 2>/dev/null || echo ""`);
  if (checkRes.stdout.trim().length > 10) {
    return NextResponse.json({ success: true, srt: checkRes.stdout, cached: true });
  }

  // ffmpeg로 오디오 추출 (NAS 또는 missav container)
  const ffmpegCheck = await nasExec('which ffmpeg 2>/dev/null || /usr/local/bin/docker exec missav-dlp-web which ffmpeg 2>/dev/null || echo ""');
  const hasFfmpeg = ffmpegCheck.stdout.trim().length > 0;

  if (!hasFfmpeg) {
    return NextResponse.json({ error: 'ffmpeg를 찾을 수 없습니다. NAS에 ffmpeg를 설치해주세요.' }, { status: 500 });
  }

  // ffmpeg 명령 결정
  const ffmpegCmd = ffmpegCheck.stdout.includes('docker')
    ? `/usr/local/bin/docker exec missav-dlp-web ffmpeg -i "/downloads/${filename}" -vn -ar 16000 -ac 1 -f mp3 "${audioPath}" -y 2>&1`
    : `ffmpeg -i "${videoPath}" -vn -ar 16000 -ac 1 -f mp3 "${audioPath}" -y 2>&1`;

  const extractRes = await nasExec(ffmpegCmd);
  if (extractRes.code !== 0 && !extractRes.stderr.includes('size=')) {
    return NextResponse.json({ error: `ffmpeg 오류: ${extractRes.stderr.slice(0, 300)}` }, { status: 500 });
  }

  // 오디오 파일 읽기
  const readRes = await nasExec(`wc -c < "${audioPath}" 2>/dev/null || echo 0`);
  const audioSize = parseInt(readRes.stdout.trim() || '0');
  if (audioSize === 0) {
    return NextResponse.json({ error: '오디오 추출 실패' }, { status: 500 });
  }
  if (audioSize > 24 * 1024 * 1024) {
    return NextResponse.json({ error: `오디오 파일이 너무 큽니다 (${(audioSize/1024/1024).toFixed(0)}MB > 24MB). 영상이 너무 긴 경우 앞부분만 추출합니다.` }, { status: 400 });
  }

  // OpenAI Whisper API
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await nasExec(`rm -f "${audioPath}"`);
    return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
  }

  // 오디오를 NAS에서 읽어서 Whisper API로 전송
  const { Client } = require('ssh2');
  const audioBuffer: Buffer = await new Promise((resolve, reject) => {
    const conn = new (Client)();
    conn.on('ready', () => {
      conn.sftp((err: unknown, sftp: { createReadStream: (path: string) => NodeJS.ReadableStream }) => {
        if (err) { conn.end(); return reject(err); }
        const chunks: Buffer[] = [];
        const s = sftp.createReadStream(audioPath);
        s.on('data', (c: Buffer) => chunks.push(c));
        s.on('end', () => { conn.end(); resolve(Buffer.concat(chunks)); });
        s.on('error', (e: Error) => { conn.end(); reject(e); });
      });
    });
    conn.on('error', reject);
    conn.connect({ host: 'hy64.synology.me', port: 22, username: 'urjent', password: 'Aa050677##7759', tryKeyboard: true, readyTimeout: 15000 });
  });

  await nasExec(`rm -f "${audioPath}"`);

  // Whisper API 호출 (multipart form)
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('file', audioBuffer, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
    body: form.getBuffer(),
    signal: AbortSignal.timeout(120_000),
  });

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    return NextResponse.json({ error: `Whisper API 오류: ${errText.slice(0, 200)}` }, { status: 500 });
  }

  const whisperData = await whisperRes.json() as { segments: { start: number; end: number; text: string }[] };
  const srt = toSrt(whisperData.segments || []);

  // SRT 저장
  await nasExecWithStdin(`cat > "${srtPath}"`, srt);

  return NextResponse.json({ success: true, srt, cached: false });
}

// SRT 파일 읽기
export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename || filename.includes('..')) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const baseName = filename.replace(/\.[^.]+$/, '');
  const res = await nasExec(`cat "${DL_PATH}/${baseName}.srt" 2>/dev/null || echo ""`);
  return NextResponse.json({ srt: res.stdout || null });
}
