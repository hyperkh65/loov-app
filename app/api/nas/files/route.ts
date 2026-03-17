import { NextRequest, NextResponse } from 'next/server';
import { listFiles } from '@/lib/nas-sftp';

const NAS_ROOT = '/volume1/homes/urjent/loov';

function safePath(input: string | null): string {
  const p = (input || NAS_ROOT).replace(/\.\.+/g, '');
  return p.startsWith(NAS_ROOT) ? p : NAS_ROOT;
}

export async function GET(req: NextRequest) {
  const path = safePath(new URL(req.url).searchParams.get('path'));
  try {
    const files = await listFiles(path);
    return NextResponse.json({ files, path });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
