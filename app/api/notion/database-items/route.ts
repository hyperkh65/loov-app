import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { extractTitle } from '@/lib/notion/to-html';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = req.nextUrl.searchParams.get('apiKey');
  const dbId = req.nextUrl.searchParams.get('dbId');
  if (!apiKey || !dbId) return NextResponse.json({ error: 'apiKey, dbId 필요' }, { status: 400 });

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 50 }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.message || '조회 실패' }, { status: 502 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (data.results || []).map((page: any) => {
      const title = extractTitle(page.properties || {});
      // Extract cover/icon image if available
      const coverUrl = page.cover?.file?.url || page.cover?.external?.url || '';
      return {
        id: page.id,
        title,
        url: page.url,
        coverUrl,
        last_edited: page.last_edited_time,
      };
    });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
