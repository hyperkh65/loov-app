import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

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

  // Upload (try creating bucket if not exists)
  let uploadResult = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType: file.type,
    upsert: true,
  });

  if (uploadResult.error?.message?.toLowerCase().includes('not found') ||
      uploadResult.error?.message?.toLowerCase().includes('bucket')) {
    // Try creating bucket then re-upload
    await (supabase as typeof supabase & { storage: { createBucket: (name: string, opts: object) => Promise<unknown> } }).storage.createBucket(BUCKET, { public: true });
    uploadResult = await supabase.storage.from(BUCKET).upload(filename, buffer, {
      contentType: file.type,
      upsert: true,
    });
  }

  if (uploadResult.error) {
    return NextResponse.json({ error: uploadResult.error.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return NextResponse.json({ url: publicUrl });
}
