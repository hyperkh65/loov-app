/**
 * GET /api/naver-cafe/notion-news?action=list&token=xxx&dbId=xxx
 * GET /api/naver-cafe/notion-news?action=content&token=xxx&pageId=xxx
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const NOTION_VERSION = '2022-06-28';
const DEFAULT_DB_ID = '30a1f4ff-9a0e-8030-aade-f3de90c1e3ed';

function nHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' };
}

function blocksToHtml(blocks: { type: string; [k: string]: unknown }[]): string {
  const lines: string[] = [];
  for (const b of blocks) {
    const richText = (b[b.type] as { rich_text?: { plain_text: string }[] })?.rich_text || [];
    const text = richText.map((r) => r.plain_text).join('');
    if (!text && b.type !== 'image') continue;
    switch (b.type) {
      case 'heading_1': lines.push(`<h1>${text}</h1>`); break;
      case 'heading_2': lines.push(`<h2>${text}</h2>`); break;
      case 'heading_3': lines.push(`<h3>${text}</h3>`); break;
      case 'bulleted_list_item': lines.push(`<li>${text}</li>`); break;
      case 'numbered_list_item': lines.push(`<li>${text}</li>`); break;
      case 'quote': lines.push(`<blockquote>${text}</blockquote>`); break;
      case 'code': lines.push(`<pre><code>${text}</code></pre>`); break;
      case 'image': {
        const img = b['image'] as { type: string; external?: { url: string }; file?: { url: string } };
        const url = img?.external?.url || img?.file?.url || '';
        if (url) lines.push(`<img src="${url}" style="max-width:100%" />`);
        break;
      }
      default: if (text) lines.push(`<p>${text}</p>`);
    }
  }
  return lines.join('\n');
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'list';
  const token = searchParams.get('token') || process.env.NOTION_API_KEY || '';
  const dbId = (searchParams.get('dbId') || process.env.NOTION_AI_NEWS_DBID || DEFAULT_DB_ID).replace(/-/g, '');

  if (!token) return NextResponse.json({ error: 'Notion API 키가 없습니다. 설정 탭에서 입력하세요.' }, { status: 400 });

  // ── 목록 조회 ────────────────────────────────────────────────────────────
  if (action === 'list') {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: nHeaders(token),
      body: JSON.stringify({
        page_size: 20,
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json({ error: `Notion 오류 (${res.status}): ${t.slice(0, 200)}` }, { status: 400 });
    }
    const data = await res.json() as { results: { id: string; properties: Record<string, unknown>; last_edited_time: string }[] };
    const articles = data.results.map((p) => {
      const props = p.properties as Record<string, { title?: { plain_text: string }[]; select?: { name: string }; rich_text?: { plain_text: string }[]; url?: string }>;
      const titleArr = props['이름']?.title || props['Name']?.title || props['Title']?.title || [];
      const title = titleArr.map((t) => t.plain_text).join('') || '(제목 없음)';
      const status = props['Status']?.select?.name || '';
      const coverImg = props['HeroImageURL']?.url || props['cover_image']?.url || '';
      return { id: p.id, title, status, lastEdited: p.last_edited_time, coverImg };
    });
    return NextResponse.json({ articles });
  }

  // ── 페이지 내용 조회 ─────────────────────────────────────────────────────
  if (action === 'content') {
    const pageId = searchParams.get('pageId') || '';
    if (!pageId) return NextResponse.json({ error: 'pageId 필요' }, { status: 400 });

    // 블록 가져오기
    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId.replace(/-/g, '')}/children?page_size=100`, {
      headers: nHeaders(token),
    });
    if (!res.ok) return NextResponse.json({ error: `블록 조회 실패 (${res.status})` }, { status: 400 });
    const data = await res.json() as { results: { type: string; [k: string]: unknown }[] };
    const html = blocksToHtml(data.results || []);

    // 페이지 메타 (cover image)
    const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId.replace(/-/g, '')}`, {
      headers: nHeaders(token),
    });
    let coverImg = '';
    if (pageRes.ok) {
      const page = await pageRes.json() as {
        cover?: { type: string; external?: { url: string }; file?: { url: string } };
        properties?: Record<string, { url?: string }>;
      };
      coverImg = page.cover?.external?.url || page.cover?.file?.url ||
        page.properties?.['HeroImageURL']?.url || page.properties?.['cover_image']?.url || '';
    }

    return NextResponse.json({ html, coverImg });
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
}
