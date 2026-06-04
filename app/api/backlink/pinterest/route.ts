import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, meta_description, canonical_url, representative_image_url } = await req.json() as {
    title: string;
    meta_description?: string;
    keyword?: string;
    canonical_url: string;
    representative_image_url?: string;
  };

  if (!title || !canonical_url) return NextResponse.json({ error: 'title, canonical_url 필요' }, { status: 400 });

  if (!representative_image_url) {
    return NextResponse.json({ error: 'Pinterest 핀 생성에 대표 이미지가 필요합니다' }, { status: 400 });
  }

  const [accessToken, boardId] = await Promise.all([
    getSetting('PINTEREST_ACCESS_TOKEN'),
    getSetting('PINTEREST_BOARD_ID'),
  ]);

  if (!accessToken || !boardId) {
    const missing = [!accessToken && 'Access Token', !boardId && 'Board ID'].filter(Boolean).join(', ');
    return NextResponse.json({ error: `Pinterest 설정 누락: ${missing}` }, { status: 400 });
  }

  try {
    const res = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        board_id: boardId,
        title: title.slice(0, 100),
        description: (meta_description || '').slice(0, 800),
        link: canonical_url,
        media_source: {
          source_type: 'image_url',
          url: representative_image_url,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: `Pinterest 오류 (${res.status}): ${data.message || JSON.stringify(data)}` },
        { status: 500 },
      );
    }

    const pinId = data.id;
    const url = pinId ? `https://www.pinterest.com/pin/${pinId}/` : undefined;
    return NextResponse.json({ success: true, url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const [accessToken, boardId] = await Promise.all([
    getSetting('PINTEREST_ACCESS_TOKEN'),
    getSetting('PINTEREST_BOARD_ID'),
  ]);

  return NextResponse.json({ configured: !!(accessToken && boardId), board_id: boardId || '' });
}
