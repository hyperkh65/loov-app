import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { uploadToR2 } from '@/lib/r2-storage';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });

  const baseType = file.type.split(';')[0].trim();
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
  if (!allowedTypes.includes(baseType))
    return NextResponse.json({ error: '지원하지 않는 파일 형식 (jpg, png, gif, webp, mp4, mov, webm)' }, { status: 400 });

  const isVideo = baseType.startsWith('video/');
  const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize)
    return NextResponse.json({ error: `파일 크기 초과 (${isVideo ? '50MB' : '10MB'} 이하)` }, { status: 400 });

  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const key = `sns-media/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = await file.arrayBuffer();

  try {
    const publicUrl = await uploadToR2(key, bytes, baseType);
    return NextResponse.json({ url: publicUrl, type: file.type, name: file.name, size: file.size, isVideo });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
