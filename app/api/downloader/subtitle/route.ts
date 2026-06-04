/* eslint-disable @typescript-eslint/no-explicit-any */
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

async function readFileFromNAS(remotePath: string): Promise<Buffer> {
  const { Client } = require('ssh2');
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err: any, sftp: any) => {
        if (err) { conn.end(); return reject(err); }
        const chunks: Buffer[] = [];
        const s = sftp.createReadStream(remotePath);
        s.on('data', (c: Buffer) => chunks.push(c));
        s.on('end', () => { conn.end(); resolve(Buffer.concat(chunks)); });
        s.on('error', (e: Error) => { conn.end(); reject(e); });
      });
    });
    conn.on('error', reject);
    conn.connect({
      host: process.env.NAS_SSH_HOST || 'hy64.synology.me',
      port: parseInt(process.env.NAS_SSH_PORT || '22'),
      username: process.env.NAS_SSH_USER || 'urjent',
      password: process.env.NAS_SSH_PASSWORD || 'Aa050677##7759',
      tryKeyboard: true,
      readyTimeout: 15000,
    });
  });
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

  // ffmpeg 확인 (NAS 또는 missav container)
  const ffmpegCheck = await nasExec('which ffmpeg 2>/dev/null || echo ""');
  const dockerFfmpeg = ffmpegCheck.stdout.trim()
    ? ffmpegCheck.stdout.trim()
    : null;

  let ffmpegCmd: string;
  if (dockerFfmpeg) {
    ffmpegCmd = `ffmpeg -i "${videoPath}" -vn -ar 16000 -ac 1 -t 1800 -f mp3 "${audioPath}" -y 2>&1`;
  } else {
    // missav container에서 ffmpeg 시도
    const containerCheck = await nasExec('/usr/local/bin/docker exec missav-dlp-web which ffmpeg 2>/dev/null || echo ""');
    if (!containerCheck.stdout.trim()) {
      return NextResponse.json({ error: 'ffmpeg 없음 — NAS 패키지 매니저에서 ffmpeg를 설치해주세요.' }, { status: 500 });
    }
    ffmpegCmd = `/usr/local/bin/docker exec missav-dlp-web ffmpeg -i "/downloads/${filename}" -vn -ar 16000 -ac 1 -t 1800 -f mp3 "${audioPath}" -y 2>&1`;
  }

  const extractRes = await nasExec(ffmpegCmd);
  if (extractRes.code !== 0) {
    return NextResponse.json({ error: `ffmpeg 오류: ${(extractRes.stderr || extractRes.stdout).slice(0, 300)}` }, { status: 500 });
  }

  // 오디오 크기 확인
  const sizeRes = await nasExec(`wc -c < "${audioPath}" 2>/dev/null || echo 0`);
  const audioSize = parseInt(sizeRes.stdout.trim() || '0');
  if (audioSize === 0) {
    return NextResponse.json({ error: '오디오 추출 실패' }, { status: 500 });
  }
  if (audioSize > 24 * 1024 * 1024) {
    await nasExec(`rm -f "${audioPath}"`);
    return NextResponse.json({ error: `오디오가 너무 큽니다 (${(audioSize / 1024 / 1024).toFixed(0)}MB). 앞 30분만 자르거나 짧은 영상을 사용하세요.` }, { status: 400 });
  }

  // OpenAI API Key 확인
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await nasExec(`rm -f "${audioPath}"`);
    return NextResponse.json({ error: 'OPENAI_API_KEY 환경변수가 없습니다.' }, { status: 500 });
  }

  // NAS에서 오디오 파일 읽기
  let audioBuffer: Buffer;
  try {
    audioBuffer = await readFileFromNAS(audioPath);
  } catch (e) {
    return NextResponse.json({ error: `오디오 읽기 실패: ${String(e)}` }, { status: 500 });
  }
  await nasExec(`rm -f "${audioPath}"`);

  // Whisper API (OpenAI SDK)
  const { OpenAI } = require('openai');
  const openai = new OpenAI({ apiKey });

  try {
    const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mpeg' });
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const srt = toSrt((transcription.segments || []) as { start: number; end: number; text: string }[]);
    await nasExecWithStdin(`cat > "${srtPath}"`, srt);
    return NextResponse.json({ success: true, srt, cached: false });
  } catch (e) {
    return NextResponse.json({ error: `Whisper 오류: ${String(e)}` }, { status: 500 });
  }
}

// SRT 파일 읽기
export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  }
  const baseName = filename.replace(/\.[^.]+$/, '');
  const res = await nasExec(`cat "${DL_PATH}/${baseName}.srt" 2>/dev/null || echo ""`);
  return NextResponse.json({ srt: res.stdout || null });
}
