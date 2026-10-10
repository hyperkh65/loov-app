import { NextRequest, NextResponse } from 'next/server';
import { readFileAsBase64 } from '@/lib/nas-sftp';
import path from 'path';

const NAS_ROOT = '/volume1/homes/urjent/loov';

export async function GET(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get('path') || '';
  const filePath = raw.replace(/\.\.+/g, '');
  if (!filePath || !filePath.startsWith(NAS_ROOT))
    return NextResponse.json({ error: '허용된 경로 외부 접근 불가' }, { status: 403 });

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
