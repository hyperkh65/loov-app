import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { url } = await req.json() as { url?: string };
  if (!url) return NextResponse.json({ error: 'url 필요' }, { status: 400 });

  // 외부 이미지 다운로드
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) return NextResponse.json({ error: `이미지 다운로드 실패: ${res.status}` }, { status: 502 });

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png'
    : contentType.includes('gif') ? 'gif'
    : contentType.includes('webp') ? 'webp'
    : 'jpg';

  const buf = Buffer.from(await res.arrayBuffer());
  const fileName = `naver/${user.id}/${Date.now()}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from('notion-uploads')
    .upload(fileName, buf, { contentType, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage
    .from('notion-uploads')
    .getPublicUrl(fileName);

  return NextResponse.json({ url: publicUrl });
}
