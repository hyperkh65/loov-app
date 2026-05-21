import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'accounting-receipts';
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: '파일 크기가 20MB를 초과합니다' }, { status: 400 });

  const ext = file.name.split('.').pop() || 'bin';
  const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    if (error.message.includes('Bucket not found') || error.message.includes('bucket')) {
      return NextResponse.json(
        { error: 'accounting-receipts 버킷이 없습니다. Supabase Storage에서 버킷을 먼저 생성해주세요.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    url: publicUrl,
    name: file.name,
    size: file.size,
    type: file.type,
  });
}
