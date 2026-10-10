// GET /api/naver-cafe/fetch-image?url=xxx
// 외부 이미지 URL → base64 반환 (CORS 우회)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url 파라미터 필요' }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return NextResponse.json({ error: `이미지 fetch 실패: ${res.status}` }, { status: 400 });

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // 파일명 추출
    const name = url.split('/').pop()?.split('?')[0] || `image_${Date.now()}.jpg`;

    return NextResponse.json({ base64, type: contentType, name });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
