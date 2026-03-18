import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: settings } = await supabase
    .from('bossai_company_settings')
    .select('notion_config')
    .eq('user_id', user.id)
    .single();

  const config = settings?.notion_config as { apiKey?: string; databaseId?: string } | null;
  if (!config?.apiKey) {
    return NextResponse.json({ error: 'Notion API 키를 먼저 설정해주세요. (노션 설정 페이지)' }, { status: 400 });
  }

  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages = (data.results || []).map((page: any) => {
      const props = page.properties || {};
      let title = '(제목 없음)';
      for (const key of Object.keys(props)) {
        const p = props[key];
        if (p.type === 'title' && Array.isArray(p.title) && p.title.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          title = p.title.map((t: any) => t.plain_text || '').join('') || '(제목 없음)';
          break;
        }
      }
      return { id: page.id, title, url: page.url, last_edited: page.last_edited_time };
    });

    return NextResponse.json({ pages });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
