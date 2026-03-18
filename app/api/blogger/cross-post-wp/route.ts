import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    title: string;
    content: string;
    labels?: string[];
    isDraft?: boolean;
    wpUrl: string;
    wpUsername: string;
    wpPassword: string;
  };

  const { title, content, labels = [], isDraft = false, wpUrl, wpUsername, wpPassword } = body;
  if (!title || !content || !wpUrl || !wpUsername || !wpPassword)
    return NextResponse.json({ error: '필수 항목이 누락되었습니다' }, { status: 400 });

  const siteUrl = wpUrl.replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(`${wpUsername}:${wpPassword}`).toString('base64');

  try {
    // 태그 생성/조회
    const tagIds: number[] = [];
    for (const name of labels.slice(0, 10)) {
      try {
        const search = await fetch(`${siteUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}`, {
          headers: { Authorization: auth },
        });
        if (search.ok) {
          const list = await search.json();
          if (list.length > 0) { tagIds.push(list[0].id); continue; }
        }
        const create = await fetch(`${siteUrl}/wp-json/wp/v2/tags`, {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (create.ok) tagIds.push((await create.json()).id);
      } catch { /* skip */ }
    }

    const postBody: Record<string, unknown> = {
      title,
      content,
      status: isDraft ? 'draft' : 'publish',
      ...(tagIds.length ? { tags: tagIds } : {}),
    };

    const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `WP 발행 실패 (${res.status}): ${errText.slice(0, 200)}` }, { status: res.status });
    }

    const post = await res.json();
    return NextResponse.json({ id: post.id, url: post.link, status: post.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
