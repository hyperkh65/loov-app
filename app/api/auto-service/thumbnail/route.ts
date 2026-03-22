import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';

export const maxDuration = 30;

// 대표이미지 재생성 (제목/키워드/색상 커스터마이징)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { article_id, title, keyword, color_scheme = 'blue', bg_image_url } = await req.json();
  if (!article_id || !title || !keyword)
    return NextResponse.json({ error: 'article_id, title, keyword 필요' }, { status: 400 });

  const imageUrl = await generateAndUploadThumbnail(title, keyword, color_scheme, bg_image_url || undefined);
  if (!imageUrl) return NextResponse.json({ error: '썸네일 생성 실패' }, { status: 500 });

  // DB 업데이트
  const { error } = await supabase
    .from('bossai_auto_articles')
    .update({ representative_image_url: imageUrl, updated_at: new Date().toISOString() })
    .eq('id', article_id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: imageUrl });
}

// 파일 업로드로 대표이미지 교체
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const article_id = formData.get('article_id') as string | null;
  if (!file || !article_id) return NextResponse.json({ error: '파일과 article_id 필요' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `thumbnails/${user.id}_${Date.now()}.${ext}`;

  const adminSupabase = createAdminClient();
  const { error: uploadError } = await adminSupabase.storage
    .from('auto-blog')
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = adminSupabase.storage.from('auto-blog').getPublicUrl(path);

  const { error } = await supabase
    .from('bossai_auto_articles')
    .update({ representative_image_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', article_id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: publicUrl });
}
