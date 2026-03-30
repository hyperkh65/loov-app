/**
 * POST /api/memo/backup
 * 버튼 한 번 → Notion + NAS 동시 저장
 * 메모 데이터를 body로 직접 받아 Supabase 조회 없이도 동작
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
async function backupToNotion(memo: Memo, notionToken: string, notionDbId: string): Promise<{ pageId: string | null; error: string }> {
  if (!notionToken) return { pageId: null, error: 'Notion API 키 없음' };
  if (!notionDbId)  return { pageId: null, error: 'Notion DB ID 없음' };

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
          Category: { select: { name: memo.category || '기타' } },
          Tags:     { multi_select: (memo.tags || []).map(t => ({ name: t })) },
          Date:     { date: { start: memo.memo_date } },
          Summary:  { rich_text: [{ text: { content: memo.summary || '' } }] },
        },
        children: [
          ...(memo.summary ? [{
            object: 'block', type: 'callout',
            callout: {
              rich_text: [{ text: { content: memo.summary } }],
              icon: { emoji: '💡' }, color: 'blue_background',
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

    const data = await res.json() as { id?: string; message?: string; code?: string };
    if (!res.ok) return { pageId: null, error: `Notion API 오류 (${res.status}): ${data.message || data.code || ''}` };
    return { pageId: data.id || null, error: '' };
  } catch (e) {
    return { pageId: null, error: String(e) };
  }
}

// ── NAS SSH 저장 ───────────────────────────────────────────────
async function backupToNas(memo: Memo, nasPath: string): Promise<{ ok: boolean; error: string }> {
  try {
    const dir = nasPath || '/volume1/memos';
    const filename = `${memo.memo_date}_${memo.id.slice(0, 8)}.json`;
    // 싱글쿼트 이스케이프
    const json = JSON.stringify(memo, null, 2).replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
    const { code, stderr } = await nasExec(
      `mkdir -p "${dir}" && printf '%s' '${json}' > "${dir}/${filename}" && echo OK`
    );
    if (code !== 0) return { ok: false, error: stderr || `exit code ${code}` };
    return { ok: true, error: '' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ── 메인 핸들러 ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as {
    id: string;
    memo?: Memo;           // 직접 전달 (Supabase 조회 불필요)
    notionToken?: string;
    notionDbId?: string;
    nasPath?: string;
  };
  const { id, notionToken, notionDbId, nasPath } = body;
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  // 메모 데이터: body에 있으면 사용, 없으면 Supabase 조회
  let memo: Memo | null = body.memo || null;
  if (!memo) {
    const { data } = await supabase.from('bossai_memos')
      .select('*').eq('id', id).eq('user_id', user.id).single();
    memo = data as Memo | null;
  }
  if (!memo) return NextResponse.json({ error: '메모를 찾을 수 없음' }, { status: 404 });

  // 키 우선순위: body → env
  const token = notionToken  || process.env.NOTION_API_KEY || '';
  const dbId  = notionDbId   || process.env.NOTION_MEMO_DBID || '';
  const path  = nasPath      || process.env.NAS_MEMO_PATH || '/volume1/memos';

  // 동시 실행
  const [notionResult, nasResult] = await Promise.all([
    backupToNotion(memo, token, dbId),
    backupToNas(memo, path),
  ]);

  // Supabase 상태 업데이트 (실패해도 무시)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nasResult.ok)           updates.backup_nas    = true;
  if (notionResult.pageId)    { updates.backup_notion = true; updates.notion_page_id = notionResult.pageId; }
  try { await supabase.from('bossai_memos').update(updates).eq('id', id); } catch {}

  const notionMsg = notionResult.pageId ? '📔 Notion 저장됨' : `📔 Notion 실패: ${notionResult.error}`;
  const nasMsg    = nasResult.ok        ? '🖥️ NAS 저장됨'   : `🖥️ NAS 실패: ${nasResult.error}`;

  return NextResponse.json({
    ok: notionResult.pageId !== null || nasResult.ok,
    notion: !!notionResult.pageId,
    nas: nasResult.ok,
    message: `${notionMsg} · ${nasMsg}`,
  });
}
