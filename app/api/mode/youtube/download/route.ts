import { NextRequest, NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

export async function POST(req: NextRequest) {
  try {
    const { url, quality = 'best' } = await req.json();

    if (!url || !url.includes('youtube.com') && !url.includes('youtu.be')) {
      return NextResponse.json({ error: '유효한 YouTube URL을 입력하세요.' }, { status: 400 });
    }

    const savePath = '/volume1/homes/urjent/youtube_downloads';
    const qualityFlag =
      quality === 'audio'
        ? '-x --audio-format mp3'
        : quality === 'best'
        ? '-f bestvideo+bestaudio'
        : `-f "bestvideo[height<=${quality}]+bestaudio"`;

    const cmd = `yt-dlp ${qualityFlag} -o "${savePath}/%(title)s.%(ext)s" "${url}"`;

    // NAS에서 백그라운드 실행 (nohup)
    const result = await nasExec(`nohup ${cmd} > /tmp/ytdlp_last.log 2>&1 &`);

    return NextResponse.json({
      message: `다운로드가 NAS에서 시작되었습니다. 저장 위치: ${savePath}`,
      result,
    });
  } catch (err) {
    console.error('[mode/youtube/download]', err);
    return NextResponse.json({ error: 'NAS 연결 실패 또는 다운로드 오류' }, { status: 500 });
  }
}
