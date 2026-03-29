import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { uploadToR2 } from '@/lib/r2-storage';
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
      .rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    compressed = rawBytes;
    contentType = file.type;
  }

  const uploadExt = contentType === 'image/webp' ? 'webp' : ext;
  const key = `gallery/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${uploadExt}`;

  try {
    const publicUrl = await uploadToR2(key, compressed, contentType);
    return NextResponse.json({ url: publicUrl, path: key, originalSize: rawBytes.length, compressedSize: compressed.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
