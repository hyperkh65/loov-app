import { NextRequest, NextResponse } from 'next/server';

const SCRAPER_URL = process.env.YARN_SCRAPER_URL ?? '';
const SCRAPER_SECRET = process.env.YARN_SCRAPER_SECRET ?? '';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  if (!url) return new NextResponse('url required', { status: 400 });

  const allowed =
    url.startsWith('https://y.yarn.co/') ||
    url.startsWith('http://y.yarn.co/') ||
    url.startsWith('https://web.archive.org/web/') ||
    url.startsWith('http://web.archive.org/web/');

  if (!allowed) return new NextResponse('Invalid URL', { status: 400 });

  const rangeHeader = req.headers.get('range');

  // ── Railway 스크래퍼 서비스 우선 사용 (CF 우회) ─────────────────────
  if (SCRAPER_URL && url.includes('y.yarn.co')) {
    try {
      const proxyUrl = `${SCRAPER_URL}/proxy?url=${encodeURIComponent(url)}`;
      const headers: Record<string, string> = {};
      if (SCRAPER_SECRET) headers['x-secret'] = SCRAPER_SECRET;
      if (rangeHeader) headers['range'] = rangeHeader;

      const upstream = await fetch(proxyUrl, {
        headers,
        signal: AbortSignal.timeout(30000),
      });

      const resHeaders: Record<string, string> = {
        'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
      };
      for (const h of ['content-length', 'content-range']) {
        const v = upstream.headers.get(h);
        if (v) resHeaders[h] = v;
      }

      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: resHeaders,
      });
    } catch { /* fall through to direct fetch */ }
  }

  // ── 폴백: 직접 fetch (archive.org 등) ────────────────────────────────
  try {
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://yarn.co/',
    };
    if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

    const upstream = await fetch(url, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(30000),
    });

    const resHeaders: Record<string, string> = {
      'Content-Type': upstream.headers.get('content-type') || 'video/mp4',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
    };
    for (const h of ['content-length', 'content-range']) {
      const v = upstream.headers.get(h);
      if (v) resHeaders[h] = v;
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (e) {
    return new NextResponse(String(e), { status: 500 });
  }
}
