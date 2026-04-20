import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

const VIDEOS_DIR = process.env.VIDEOS_DIR || '/videos';

export interface VideoItem {
  id: string;
  title: string;
  duration: number;
  channel: string;
  upload_date: string;
  video_file: string;   // relative to VIDEOS_DIR
  thumb_file: string;   // relative to VIDEOS_DIR, empty if none
  file_size: number;
}

function scanChannel(channelDir: string, channelName: string): VideoItem[] {
  const videos: VideoItem[] = [];
  let entries: string[];
  try {
    entries = readdirSync(channelDir);
  } catch {
    return videos;
  }

  const mp4Files = entries.filter((f) => extname(f).toLowerCase() === '.mp4');

  for (const mp4 of mp4Files) {
    const mp4Path = join(channelDir, mp4);
    const infoPath = join(channelDir, mp4.replace(/\.mp4$/i, '.info.json'));
    const thumbPath = join(channelDir, mp4.replace(/\.mp4$/i, '.jpg'));
    const thumbWebp = join(channelDir, mp4.replace(/\.mp4$/i, '.webp'));

    let info: Record<string, unknown> = {};
    if (existsSync(infoPath)) {
      try {
        info = JSON.parse(readFileSync(infoPath, 'utf-8'));
      } catch { /* ignore */ }
    }

    const thumbExists = existsSync(thumbPath);
    const webpExists = existsSync(thumbWebp);

    let fileSize = 0;
    try { fileSize = statSync(mp4Path).size; } catch { /* ignore */ }

    videos.push({
      id: (info.id as string) || basename(mp4, '.mp4'),
      title: (info.title as string) || basename(mp4, '.mp4'),
      duration: (info.duration as number) || 0,
      channel: (info.channel as string) || (info.uploader as string) || channelName,
      upload_date: (info.upload_date as string) || '',
      video_file: `${channelName}/${mp4}`,
      thumb_file: thumbExists
        ? `${channelName}/${basename(thumbPath)}`
        : webpExists
        ? `${channelName}/${basename(thumbWebp)}`
        : '',
      file_size: fileSize,
    });
  }

  return videos.sort((a, b) => b.upload_date.localeCompare(a.upload_date));
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const channel = searchParams.get('channel') || '';

  if (!existsSync(VIDEOS_DIR)) {
    return NextResponse.json({ videos: [], channels: [], error: 'Videos directory not mounted' });
  }

  let channelDirs: string[];
  try {
    channelDirs = readdirSync(VIDEOS_DIR).filter((d) => {
      try { return statSync(join(VIDEOS_DIR, d)).isDirectory(); } catch { return false; }
    });
  } catch {
    return NextResponse.json({ videos: [], channels: [] });
  }

  const videos: VideoItem[] = [];

  for (const dir of channelDirs) {
    if (channel && dir !== channel) continue;
    videos.push(...scanChannel(join(VIDEOS_DIR, dir), dir));
  }

  return NextResponse.json({
    videos,
    channels: channelDirs,
  });
}
