/**
 * Notion 연동 설정 저장/조회 + 아티클 목록/내용 가져오기
 * GET  ?action=settings          → 저장된 설정 조회
 * POST action=connect            → 설정 저장
 * GET  ?action=articles          → 노션 DB 아티클 목록
 * GET  ?action=content&id=...    → 특정 페이지 블록 → HTML
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { blocksToHtml, extractTitle, extractStatus } from '@/lib/notion/to-html';

const NOTION_VERSION = '2022-06-28';

async function notionGet(token: string, path: string) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
  });
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${await res.text()}`);
  return res.json();
}

async function notionPost(token: string, path: string, body: object) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion API 오류 (${res.status}): ${await res.text()}`);
  return res.json();
}

// 재귀적으로 모든 블록 가져오기 (페이지네이션)
async function getAllBlocks(token: string, blockId: string): Promise<object[]> {
  const blocks: object[] = [];
  let cursor: string | undefined;
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await notionGet(token, `/blocks/${blockId}/children${cursor ? `?start_cursor=${cursor}` : ''}`);
    blocks.push(...(res.results || []));
    cursor = res.next_cursor || undefined;
  } while (cursor);
  return blocks;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'settings';

  if (action === 'settings') {
    const { data } = await supabase
      .from('notion_connections')
      .select('integration_token, database_id, title_property, status_property')
      .eq('user_id', user.id)
      .single();
    return NextResponse.json(data || null);
  }

  // articles / content → need saved token
  const { data: conn } = await supabase
    .from('notion_connections')
    .select('integration_token, database_id, status_property')
    .eq('user_id', user.id)
    .single();

  if (!conn) return NextResponse.json({ error: '노션 연동 설정이 필요합니다' }, { status: 400 });
  const { integration_token: token, database_id: dbId } = conn;

  if (action === 'articles') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await notionPost(token, `/databases/${dbId}/query`, {
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        page_size: 50,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const articles = (res.results || []).map((page: any) => ({
        id: page.id,
        title: extractTitle(page.properties),
        status: extractStatus(page.properties, conn.status_property),
        lastEdited: page.last_edited_time,
        url: page.url,
      }));
      return NextResponse.json(articles);
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  if (action === 'content') {
    const pageId = searchParams.get('id');
    if (!pageId) return NextResponse.json({ error: 'id 필요' }, { status: 400 });
    try {
      const [pageData, blocks] = await Promise.all([
        notionGet(token, `/pages/${pageId}`),
        getAllBlocks(token, pageId),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const title = extractTitle((pageData as any).properties || {});
      const html = blocksToHtml(blocks as object[]);
      return NextResponse.json({ title, html });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { action, integration_token, database_id, title_property, status_property, openai_api_key, rewrite_prompt } = await req.json();

  if (action === 'connect') {
    if (!integration_token || !database_id)
      return NextResponse.json({ error: 'token과 DB ID가 필요합니다' }, { status: 400 });

    // 연결 테스트
    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${database_id}`, {
        headers: { Authorization: `Bearer ${integration_token}`, 'Notion-Version': NOTION_VERSION },
      });
      if (!res.ok) return NextResponse.json({ error: `노션 연결 실패 (${res.status}) - Token과 DB ID를 확인하세요` }, { status: 400 });
    } catch {
      return NextResponse.json({ error: '노션에 연결할 수 없습니다' }, { status: 400 });
    }

    const upsertData: Record<string, string> = {
      user_id: user.id,
      integration_token,
      database_id,
      title_property: title_property || 'Name',
      status_property: status_property || 'Status',
      updated_at: new Date().toISOString(),
    };
    if (openai_api_key !== undefined) upsertData.openai_api_key = openai_api_key;
    if (rewrite_prompt !== undefined) upsertData.rewrite_prompt = rewrite_prompt;

    const { error } = await supabase.from('notion_connections').upsert(upsertData, { onConflict: 'user_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
}
