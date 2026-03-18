import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

function blockToHtml(block: Record<string, unknown>): string {
  const getRich = (richText: Array<{plain_text?: string; annotations?: {bold?: boolean; italic?: boolean; code?: boolean}; href?: string}>) =>
    (richText || []).map(t => {
      let text = t.plain_text || '';
      if (t.annotations?.bold) text = `<strong>${text}</strong>`;
      if (t.annotations?.italic) text = `<em>${text}</em>`;
      if (t.annotations?.code) text = `<code>${text}</code>`;
      if (t.href) text = `<a href="${t.href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      return text;
    }).join('');

  const type = block.type as string;
  const b = block[type] as Record<string, unknown> | undefined;
  if (!b) return '';

  switch (type) {
    case 'heading_1': return `<h1>${getRich(b.rich_text as never)}</h1>`;
    case 'heading_2': return `<h2>${getRich(b.rich_text as never)}</h2>`;
    case 'heading_3': return `<h3>${getRich(b.rich_text as never)}</h3>`;
    case 'paragraph': {
      const text = getRich(b.rich_text as never);
      return text ? `<p>${text}</p>` : '<br>';
    }
    case 'bulleted_list_item': return `<ul><li>${getRich(b.rich_text as never)}</li></ul>`;
    case 'numbered_list_item': return `<ol><li>${getRich(b.rich_text as never)}</li></ol>`;
    case 'quote': return `<blockquote style="border-left:4px solid #ccc;padding-left:1em;color:#555">${getRich(b.rich_text as never)}</blockquote>`;
    case 'code': return `<pre style="background:#f4f4f4;padding:1em;border-radius:4px;overflow-x:auto"><code>${getRich(b.rich_text as never)}</code></pre>`;
    case 'image': {
      const img = b as Record<string, {url?: string}>;
      const url = img.file?.url || img.external?.url || '';
      return url ? `<img src="${url}" alt="" style="max-width:100%;height:auto;margin:1em 0">` : '';
    }
    case 'divider': return '<hr>';
    case 'callout': return `<div style="background:#f0f4ff;border-left:4px solid #4f8ef7;padding:1em;border-radius:4px;margin:1em 0">${getRich(b.rich_text as never)}</div>`;
    default: return '';
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pageId = req.nextUrl.searchParams.get('pageId');
  if (!pageId) return NextResponse.json({ error: 'pageId 필요' }, { status: 400 });

  const { data: settings } = await supabase
    .from('bossai_blogger_settings')
    .select('notion_token')
    .eq('user_id', user.id)
    .single();

  if (!settings?.notion_token) {
    return NextResponse.json({ error: 'Notion 토큰을 먼저 설정해주세요.' }, { status: 400 });
  }

  const headers = {
    Authorization: `Bearer ${settings.notion_token}`,
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

    const props = page.properties as Record<string, unknown> | undefined;
    const titleProp = (props?.title as Record<string, unknown> | undefined) || (props?.Name as Record<string, unknown> | undefined);
    const titleArr = titleProp?.title as Array<{plain_text?: string}> | undefined;
    const title = titleArr?.[0]?.plain_text || '';

    const blocks = (blocksData.results || []) as Array<Record<string, unknown>>;
    const html = blocks.map(blockToHtml).filter(Boolean).join('\n');

    return NextResponse.json({ title, content: html });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
