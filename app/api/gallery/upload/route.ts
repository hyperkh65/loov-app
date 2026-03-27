import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import sharp from 'sharp';

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

  // ── WebP 압축 (HEIC/JPG/PNG → WebP, 최대 1920px, 품질 80) ──
  const rawBytes = Buffer.from(await file.arrayBuffer());
  let compressed: Buffer;
  let contentType = 'image/webp';
  try {
    compressed = await sharp(rawBytes)
      .rotate() // EXIF 방향 자동 보정
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    // 압축 실패 시 원본 사용 (GIF/SVG 등)
    compressed = rawBytes;
    contentType = file.type;
  }

  // 버킷 없으면 자동 생성
  const admin = await createAdminClient();
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.find(b => b.name === 'gallery')) {
    await admin.storage.createBucket('gallery', { public: true });
  }

  const uploadExt = contentType === 'image/webp' ? 'webp' : ext;
  const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${uploadExt}`;

  const { error } = await admin.storage
    .from('gallery')
    .upload(path, compressed, { contentType, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from('gallery').getPublicUrl(path);
  return NextResponse.json({ url: publicUrl, path, originalSize: rawBytes.length, compressedSize: compressed.length });
}
