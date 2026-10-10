import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getBloggerToken } from '@/lib/blogger-token';

const BLOG_ID = '7951763866955162015';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: tokenRow } = await supabase
    .from('bossai_blogger_tokens')
    .select('email, updated_at')
    .eq('user_id', user.id)
    .single();

  if (!tokenRow) {
    return NextResponse.json({ connected: false });
  }

  const accessToken = await getBloggerToken();
  if (!accessToken) {
    return NextResponse.json({ connected: false });
  }

  try {
    const blogRes = await fetch(
      `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!blogRes.ok) {
      return NextResponse.json({
        connected: true,
        email: tokenRow.email,
        blog: null,
        error: '블로그 정보를 불러오지 못했습니다.',
      });
    }

    const blog = await blogRes.json();
    return NextResponse.json({
      connected: true,
      email: tokenRow.email,
      blog: {
        id: blog.id,
        name: blog.name,
        url: blog.url,
        postCount: blog.posts?.totalItems ?? 0,
      },
    });
  } catch (err) {
    console.error('Blogger status error:', err);
    return NextResponse.json({ connected: true, email: tokenRow.email, blog: null });
  }
}
