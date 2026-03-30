/**
 * POST /api/memo/backup
 * Notion (속성+파일) + NAS (JSON+파일) 동시 백업
 * 첨부파일 최대 4개, Notion 용량 초과 시 해당 파일만 스킵 NAS에는 저장
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { nasExec } from '@/lib/nas-ssh';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface AttachFile { name: string; base64: string; type: string; }
interface Memo {
  id: string; title: string; content: string; summary: string;
  tags: string[]; category: string; memo_date: string; created_at: string;
  action_items?: string[];
}

// ── NAS 파일 저장 ─────────────────────────────────────────────
async function saveFilesToNas(
  files: AttachFile[], dir: string, nasPass: string
): Promise<{ name: string; ok: boolean; error: string }[]> {
  const results = [];
  for (const f of files.slice(0, 4)) {
    try {
      const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const { code, stderr } = await nasExec(
        `echo "${f.base64}" | base64 -d > "${dir}/${safeName}" && echo OK`
      );
      results.push({ name: f.name, ok: code === 0, error: code !== 0 ? (stderr || `exit ${code}`) : '' });
    } catch (e) {
      results.push({ name: f.name, ok: false, error: String(e) });
    }
  }
  return results;
}

// ── Notion 저장 ───────────────────────────────────────────────
async function backupToNotion(
  memo: Memo,
  token: string,
  dbId: string,
  fileNames: string[],  // NAS 저장된 파일명 (URL 속성에 경로 저장)
  nasDir: string,
): Promise<{ pageId: string | null; error: string; skippedFiles: string[] }> {
  if (!token) return { pageId: null, error: 'Notion API 키 없음', skippedFiles: [] };
  if (!dbId)  return { pageId: null, error: 'Notion DB ID 없음', skippedFiles: [] };

  const cleanDbId = dbId.replace(/-/g, '');

  // DB title 속성 이름 자동 감지
  let titleProp = 'Name';
  try {
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${cleanDbId}`, {
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28' },
    });
    if (dbRes.ok) {
      const dbData = await dbRes.json() as { properties?: Record<string, { type: string }> };
      const found = Object.entries(dbData.properties || {}).find(([, v]) => v.type === 'title');
      if (found) titleProp = found[0];
    }
  } catch {}

  // file 속성 (file1~4): NAS 경로를 URL로 저장
  const fileProps: Record<string, { url: string }> = {};
  fileNames.slice(0, 4).forEach((name, i) => {
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    fileProps[`file${i + 1}`] = { url: `nas://${nasDir}/${safeName}` };
  });

  const buildBody = (includeFiles: boolean) => ({
    parent: { database_id: cleanDbId },
    properties: {
      [titleProp]: { title: [{ text: { content: memo.title || memo.content.slice(0, 60) } }] },
      Category: { select: { name: memo.category || '기타' } },
      Tags: { multi_select: (memo.tags || []).map(t => ({ name: t })) },
      Date: { date: { start: memo.memo_date } },
      Summary: { rich_text: [{ text: { content: (memo.summary || '').slice(0, 2000) } }] },
      ...(includeFiles ? fileProps : {}),
    },
    children: [
      {
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: memo.content.slice(0, 2000) } }] },
      },
      ...(memo.content.length > 2000 ? [{
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: memo.content.slice(2000, 4000) } }] },
      }] : []),
      ...(memo.action_items?.length ? [
        { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ text: { content: '✅ 액션 아이템' } }] } },
        ...memo.action_items.map(item => ({
          object: 'block', type: 'to_do',
          to_do: { rich_text: [{ text: { content: item } }], checked: false },
        })),
      ] : []),
    ],
  });

  const skippedFiles: string[] = [];

  // 파일 포함해서 시도
  let res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify(buildBody(fileNames.length > 0)),
    signal: AbortSignal.timeout(20000),
  });

  // 용량 초과(413) 또는 파일 관련 오류 → 파일 없이 재시도
  if (!res.ok && fileNames.length > 0) {
    const errText = await res.text();
    if (res.status === 413 || errText.includes('file') || errText.includes('size')) {
      skippedFiles.push(...fileNames);
      res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(false)),
        signal: AbortSignal.timeout(20000),
      });
    }
  }

  const data = await res.json() as { id?: string; message?: string };
  if (!res.ok) return { pageId: null, error: `Notion (${res.status}): ${data.message || ''}`, skippedFiles };
  return { pageId: data.id || null, error: '', skippedFiles };
}

// ── Google Calendar + 로컬 스케줄 연동 ───────────────────────
async function syncToCalendar(memo: Memo, userId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const eventTitle = memo.title || memo.content.slice(0, 40);
  const eventDesc  = memo.summary || memo.content.slice(0, 200);

  // 1. 로컬 스케줄 테이블 추가
  try {
    await supabase.from('bossai_schedule_events').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      title: eventTitle,
      description: eventDesc,
      date: memo.memo_date,
      time: null,
      type: memo.category === '일정' ? 'meeting' : 'other',
      assigned_employee_ids: [],
      is_all_day: true,
      source: 'memo',
      color: '#6366f1',
    });
  } catch {}

  // 2. Google Calendar API 직접 추가
  try {
    const { data: tokenRow } = await supabase
      .from('bossai_google_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (!tokenRow) return;

    let accessToken = tokenRow.access_token;

    // 토큰 만료 시 갱신
    if (new Date(tokenRow.expires_at) <= new Date()) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: tokenRow.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      const d = await res.json() as { access_token?: string; expires_in?: number };
      if (d.access_token) {
        accessToken = d.access_token;
        await supabase.from('bossai_google_tokens').update({
          access_token: d.access_token,
          expires_at: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString(),
        }).eq('user_id', userId);
      }
    }

    await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: `📓 ${eventTitle}`,
        description: eventDesc,
        start: { date: memo.memo_date },
        end: { date: memo.memo_date },
        colorId: '9', // 블루베리
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {}
}

// ── 메인 핸들러 ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as {
    id: string;
    memo?: Memo;
    files?: AttachFile[];        // 첨부파일 최대 4개
    notionToken?: string;
    notionDbId?: string;
    nasPath?: string;
    addToCalendar?: boolean;
  };
  const { id, files = [], notionToken, notionDbId, nasPath, addToCalendar = true } = body;
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  // 메모 데이터
  let memo: Memo | null = body.memo || null;
  if (!memo) {
    const { data } = await supabase.from('bossai_memos').select('*').eq('id', id).eq('user_id', user.id).single();
    memo = data as Memo | null;
  }
  if (!memo) return NextResponse.json({ error: '메모를 찾을 수 없음' }, { status: 404 });

  const token   = notionToken || process.env.NOTION_API_KEY || '';
  const dbId    = notionDbId  || process.env.NOTION_MEMO_DBID || '';
  const nasBase = nasPath     || process.env.NAS_MEMO_PATH   || '/volume1/memos';
  const nasPass = process.env.NAS_SSH_PASSWORD || 'Aa050677##7759';
  const nasDir  = `${nasBase}/${memo.memo_date}_${id.slice(0, 8)}`;

  // 1. NAS: 디렉토리 생성 (sudo) + JSON 메타 저장
  const memoJson = JSON.stringify({ ...memo, files: files.map(f => ({ name: f.name, type: f.type })) }, null, 2)
    .replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  const { code: jsonCode, stderr: jsonErr } = await nasExec(
    `echo "${nasPass}" | sudo -S sh -c 'mkdir -p "${nasDir}" && chmod 777 "${nasDir}"' && printf '%s' '${memoJson}' > "${nasDir}/memo.json" && echo OK`
  ).catch((e) => ({ code: 1, stdout: '', stderr: String(e) }));

  // 2. NAS: 첨부파일 저장
  const fileResults = files.length > 0 ? await saveFilesToNas(files.slice(0, 4), nasDir, nasPass) : [];
  const savedFileNames = fileResults.filter(f => f.ok).map(f => f.name);
  const nasOk = jsonCode === 0;

  // 3. Notion 저장 (NAS 저장된 파일 경로 포함)
  const notionResult = await backupToNotion(memo, token, dbId, savedFileNames, nasDir);

  // 4. Google Calendar 연동
  if (addToCalendar) {
    await syncToCalendar(memo, user.id, supabase);
  }

  // 5. Supabase 상태 업데이트
  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (nasOk)                updates.backup_nas    = true;
    if (notionResult.pageId)  { updates.backup_notion = true; updates.notion_page_id = notionResult.pageId; }
    await supabase.from('bossai_memos').update(updates).eq('id', id);
  } catch {}

  const notionMsg = notionResult.pageId
    ? `📔 Notion 저장됨${notionResult.skippedFiles.length ? ` (파일 ${notionResult.skippedFiles.length}개 용량초과→NAS만)` : ''}`
    : `📔 Notion 실패: ${notionResult.error}`;
  const nasMsg    = nasOk ? `🖥️ NAS 저장됨${fileResults.length ? ` (파일 ${fileResults.filter(f=>f.ok).length}/${fileResults.length}개)` : ''}` : `🖥️ NAS 실패: ${jsonErr || 'SSH 오류'}`;
  const calMsg    = addToCalendar ? ' · 📅 캘린더 추가됨' : '';

  return NextResponse.json({
    ok: true,
    notion: !!notionResult.pageId,
    nas: nasOk,
    fileResults,
    message: `${notionMsg} · ${nasMsg}${calMsg}`,
  });
}
