import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getNaverBlogInfo, getNaverCategories } from '@/lib/naver-blog';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { blog_id, nid_aut, nid_ses } = await req.json();
  if (!blog_id || !nid_aut || !nid_ses) {
    return NextResponse.json({ error: '블로그 ID와 쿠키를 모두 입력해주세요' }, { status: 400 });
  }

  // 블로그 정보 + 카테고리 동시 조회
  const [infoResult, catResult] = await Promise.all([
    getNaverBlogInfo(blog_id, nid_aut, nid_ses),
    getNaverCategories(blog_id, nid_aut, nid_ses),
  ]);

  if (infoResult.error) {
    return NextResponse.json({ error: infoResult.error }, { status: 400 });
  }

  // 성공 시 카테고리 DB 업데이트
  const categories = catResult.categories ?? [];
  await supabase
    .from('naver_connections')
    .update({
      blog_name: infoResult.info?.blogName || blog_id,
      categories: categories,
      last_tested_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  return NextResponse.json({
    ok: true,
    blogName: infoResult.info?.blogName,
    categories,
    catError: catResult.error,
  });
}
