/**
 * POST /api/rewrite/sync
 * Notion 데이터베이스에서 리라이팅 대상 기사를 가져와 Supabase에 저장
 * Auth: Bearer CRON_SECRET  OR  Supabase session (대시보드 직접 호출)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';

export const maxDuration = 60;

const NOTION_DB_ID = '3461f4ff9a0e80c39f5cdbae34cbcd85';

async function authOk(req: NextRequest): Promise<boolean> {
  // 1. CRON_SECRET 인증
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  // 2. 유저 세션 인증
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch { return false; }
}

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

// Notion 페이지에서 rich_text 추출
function getRichText(prop: { rich_text?: { plain_text: string }[] } | undefined): string {
  return prop?.rich_text?.map((t) => t.plain_text).join('') || '';
}

// Notion 페이지에서 URL 추출
function getUrl(prop: { url?: string | null } | undefined): string {
  return prop?.url || '';
}

// Notion 페이지에서 select 추출
function getSelect(prop: { select?: { name: string } | null } | undefined): string {
  return prop?.select?.name || '';
}

// Notion 페이지에서 title 추출
function getTitle(prop: { title?: { plain_text: string }[] } | undefined): string {
  return prop?.title?.map((t) => t.plain_text).join('') || '';
}

export async function POST(req: NextRequest) {
  if (!await authOk(req)) return err('인증 실패', 401);

  const notionKey = process.env.NOTION_API_KEY;
  if (!notionKey) return err('NOTION_API_KEY 없음');

  const ownerId = process.env.OWNER_USER_ID!;
  const supabase = await createAdminClient();

  // Notion DB 쿼리 - 상태가 '대기중'인 페이지
  let cursor: string | undefined;
  let synced = 0;
  let skipped = 0;

  do {
    const body: Record<string, unknown> = {
      filter: {
        property: 'Status',
        select: { equals: 'QUEUED' },
      },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return err(`Notion API 오류: ${text}`);
    }

    const data = await res.json() as {
      results: Array<{
        id: string;
        properties: Record<string, unknown>;
      }>;
      has_more: boolean;
      next_cursor: string | null;
    };

    for (const page of data.results) {
      const p = page.properties as Record<string, {
        title?: { plain_text: string }[];
        rich_text?: { plain_text: string }[];
        url?: string | null;
        select?: { name: string } | null;
      }>;

      const title = getTitle(p['Title'] || p['제목'] || p['Name']);
      const sourceUrl = getUrl(p['Source URL'] || p['URL'] || p['소스URL']);
      const sourceAccount = getRichText(p['Source Account'] || p['출처계정'] || p['계정']) || getSelect(p['Source Account'] || p['출처계정'] || p['계정']);
      const originalContent = getRichText(p['Original Content'] || p['원문내용'] || p['본문']);

      if (!title) { skipped++; continue; }

      // 같은 기사가 노션 쪽에서 서로 다른 page_id로 반복 생성되는 경우가
      // 실사용 중 확인됨(환경부 보도자료 소스에서 동일 제목이 페이지ID만 바뀐 채
      // 계속 QUEUED로 들어옴) — notion_page_id만으로는 못 걸러지므로 최근 3일
      // 내 같은 제목이 이미 들어와 있으면 이 페이지는 건너뜀(같은 notion_page_id로
      // 이미 들어온 건 정상 업데이트이니 제외)
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
      const { data: dup } = await supabase
        .from('bossai_rewrite_articles')
        .select('id')
        .eq('user_id', ownerId)
        .eq('title', title)
        .neq('notion_page_id', page.id)
        .gte('created_at', threeDaysAgo)
        .limit(1)
        .maybeSingle();
      if (dup) { skipped++; continue; }

      // upsert: notion_page_id 기준
      const { error } = await supabase
        .from('bossai_rewrite_articles')
        .upsert({
          user_id: ownerId,
          notion_page_id: page.id,
          title,
          source_url: sourceUrl,
          source_account: sourceAccount,
          original_content: originalContent,
          status: 'pending',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'notion_page_id', ignoreDuplicates: false });

      if (!error) synced++;
      else skipped++;
    }

    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return NextResponse.json({ ok: true, synced, skipped });
}
