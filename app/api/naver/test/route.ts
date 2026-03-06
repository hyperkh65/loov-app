import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getNaverCategories } from '@/lib/naver-blog';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { blog_id, nid_aut, nid_ses } = await req.json();
  if (!blog_id || !nid_aut || !nid_ses) {
    return NextResponse.json({ error: '블로그 ID와 쿠키를 모두 입력해주세요' }, { status: 400 });
  }

  // 카테고리 조회로 쿠키 유효성 간접 검증
  // (Naver API는 서버 IP 차단이 있어 블로그 존재 확인은 건너뜀)
  const catResult = await getNaverCategories(blog_id, nid_aut, nid_ses);
  const categories = catResult.categories ?? [];

  // DB에 저장 (blog_name은 blog_id로 fallback)
  await supabase
    .from('naver_connections')
    .update({
      blog_name: blog_id,
      categories,
      last_tested_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  return NextResponse.json({
    ok: true,
    blogName: blog_id,
    categories,
    note: categories.length === 0
      ? '카테고리를 불러올 수 없었습니다 (쿠키 만료 가능성). 저장 후 실제 발행으로 확인하세요.'
      : null,
  });
}
