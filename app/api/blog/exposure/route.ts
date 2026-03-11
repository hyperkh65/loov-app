import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get('keyword') || '';
  const blogId = searchParams.get('blog') || '';

  if (!keyword || !blogId) {
    return NextResponse.json({ error: '키워드와 블로그 ID를 입력하세요' }, { status: 400 });
  }

  const naverClientId = await getSetting('NAVER_CLIENT_ID');
  const naverClientSecret = await getSetting('NAVER_CLIENT_SECRET');

  if (!naverClientId || !naverClientSecret) {
    return NextResponse.json({ error: '네이버 API 키를 설정에서 등록해주세요' }, { status: 400 });
  }

  const cleanBlogId = blogId.replace(/https?:\/\/blog\.naver\.com\//i, '').replace(/\//g, '').trim();

  try {
    // Search Naver blog for the keyword, check top results
    const res = await fetch(
      `https://openapi.naver.com/v1/search/blog?query=${encodeURIComponent(keyword)}&display=100&sort=sim`,
      {
        headers: {
          'X-Naver-Client-Id': naverClientId,
          'X-Naver-Client-Secret': naverClientSecret,
        },
      }
    );
    const data = await res.json() as {
      total?: number;
      items?: Array<{ title: string; description: string; bloggername: string; bloggerlink: string; postdate: string; link: string }>;
    };

    const items = data.items || [];
    const totalResults = data.total || 0;

    // Find blog's position in results
    const myPosts: Array<{ rank: number; title: string; date: string; url: string }> = [];
    items.forEach((item, idx) => {
      const isMyBlog = item.bloggerlink?.includes(cleanBlogId) || item.link?.includes(cleanBlogId);
      if (isMyBlog) {
        myPosts.push({
          rank: idx + 1,
          title: item.title.replace(/<[^>]+>/g, ''),
          date: item.postdate,
          url: item.link,
        });
      }
    });

    const exposed = myPosts.length > 0;
    const topRank = exposed ? myPosts[0].rank : null;

    let statusLabel = '미노출';
    let statusColor = 'red';
    if (exposed && topRank && topRank <= 3) { statusLabel = '🥇 상위 3위'; statusColor = 'gold'; }
    else if (exposed && topRank && topRank <= 10) { statusLabel = '✅ 1페이지 노출'; statusColor = 'green'; }
    else if (exposed && topRank && topRank <= 20) { statusLabel = '📊 2페이지 노출'; statusColor = 'blue'; }
    else if (exposed) { statusLabel = `📍 ${topRank}위 노출`; statusColor = 'gray'; }

    return NextResponse.json({
      keyword,
      blogId: cleanBlogId,
      exposed,
      topRank,
      statusLabel,
      statusColor,
      myPosts,
      totalResults,
      checkedCount: items.length,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
