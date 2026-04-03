/**
 * WeChat 백업 히스토리 조회 API
 * GET /api/wechat/history         — 백업 목록 (Notion DB 쿼리)
 * GET /api/wechat/history?id=xxx  — 특정 페이지 상세 (블록 조회)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { Client } from '@notionhq/client';

const WECHAT_NOTION_DB = '3371f4ff9a0e803e913cebe199fde98e';

async function getNotionClient(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: settings } = await supabase
    .from('bossai_company_settings')
    .select('notion_config')
    .eq('user_id', user.id)
    .single();
  const apiKey = settings?.notion_config?.apiKey;
  if (!apiKey) return null;
  return new Client({ auth: apiKey });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const notion = await getNotionClient(supabase);
    if (!notion) return NextResponse.json({ error: 'Notion 설정 필요' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const pageId = searchParams.get('id');

    // 특정 페이지 상세 조회 (블록 페이지네이션 지원)
    if (pageId) {
      const blockCursor = searchParams.get('blockCursor') ?? undefined;
      const blocks = await notion.blocks.children.list({
        block_id: pageId,
        page_size: 100,
        ...(blockCursor ? { start_cursor: blockCursor } : {}),
      });
      const content: { type: string; text: string }[] = [];
      for (const block of blocks.results) {
        if (!('type' in block)) continue;
        const b = block as { type: string; [key: string]: unknown };
        const type = b.type as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const richText: Array<{ plain_text: string }> = (b[type] as any)?.rich_text ?? [];
        const text = richText.map((r) => r.plain_text).join('');
        if (text) content.push({ type, text });
      }
      return NextResponse.json({
        content,
        nextBlockCursor: blocks.next_cursor,
        hasMoreBlocks: blocks.has_more,
      });
    }

    // 목록 조회
    const cursor = searchParams.get('cursor') ?? undefined;
    const res = await notion.databases.query({
      database_id: WECHAT_NOTION_DB,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      page_size: 20,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    const pages = res.results.map((page) => {
      if (!('properties' in page)) return null;
      const p = page as { id: string; created_time: string; properties: Record<string, { type: string; title?: Array<{ plain_text: string }>; date?: { start: string }; number?: number }> };
      // title 찾기
      const titleProp = Object.values(p.properties).find((v) => v.type === 'title');
      const title = titleProp?.title?.map((t) => t.plain_text).join('') ?? '';
      // 날짜
      const dateProp = p.properties['날짜'] ?? p.properties['Date'];
      const date = dateProp?.date?.start ?? p.created_time.slice(0, 10);
      // 메시지수
      const countProp = p.properties['메시지수'];
      const count = countProp?.number ?? null;
      return { id: p.id, title, date, count };
    }).filter(Boolean);

    return NextResponse.json({ pages, nextCursor: res.next_cursor, hasMore: res.has_more });
  } catch (e) {
    console.error('wechat/history:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
