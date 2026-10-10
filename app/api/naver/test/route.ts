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

  // PostWriteFormManagerOptions로 쿠키 실제 유효성 검증 (JSON 응답 = 유효, HTML = 만료)
  let cookieValid = false;
  try {
    const mgr = await fetch(
      `https://blog.naver.com/PostWriteFormManagerOptions.naver?blogId=${blog_id}`,
      {
        headers: {
          Cookie: `NID_AUT=${nid_aut}; NID_SES=${nid_ses}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json, text/plain, */*',
        },
        cache: 'no-store',
      }
    );
    const text = await mgr.text();
    cookieValid = text.trimStart().startsWith('{') && text.includes('isSuccess');
  } catch { /* network error */ }

  if (!cookieValid) {
    return NextResponse.json({
      ok: false,
      error: '쿠키가 만료되었거나 유효하지 않습니다. 네이버에 로그인 후 쿠키를 다시 발급해주세요.',
    }, { status: 401 });
  }

  const catResult = await getNaverCategories(blog_id, nid_aut, nid_ses);
  const categories = catResult.categories ?? [];

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
    note: categories.length === 0 ? '카테고리를 불러올 수 없었습니다.' : null,
  });
}
