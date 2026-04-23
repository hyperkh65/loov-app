import { NextRequest, NextResponse } from 'next/server';

const R2_PUBLIC_BASE = process.env.R2_PUBLIC_URL || 'https://pub-e310bf4303744c7295d9b556111ff394.r2.dev';

// 경로 기반 이미지 프록시: Meta(Instagram/Threads) 서버가 R2 URL을 직접 접근 못하는 문제 해결
// /api/img/auto-blog/thumbnails/file.png → R2에서 가져와 반환
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const r2Url = `${R2_PUBLIC_BASE}/${path.join('/')}`;

  try {
    const res = await fetch(r2Url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; image-proxy/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return new NextResponse(`Upstream error: ${res.status}`, { status: 502 });

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new NextResponse(`Proxy fetch failed: ${e}`, { status: 502 });
  }
}
