import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
  if (!allowedTypes.includes(file.type))
    return NextResponse.json({ error: '지원하지 않는 파일 형식 (jpg, png, gif, webp, mp4, mov)' }, { status: 400 });

  const isVideo = file.type.startsWith('video/');
  const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize)
    return NextResponse.json({ error: `파일 크기 초과 (${isVideo ? '50MB' : '10MB'} 이하)` }, { status: 400 });

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from('sns-media')
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from('sns-media').getPublicUrl(path);
  return NextResponse.json({ url: publicUrl, type: file.type, name: file.name, size: file.size, isVideo });
}
