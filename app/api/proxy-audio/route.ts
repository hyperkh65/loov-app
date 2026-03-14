import { NextRequest, NextResponse } from 'next/server';

// Pixabay 등 CDN이 Referer/CORS로 차단하는 오디오를 서버에서 프록시해서 클라이언트에 전달
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('url 파라미터 없음', { status: 400 });

  // 허용 도메인 제한 (외부 SSRF 방지)
  const allowed = ['cdn.pixabay.com', 'pixabay.com', 'cdn.freesound.org', 'aboda.kr'];
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return new NextResponse('잘못된 URL', { status: 400 });
  }
  if (!allowed.some(d => hostname === d || hostname.endsWith('.' + d))) {
    return new NextResponse('허용되지 않은 도메인', { status: 403 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AudioProxy/1.0)',
        'Accept': 'audio/*,*/*',
      },
    });
    if (!res.ok) return new NextResponse(`upstream ${res.status}`, { status: res.status });

    const contentType = res.headers.get('content-type') || 'audio/mpeg';
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new NextResponse('프록시 오류: ' + String(e), { status: 500 });
  }
}
