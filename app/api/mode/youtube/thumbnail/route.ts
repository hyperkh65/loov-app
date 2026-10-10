import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';

const VIDEOS_DIR = process.env.VIDEOS_DIR || '/videos';

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('file');
  if (!file) return new NextResponse(null, { status: 400 });

  // Path traversal 방지
  const safe = file.replace(/\.\./g, '').replace(/^\/+/, '');
  const fullPath = join(VIDEOS_DIR, safe);

  if (!existsSync(fullPath)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const buf = readFileSync(fullPath);
    const ext = extname(fullPath).toLowerCase();
    const contentType = ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
