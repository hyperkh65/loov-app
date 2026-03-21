import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

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
  if (!config?.apiKey) return NextResponse.json({ error: 'Notion API 키 없음' }, { status: 400 });

  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Notion-Version': '2022-06-28',
  };

  try {
    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, { headers });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.message }, { status: 502 });

    const media: { type: 'image' | 'video'; url: string }[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const block of (data.results || []) as any[]) {
      if (block.type === 'image') {
        const url =
          block.image?.file?.url ||
          block.image?.external?.url ||
          block.image?.file_upload?.url || '';
        if (url) media.push({ type: 'image', url });
      } else if (block.type === 'video') {
        const url =
          block.video?.file?.url ||
          block.video?.external?.url ||
          block.video?.file_upload?.url || '';
        if (url) media.push({ type: 'video', url });
      }
    }

    return NextResponse.json({ media });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
