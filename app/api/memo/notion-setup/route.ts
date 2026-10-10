/**
 * POST /api/memo/notion-setup
 * Notion 페이지 안에 메모 DB를 자동 생성
 * body: { token, pageId, dbName? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { token, pageId, dbName = '📓 세컨드 브레인 메모' } = await req.json() as {
    token: string;
    pageId: string;
    dbName?: string;
  };

  if (!token || !pageId) return NextResponse.json({ error: 'token, pageId 필요' }, { status: 400 });

  const res = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: pageId.replace(/-/g, '') },
      title: [{ type: 'text', text: { content: dbName } }],
      properties: {
        '이름':     { title: {} },
        'Category': { select: { options: [
          { name: '업무',    color: 'blue'   },
          { name: '아이디어', color: 'purple' },
          { name: '학습',    color: 'green'  },
          { name: '개인',    color: 'pink'   },
          { name: '프로젝트', color: 'orange' },
          { name: '회의',    color: 'yellow' },
          { name: '일정',    color: 'default'},
          { name: '기타',    color: 'gray'   },
        ]}},
        'Tags':    { multi_select: { options: [] } },
        'Date':    { date: {} },
        'Summary': { rich_text: {} },
      },
    }),
  });

  const data = await res.json() as { id?: string; message?: string };
  if (!res.ok) {
    return NextResponse.json({ error: data.message || `Notion 오류 (${res.status})` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, dbId: data.id });
}
