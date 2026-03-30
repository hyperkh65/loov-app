/**
 * POST /api/memo/backup
 * 메모를 NAS + 노션에 백업 (3중 백업: DB는 기본)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

interface Memo {
  id: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  memo_date: string;
  created_at: string;
}

async function backupToNotion(memo: Memo): Promise<string | null> {
  const token = process.env.NOTION_API_KEY || '';
  const dbId = (process.env.NOTION_MEMO_DBID || process.env.NOTION_AI_NEWS_DBID || '').replace(/-/g, '');
  if (!token || !dbId) return null;

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          이름: { title: [{ text: { content: memo.title || memo.content.slice(0, 50) } }] },
          Category: { select: { name: memo.category } },
          Tags: { multi_select: memo.tags.map(t => ({ name: t })) },
          Date: { date: { start: memo.memo_date } },
        },
        children: [
          {
            object: 'block', type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: memo.summary || '' } }] },
          },
          {
            object: 'block', type: 'divider', divider: {},
          },
          {
            object: 'block', type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: memo.content } }] },
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { id?: string };
    return data.id || null;
  } catch { return null; }
}

async function backupToNas(memo: Memo): Promise<boolean> {
  const nasUrl = process.env.NAS_MEMO_WEBHOOK || '';
  if (!nasUrl) return false;

  try {
    const res = await fetch(nasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: memo.id,
        title: memo.title || memo.content.slice(0, 50),
        content: memo.content,
        summary: memo.summary,
        tags: memo.tags,
        category: memo.category,
        date: memo.memo_date,
        created_at: memo.created_at,
      }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const { data: memo } = await supabase.from('bossai_memos')
    .select('*').eq('id', id).eq('user_id', user.id).single();

  if (!memo) return NextResponse.json({ error: '메모 없음' }, { status: 404 });

  const [notionPageId, nasOk] = await Promise.all([
    backupToNotion(memo as Memo),
    backupToNas(memo as Memo),
  ]);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nasOk) updates.backup_nas = true;
  if (notionPageId) { updates.backup_notion = true; updates.notion_page_id = notionPageId; }

  await supabase.from('bossai_memos').update(updates).eq('id', id);

  return NextResponse.json({
    ok: true,
    notion: !!notionPageId,
    nas: nasOk,
  });
}
