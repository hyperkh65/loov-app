import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

const BUCKET = 'blogger-images';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file 필요' }, { status: 400 });

  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const filename = `${user.id}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  // Admin 클라이언트로 버킷 생성 보장
  const admin = createAdminClient();
  const { data: buckets } = await admin.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === BUCKET);
  if (!bucketExists) {
    await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 10485760 });
  }

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(filename, buffer, {
    contentType: file.type,
    upsert: true,
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(filename);
  return NextResponse.json({ url: publicUrl });
}
