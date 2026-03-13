import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { Client } from '@notionhq/client';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data } = await supabase
      .from('bossai_company_settings')
      .select('notion_config')
      .eq('user_id', user.id)
      .single();

    const config = data?.notion_config ?? {};
    if (!config.apiKey) {
      return NextResponse.json({ error: 'Notion API 키가 설정되지 않았습니다.' }, { status: 400 });
    }

    const q = new URL(req.url).searchParams.get('q') ?? '';
    const notion = new Client({ auth: config.apiKey });

    const res = await notion.search({
      query: q,
      filter: { value: 'page', property: 'object' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 20,
    });

    const pages = res.results.map((page) => {
      const p = page as {
        id: string;
        url: string;
        properties?: { title?: { title?: { plain_text?: string }[] } };
      };
      const titleProp = p.properties?.title?.title;
      const title = titleProp?.[0]?.plain_text ?? '(제목 없음)';
      return { id: p.id, title, url: p.url };
    });

    return NextResponse.json({ pages });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
