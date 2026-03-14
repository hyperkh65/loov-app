import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const fileName = `shorts/${user.id}/${Date.now()}.${ext}`;
    const bytes = await file.arrayBuffer();

    const admin = await createAdminClient();
    const { error } = await admin.storage
      .from('bossai-images')
      .upload(fileName, bytes, { contentType: file.type, upsert: true });

    if (error) {
      // 버킷이 없으면 생성 후 재시도
      await admin.storage.createBucket('bossai-images', { public: true }).catch(() => {});
      const { error: e2 } = await admin.storage
        .from('bossai-images')
        .upload(fileName, bytes, { contentType: file.type, upsert: true });
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    }

    const { data: { publicUrl } } = admin.storage.from('bossai-images').getPublicUrl(fileName);
    return NextResponse.json({ url: publicUrl });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
