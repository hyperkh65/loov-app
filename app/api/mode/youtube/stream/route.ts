import { NextRequest, NextResponse } from 'next/server';
import { existsSync, statSync, createReadStream } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';

const VIDEOS_DIR = process.env.VIDEOS_DIR || '/videos';
const COOKIE_NAME = 'mode-video-auth';

export async function GET(req: NextRequest) {
  // 인증 확인
  const auth = req.cookies.get(COOKIE_NAME);
  if (auth?.value !== 'ok') {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const file = req.nextUrl.searchParams.get('file');
  if (!file) return new NextResponse('Missing file', { status: 400 });

  const safe = file.replace(/\.\./g, '').replace(/^\/+/, '');
  const fullPath = join(VIDEOS_DIR, safe);

  if (!existsSync(fullPath)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { size } = statSync(fullPath);
  const range = req.headers.get('range');

  let start = 0;
  let end = size - 1;

  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      start = parseInt(match[1], 10);
      end = match[2] ? parseInt(match[2], 10) : Math.min(start + 2 * 1024 * 1024 - 1, size - 1);
    }
  }

  const chunkSize = end - start + 1;
  const nodeStream = createReadStream(fullPath, { start, end });
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    status: range ? 206 : 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(chunkSize),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    },
  });
}
