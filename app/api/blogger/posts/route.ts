import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getBloggerToken } from '@/lib/blogger-token';

const BLOG_ID = '7951763866955162015';
const BLOGGER_API = `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts`;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accessToken = await getBloggerToken();
  if (!accessToken) {
    return NextResponse.json({ error: 'Blogger 연결이 필요합니다.' }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${BLOGGER_API}?maxResults=20&status=live&status=draft&fetchImages=false&fields=items(id,title,url,status,published,labels)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(
        { error: errData.error?.message || 'Blogger API 오류' },
        { status: res.status }
      );
    }

    const data = await res.json();
    const posts = (data.items || []).map((item: {
      id: string;
      title: string;
      url?: string;
      status?: string;
      published?: string;
      labels?: string[];
    }) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      status: item.status,
      published: item.published,
      labels: item.labels || [],
    }));

    return NextResponse.json({ posts });
  } catch (err) {
    console.error('Blogger posts GET error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accessToken = await getBloggerToken();
  if (!accessToken) {
    return NextResponse.json({ error: 'Blogger 연결이 필요합니다.' }, { status: 401 });
  }

  const body = await req.json() as {
    title: string;
    content: string;
    labels?: string[];
    isDraft?: boolean;
    keyword?: string;
    contentType?: string;
  };

  const { title, content, isDraft = false } = body;

  // 제목 정제: 앞뒤 공백, null byte 제거, 500자 제한
  const cleanTitle = (title || '').replace(/\x00/g, '').trim().slice(0, 500);
  // 본문 정제: null byte 제거 + data: URL 이미지 제거 (Blogger API가 거부함)
  const cleanContent = (content || '')
    .replace(/\x00/g, '')
    .replace(/<img[^>]+src=["']data:[^"']+["'][^>]*\/?>/gi, '');
  // 라벨 정제: 특수문자/개행/null 제거, 100자 제한, 최대 5개
  const labels = (body.labels || [])
    .map((l: string) => l.replace(/[<>"'\x00\r\n]/g, '').trim().slice(0, 100))
    .filter((l: string) => l.length > 0)
    .slice(0, 5);

  if (!cleanTitle || !cleanContent) {
    return NextResponse.json({ error: '제목과 본문은 필수입니다.' }, { status: 400 });
  }

  try {
    // labels 없이 먼저 시도, 에러 시 labels 제외 재시도
    const makePayload = (withLabels: boolean): Record<string, unknown> => ({
      title: cleanTitle,
      content: cleanContent,
      ...(withLabels && labels.length > 0 ? { labels } : {}),
    });

    const publishParam = isDraft ? '?isDraft=true' : '';
    const url = `${BLOGGER_API}${publishParam}`;

    let res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(makePayload(true)),
    });

    // labels로 인한 오류면 labels 없이 재시도
    if (!res.ok && labels.length > 0) {
      const errCheck = await res.json();
      if (errCheck.error?.code === 400) {
        res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(makePayload(false)),
        });
      } else {
        return NextResponse.json(
          { error: errCheck.error?.message || 'Blogger 발행 실패', detail: errCheck },
          { status: res.status }
        );
      }
    }

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(
        { error: errData.error?.message || 'Blogger 발행 실패', detail: errData },
        { status: res.status }
      );
    }

    const post = await res.json();

    // 이력 저장
    await supabase.from('bossai_blogger_history').insert({
      user_id: user.id,
      blog_id: BLOG_ID,
      post_id: post.id,
      title: post.title || cleanTitle,
      keyword: body.keyword || null,
      content_type: body.contentType || null,
      labels,
      status: isDraft ? 'DRAFT' : 'LIVE',
      blogger_url: post.url || null,
      published_at: post.published || new Date().toISOString(),
    });

    return NextResponse.json({
      id: post.id,
      title: post.title,
      url: post.url,
      status: post.status,
      published: post.published,
    });
  } catch (err) {
    console.error('Blogger posts POST error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
