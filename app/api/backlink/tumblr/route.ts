import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 30;

// POST: Tumblr에 링크 포스트 발행
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, meta_description, keyword, canonical_url, representative_image_url } = await req.json() as {
    title: string;
    meta_description: string;
    keyword: string;
    canonical_url: string;
    representative_image_url?: string;
  };

  if (!title || !canonical_url) return NextResponse.json({ error: 'title, canonical_url 필요' }, { status: 400 });

  const [token, blogName] = await Promise.all([
    getSetting('TUMBLR_ACCESS_TOKEN'),
    getSetting('TUMBLR_BLOG_NAME'),
  ]);

  if (!token || !blogName) return NextResponse.json({ error: 'Tumblr 토큰/블로그명이 설정되지 않았습니다' }, { status: 400 });

  const tags = [
    keyword?.split(' ')[0] || 'korea',
    'korea',
    'korean-blog',
    'news',
  ].filter(Boolean);

  // Tumblr NPF(Neue Post Format) v2
  const body: Record<string, unknown> = {
    content: [
      ...(representative_image_url ? [{
        type: 'image',
        media: [{ type: 'image/jpeg', url: representative_image_url }],
        alt_text: title,
      }] : []),
      { type: 'text', text: title, subtype: 'heading1' },
      { type: 'text', text: meta_description || '' },
      { type: 'link', url: canonical_url, title, description: meta_description || '' },
    ],
    tags,
    state: 'published',
  };

  try {
    const res = await fetch(`https://api.tumblr.com/v2/blog/${blogName}/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Tumblr 오류: ${err.slice(0, 200)}` }, { status: 500 });
    }

    const data = await res.json();
    const postId = data.response?.id_string || data.response?.id;
    const postUrl = postId ? `https://${blogName}.tumblr.com/post/${postId}` : undefined;
    return NextResponse.json({ success: true, url: postUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET: 연결 상태 확인
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const [token, blogName] = await Promise.all([
    getSetting('TUMBLR_ACCESS_TOKEN'),
    getSetting('TUMBLR_BLOG_NAME'),
  ]);

  return NextResponse.json({ configured: !!(token && blogName), blog_name: blogName || '' });
}
