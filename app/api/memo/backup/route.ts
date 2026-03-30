/**
 * POST /api/memo/backup
 * 버튼 한 번 → Notion + NAS 동시 저장
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec } from '@/lib/nas-ssh';

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
  action_items?: string[];
}

// ── Notion 저장 ────────────────────────────────────────────────
async function backupToNotion(memo: Memo, notionToken: string, notionDbId: string): Promise<string | null> {
  if (!notionToken || !notionDbId) return null;
  const dbId = notionDbId.replace(/-/g, '');
  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          이름:     { title: [{ text: { content: memo.title || memo.content.slice(0, 60) } }] },
          Category: { select: { name: memo.category } },
          Tags:     { multi_select: (memo.tags || []).map(t => ({ name: t })) },
          Date:     { date: { start: memo.memo_date } },
        },
        children: [
          ...(memo.summary ? [{
            object: 'block', type: 'callout',
            callout: {
              rich_text: [{ text: { content: memo.summary } }],
              icon: { emoji: '💡' },
              color: 'blue_background',
            },
          }] : []),
          {
            object: 'block', type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: memo.content } }] },
          },
          ...(memo.action_items?.length ? [
            { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ text: { content: '액션 아이템' } }] } },
            ...memo.action_items.map(item => ({
              object: 'block', type: 'to_do',
              to_do: { rich_text: [{ text: { content: item } }], checked: false },
            })),
          ] : []),
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { id?: string };
    return data.id || null;
  } catch { return null; }
}

// ── NAS SSH 저장 ───────────────────────────────────────────────
async function backupToNas(memo: Memo, nasPath: string): Promise<boolean> {
  try {
    const dir = nasPath || '/volume1/memos';
    const filename = `${memo.memo_date}_${memo.id.slice(0, 8)}.json`;
    const json = JSON.stringify(memo, null, 2).replace(/'/g, "'\\''");

    const { code } = await nasExec(
      `mkdir -p "${dir}" && echo '${json}' > "${dir}/${filename}" && echo OK`
    );
    return code === 0;
  } catch { return false; }
}

// ── 메인 핸들러 ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as {
    id: string;
    notionToken?: string;
    notionDbId?: string;
    nasPath?: string;
  };
  const { id, notionToken, notionDbId, nasPath } = body;
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const { data: memo } = await supabase.from('bossai_memos')
    .select('*').eq('id', id).eq('user_id', user.id).single();
  if (!memo) return NextResponse.json({ error: '메모 없음' }, { status: 404 });

  // 서버 env 폴백
  const token  = notionToken  || process.env.NOTION_API_KEY || '';
  const dbId   = notionDbId   || process.env.NOTION_MEMO_DBID || process.env.NOTION_AI_NEWS_DBID || '';
  const path   = nasPath      || process.env.NAS_MEMO_PATH || '/volume1/memos';

  // 동시 실행
  const [notionPageId, nasOk] = await Promise.all([
    backupToNotion(memo as Memo, token, dbId),
    backupToNas(memo as Memo, path),
  ]);

  // 상태 업데이트
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nasOk)         updates.backup_nas    = true;
  if (notionPageId)  { updates.backup_notion = true; updates.notion_page_id = notionPageId; }
  await supabase.from('bossai_memos').update(updates).eq('id', id);

  return NextResponse.json({
    ok: true,
    notion: !!notionPageId,
    nas: nasOk,
    message: [
      notionPageId ? '📔 Notion 저장됨' : '📔 Notion 실패 (API키/DB ID 확인)',
      nasOk        ? '🖥️ NAS 저장됨'   : '🖥️ NAS 실패',
    ].join(' · '),
  });
}
