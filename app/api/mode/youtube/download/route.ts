import { NextRequest, NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

const SAVE_BASE = '/volume1/homes/urjent/youtube_downloads';

function toYoutubeUrl(input: string): string {
  const s = input.trim();
  if (s.startsWith('http')) return s;
  const handle = s.startsWith('@') ? s : `@${s}`;
  return `https://www.youtube.com/${handle}`;
}

export async function POST(req: NextRequest) {
  try {
    const { channel } = await req.json();
    if (!channel?.trim()) {
      return NextResponse.json({ error: '채널명 또는 URL을 입력하세요.' }, { status: 400 });
    }

    const url = toYoutubeUrl(channel);
    const logFile = `/tmp/ytdlp_${Date.now()}.log`;

    // yt-dlp: 채널 전체 다운로드 (info.json + thumbnail + mp4)
    const cmd = [
      'nohup yt-dlp',
      '--write-info-json',
      '--write-thumbnail',
      '--convert-thumbnails jpg',
      '--merge-output-format mp4',
      '--no-overwrites',
      '--ignore-errors',
      `--output "${SAVE_BASE}/%(channel)s/%(title)s [%(id)s].%(ext)s"`,
      `"${url}"`,
      `> "${logFile}" 2>&1 &`,
      'echo $!',
    ].join(' ');

    const result = await nasExec(cmd);
    const pid = result.stdout.trim();

    return NextResponse.json({
      message: `다운로드가 NAS에서 시작되었습니다. (PID: ${pid})\n채널: ${url}\n로그: ${logFile}`,
      pid,
    });
  } catch (err) {
    console.error('[mode/youtube/download]', err);
    return NextResponse.json({ error: 'NAS 연결 실패 또는 yt-dlp 오류' }, { status: 500 });
  }
}
