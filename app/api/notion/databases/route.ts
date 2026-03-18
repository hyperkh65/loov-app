import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = req.nextUrl.searchParams.get('apiKey');
  if (!apiKey) return NextResponse.json({ error: 'apiKey 필요' }, { status: 400 });

  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { value: 'database', property: 'object' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 30,
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.message || '조회 실패' }, { status: 502 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const databases = (data.results || []).map((db: any) => ({
      id: db.id,
      title: db.title?.[0]?.plain_text || db.title?.map((t: { plain_text?: string }) => t.plain_text || '').join('') || '(제목 없음)',
      url: db.url,
      last_edited: db.last_edited_time,
    }));
    return NextResponse.json({ databases });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
