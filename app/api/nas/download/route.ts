import { NextRequest, NextResponse } from 'next/server';
import { readFileAsBase64 } from '@/lib/nas-sftp';
import path from 'path';

export async function GET(req: NextRequest) {
  const filePath = new URL(req.url).searchParams.get('path') || '';
  if (!filePath) return NextResponse.json({ error: 'path 필요' }, { status: 400 });

  try {
    const base64 = await readFileAsBase64(filePath);
    const buffer = Buffer.from(base64.replace(/\s+/g, ''), 'base64');
    const filename = path.basename(filePath);
    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
