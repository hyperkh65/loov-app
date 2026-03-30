import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// NAS 영상 URL을 브라우저에 프록시 — CORS 우회
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url 파라미터 필요' }, { status: 400 })

  // NAS URL만 허용
  if (!url.startsWith('https://hy64.synology.me/xmedia/')) {
    return NextResponse.json({ error: '허용되지 않는 URL' }, { status: 403 })
  }

  try {
    const range = req.headers.get('range')
    const headers: HeadersInit = {}
    if (range) headers['Range'] = range

    const res = await fetch(url, { headers })

    const contentType = res.headers.get('content-type') || 'video/mp4'
    const contentLength = res.headers.get('content-length')
    const contentRange = res.headers.get('content-range')

    const resHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    }
    if (contentLength) resHeaders['Content-Length'] = contentLength
    if (contentRange) resHeaders['Content-Range'] = contentRange

    return new Response(res.body, {
      status: res.status,
      headers: resHeaders,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
