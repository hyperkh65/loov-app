import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: settings } = await supabase
    .from('bossai_blogger_settings')
    .select('notion_token')
    .eq('user_id', user.id)
    .single();

  if (!settings?.notion_token) {
    return NextResponse.json({ error: 'Notion 토큰을 먼저 설정해주세요.' }, { status: 400 });
  }

  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.notion_token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { value: 'page', property: 'object' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 30,
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.message || '조회 실패' }, { status: 502 });

    const pages = (data.results || []).map((page: Record<string, unknown>) => {
      const props = page.properties as Record<string, unknown> | undefined;
      const titleProp = (props?.title as Record<string, unknown> | undefined) || (props?.Name as Record<string, unknown> | undefined);
      const titleArr = titleProp?.title as Array<{plain_text?: string}> | undefined;
      return {
        id: page.id,
        title: titleArr?.[0]?.plain_text || '(제목 없음)',
        url: page.url,
        last_edited: page.last_edited_time,
      };
    });

    return NextResponse.json({ pages });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
