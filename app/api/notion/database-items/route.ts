import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { extractTitle } from '@/lib/notion/to-html';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dbId = req.nextUrl.searchParams.get('dbId');
  if (!dbId) return NextResponse.json({ error: 'dbId 필요' }, { status: 400 });

  // 기존 노션 설정에서 API 키 자동 로드
  const { data: settings } = await supabase
    .from('bossai_company_settings')
    .select('notion_config')
    .eq('user_id', user.id)
    .single();
  const config = settings?.notion_config as { apiKey?: string } | null;
  if (!config?.apiKey) return NextResponse.json({ error: 'Notion API 키를 먼저 설정해주세요.' }, { status: 400 });
  const apiKey = config.apiKey;

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
