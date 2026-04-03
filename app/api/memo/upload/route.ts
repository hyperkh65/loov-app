/**
 * POST /api/memo/upload
 * 이미지/동영상 파일을 Supabase Storage에 업로드
 * 최대 20개, 파일당 100MB
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'memo-media';
const MAX_FILES = 20;
const MAX_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll('files') as File[];

  if (!files.length) return NextResponse.json({ error: '파일 없음' }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `최대 ${MAX_FILES}개까지 업로드 가능` }, { status: 400 });

  const urls: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (file.size > MAX_SIZE) { errors.push(`${file.name}: 100MB 초과`); continue; }

    const ext = file.name.split('.').pop() || 'bin';
    const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

    if (error) { errors.push(`${file.name}: ${error.message}`); continue; }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urls.push(publicUrl);
  }

  return NextResponse.json({ urls, errors, count: urls.length });
}
