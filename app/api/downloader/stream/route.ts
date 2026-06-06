import { NextRequest } from 'next/server';

// missav 컨테이너 HTTP 직접 프록시 (SSH/SFTP 불필요)
const MISSAV_BASE = process.env.MISSAV_STREAM_BASE || 'http://172.17.0.1:58000';

export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return new Response('Invalid filename', { status: 400 });
  }

  const upstreamUrl = `${MISSAV_BASE}/api/video/${encodeURIComponent(filename)}`;

  const upstreamHeaders: Record<string, string> = {};
  const range = req.headers.get('range');
  if (range) upstreamHeaders['Range'] = range;

  try {
    const upstream = await fetch(upstreamUrl, { headers: upstreamHeaders });

    const resHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    };

    const ct = upstream.headers.get('content-type');
    const cl = upstream.headers.get('content-length');
    const cr = upstream.headers.get('content-range');
    if (ct) resHeaders['Content-Type'] = ct;
    if (cl) resHeaders['Content-Length'] = cl;
    if (cr) resHeaders['Content-Range'] = cr;

    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (e) {
    return new Response(`Stream error: ${String(e)}`, { status: 502 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    },
  });
}
