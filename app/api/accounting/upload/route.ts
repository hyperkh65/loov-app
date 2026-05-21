import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { uploadToR2, r2Available } from '@/lib/r2-storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  if (!r2Available()) {
    return NextResponse.json({ error: 'R2 스토리지가 설정되지 않았습니다' }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: '파일 크기가 50MB를 초과합니다' }, { status: 400 });

  const ext = file.name.split('.').pop() || 'bin';
  const key = `accounting/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    const buffer = await file.arrayBuffer();
    const url = await uploadToR2(key, buffer, file.type || 'application/octet-stream');
    return NextResponse.json({ url, name: file.name, size: file.size, type: file.type });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
