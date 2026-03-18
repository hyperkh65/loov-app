import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { blocksToHtml, extractTitle } from '@/lib/notion/to-html';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pageId = req.nextUrl.searchParams.get('pageId');
  if (!pageId) return NextResponse.json({ error: 'pageId 필요' }, { status: 400 });

  const { data: settings } = await supabase
    .from('bossai_company_settings')
    .select('notion_config')
    .eq('user_id', user.id)
    .single();

  const config = settings?.notion_config as { apiKey?: string } | null;
  if (!config?.apiKey) {
    return NextResponse.json({ error: 'Notion API 키를 먼저 설정해주세요.' }, { status: 400 });
  }

  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    const [pageRes, blocksRes] = await Promise.all([
      fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers }),
      fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, { headers }),
    ]);

    const page = await pageRes.json();
    const blocksData = await blocksRes.json();

    const title = extractTitle(page.properties || {});
    const content = blocksToHtml(blocksData.results || []);
    // plain text for AI prompt context
    const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    return NextResponse.json({ title, content, plainText });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
