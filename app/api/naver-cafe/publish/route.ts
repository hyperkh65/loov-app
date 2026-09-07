import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { publishToNaverCafe } from '@/lib/naver-cafe';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, content, menu_id, open_yn = 'Y', blog_url } = await req.json() as {
    title: string;
    content: string;
    menu_id?: string;
    open_yn?: 'Y' | 'N';
    cover_image_url?: string;
    blog_url?: string;
  };
  if (!title || !content) return NextResponse.json({ error: '제목과 내용 필요' }, { status: 400 });

  try {
    const admin = createAdminClient();
    const { articleUrl } = await publishToNaverCafe(admin, {
      userId: user.id, title, content, menuId: menu_id, openYn: open_yn, blogUrl: blog_url,
    });
    return NextResponse.json({ ok: true, url: articleUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
