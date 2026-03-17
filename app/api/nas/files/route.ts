import { NextRequest, NextResponse } from 'next/server';
import { listFiles } from '@/lib/nas-sftp';

export async function GET(req: NextRequest) {
  const path = new URL(req.url).searchParams.get('path') || '/volume1';
  try {
    const files = await listFiles(path);
    return NextResponse.json({ files, path });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
