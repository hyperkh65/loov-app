import { NextRequest, NextResponse } from 'next/server';

// Instagram 등 외부 SNS가 R2 CDN URL을 직접 fetch 못하는 문제 해결용 프록시
// 인증 불필요 (Instagram 서버가 직접 요청)
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('url parameter required', { status: 400 });

  // 허용된 도메인만 프록시 (보안)
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  const allowed = [
    'r2.dev',
    'pub-e310bf4303744c7295d9b556111ff394.r2.dev',
    'cloudflare-ipfs.com',
    'loov.co.kr',
  ];
  const isAllowed = allowed.some(d => parsed.hostname.endsWith(d));
  if (!isAllowed) return new NextResponse('Domain not allowed', { status: 403 });

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; image-proxy/1.0)',
      },
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
