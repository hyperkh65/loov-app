import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '파일 필요' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const allowed = ['jpg','jpeg','png','gif','webp','heic','svg'];
  if (!allowed.includes(ext)) return NextResponse.json({ error: '이미지 파일만 업로드 가능합니다.' }, { status: 400 });

  // 버킷 없으면 자동 생성
  const admin = await createAdminClient();
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.find(b => b.name === 'gallery')) {
    await admin.storage.createBucket('gallery', { public: true });
  }

  const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error } = await admin.storage
    .from('gallery')
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from('gallery').getPublicUrl(path);
  return NextResponse.json({ url: publicUrl, path });
}
