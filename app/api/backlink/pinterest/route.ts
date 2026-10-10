import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { publishToPinterest } from '@/lib/pinterest-publish';

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

  try {
    const { url } = await publishToPinterest({ title, meta_description, canonical_url, representative_image_url });
    return NextResponse.json({ success: true, url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
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
