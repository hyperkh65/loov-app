import { NextRequest, NextResponse } from 'next/server';

// 허용 도메인 (SSRF 방지)
const ALLOWED = ['assets.mixkit.co', 'mixkit.co', 'cdn.pixabay.com', 'pixabay.com', 'cdn.freesound.org', 'aboda.kr'];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('url 파라미터 없음', { status: 400 });

  let hostname: string;
  try { hostname = new URL(url).hostname; }
  catch { return new NextResponse('잘못된 URL', { status: 400 }); }

  if (!ALLOWED.some(d => hostname === d || hostname.endsWith('.' + d))) {
    return new NextResponse('허용되지 않은 도메인', { status: 403 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://pixabay.com/',
        'Accept': 'audio/mpeg,audio/*,*/*',
      },
    });
    if (!res.ok) return new NextResponse(`upstream ${res.status}`, { status: res.status });

    const contentType = res.headers.get('content-type') || 'audio/mpeg';

    // body를 그대로 스트리밍 (버퍼링 없음 → 빠른 응답)
    return new NextResponse(res.body, {
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
