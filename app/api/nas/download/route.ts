import { NextRequest, NextResponse } from 'next/server';
import { readFileStream } from '@/lib/nas-sftp';
import path from 'path';

export async function GET(req: NextRequest) {
  const filePath = new URL(req.url).searchParams.get('path') || '';
  if (!filePath) return NextResponse.json({ error: 'path 필요' }, { status: 400 });

  try {
    const stream = await readFileStream(filePath);
    const filename = path.basename(filePath);

    // Node.js readable stream → Web ReadableStream 변환
    const readable = new ReadableStream({
      start(controller) {
        (stream as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        (stream as NodeJS.ReadableStream).on('end', () => controller.close());
        (stream as NodeJS.ReadableStream).on('error', (err: Error) => controller.error(err));
      },
    });

    const encodedFilename = encodeURIComponent(filename);
    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
