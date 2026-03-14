import { NextRequest, NextResponse } from 'next/server';

const ALLOWED = ['aboda.kr', 'assets.mixkit.co', 'cdn.pixabay.com'];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return new NextResponse('url missing', { status: 400 });

  let hostname: string;
  try { hostname = new URL(url).hostname; }
  catch { return new NextResponse('invalid url', { status: 400 }); }
  if (!ALLOWED.some(d => hostname === d || hostname.endsWith('.' + d)))
    return new NextResponse('domain not allowed', { status: 403 });

  // Range 요청 헤더 전달 (오디오 스트리밍/루프 지원)
  const fetchHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0',
  };
  const range = req.headers.get('range');
  if (range) fetchHeaders['Range'] = range;

  try {
    const res = await fetch(url, { headers: fetchHeaders });
    if (!res.ok && res.status !== 206)
      return new NextResponse(`upstream ${res.status}`, { status: res.status });

    const resHeaders: Record<string, string> = {
      'Content-Type': res.headers.get('content-type') || 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    };
    const cl = res.headers.get('content-length');
    const cr = res.headers.get('content-range');
    if (cl) resHeaders['Content-Length'] = cl;
    if (cr) resHeaders['Content-Range'] = cr;

    return new NextResponse(res.body, { status: res.status, headers: resHeaders });
  } catch (e) {
    return new NextResponse('proxy error: ' + String(e), { status: 500 });
  }
}
