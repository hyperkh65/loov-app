import { NextRequest, NextResponse } from 'next/server';
import { nasExec } from '@/lib/nas-ssh';

const SAVE_BASE = '/volume1/homes/urjent/youtube_downloads';
const PYTHON = '/var/packages/Python3.9/target/usr/bin/python3';

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
    const logFile = `/tmp/ytdl_${Date.now()}.log`;

    const script = `
import sys, json, re, urllib.request
from pathlib import Path
from pytubefix import YouTube, Channel

url = '${url}'
save_base = '${SAVE_BASE}'

def safe_name(s):
    return re.sub(r'[<>:"/\\\\|?*]', '_', str(s) if s else 'Unknown')

def download_video(yt):
    try:
        channel_name = safe_name(yt.author or 'Unknown')
        title = safe_name(yt.title or 'Unknown')
        vid_id = yt.video_id
        filename = f"{title} [{vid_id}]"
        save_dir = Path(save_base) / channel_name
        save_dir.mkdir(parents=True, exist_ok=True)
        mp4_path = save_dir / f"{filename}.mp4"
        if mp4_path.exists():
            print(f"SKIP: {title[:50]}", flush=True)
            return
        stream = yt.streams.filter(progressive=True, file_extension='mp4').get_highest_resolution()
        if not stream:
            print(f"NO_STREAM: {title[:50]}", flush=True)
            return
        print(f"DL [{stream.resolution}]: {title[:50]}", flush=True)
        stream.download(output_path=str(save_dir), filename=f"{filename}.mp4")
        info = {"id": vid_id, "title": yt.title, "channel": yt.author, "duration": yt.length,
                "upload_date": str(yt.publish_date).replace('-','')[:8] if yt.publish_date else ""}
        with open(save_dir / f"{filename}.info.json", "w", encoding="utf-8") as f:
            import json; json.dump(info, f, ensure_ascii=False)
        try:
            urllib.request.urlretrieve(yt.thumbnail_url, save_dir / f"{filename}.jpg")
        except: pass
        print(f"DONE: {title[:50]}", flush=True)
    except Exception as e:
        print(f"ERR: {e}", flush=True)

if 'watch?v=' in url or 'youtu.be/' in url:
    yt = YouTube(url)
    download_video(yt)
else:
    ch = Channel(url)
    print(f"CHANNEL: {ch.channel_name} videos starting...", flush=True)
    for v in ch.videos:
        try:
            download_video(v)
        except Exception as e:
            import traceback
            print(f"ERR: {e} | {traceback.format_exc().splitlines()[-1]}", flush=True)
`.replace(/'/g, "'\\''");

    const cmd = `nohup ${PYTHON} -c '${script}' > "${logFile}" 2>&1 & echo $!`;
    const result = await nasExec(cmd);
    const pid = result.stdout.trim();

    return NextResponse.json({
      message: `다운로드가 NAS에서 시작되었습니다.\n채널: ${url}\nPID: ${pid}\n로그: ${logFile}`,
      pid,
      logFile,
    });
  } catch (err) {
    console.error('[mode/youtube/download]', err);
    return NextResponse.json({ error: 'NAS 연결 실패' }, { status: 500 });
  }
}
