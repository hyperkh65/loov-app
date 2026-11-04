import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// 목록에는 썸네일(base64)을 싣지 않고 이 주소로 한 장씩 불러온다(목록이 1.8MB라 폰에서 느렸다)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id') || '';
  const { data } = await supabase.from('shorts_jobs').select('thumb').eq('user_id', user.id).eq('id', id).single();
  const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(String(data?.thumb || ''));
  if (!m) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(m[2], 'base64'), { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400' } });
}
