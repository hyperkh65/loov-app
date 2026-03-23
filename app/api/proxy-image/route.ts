import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('url 필요', { status: 400 });

  try {
    const decoded = decodeURIComponent(url);
    const isCdn = decoded.includes('cdn.pixabay.com') || decoded.includes('images.pexels.com');
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'image/*,*/*',
    };
    if (!isCdn) headers['Referer'] = 'https://pixabay.com/';

    const res = await fetch(decoded, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return new NextResponse('이미지 로드 실패', { status: 502 });

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) return new NextResponse('빈 이미지', { status: 502 });
    const contentType = res.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    return new NextResponse(String(e), { status: 500 });
  }
}
