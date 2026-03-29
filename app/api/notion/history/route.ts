import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { Client } from '@notionhq/client';

interface NotionConfig { apiKey?: string; databaseId?: string }

async function fetchFromNotion(config: NotionConfig, search: string, type: string) {
  if (!config.apiKey || !config.databaseId) return [];
  try {
    const notion = new Client({ auth: config.apiKey });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filters: any[] = [];
    if (search) {
      filters.push({
        or: [
          { property: 'Name',  title:      { contains: search } },
          { property: '파일명', rich_text:  { contains: search } },
          { property: '카테고리', select:   { equals: search } },
        ],
      });
    }
    if (type) {
      filters.push({ property: '유형', select: { equals: type } });
    }

    const res = await notion.databases.query({
      database_id: config.databaseId,
      filter: filters.length === 1 ? filters[0] : filters.length > 1 ? { and: filters } : undefined,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      page_size: 100,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.results.map((page: any) => {
      const p = page.properties;
      return {
        id: page.id,
        original_name: p['파일명']?.rich_text?.[0]?.plain_text || p['Name']?.title?.[0]?.plain_text || '파일명 없음',
        file_type: p['유형']?.select?.name || 'FILE',
        file_size: null,
        file_url: null,
        category: p['카테고리']?.select?.name || null,
        ai_title: p['Name']?.title?.[0]?.plain_text || null,
        summary: p['요약']?.rich_text?.[0]?.plain_text || null,
        tags: (p['태그']?.multi_select || []).map((t: { name: string }) => t.name),
        notion_page_id: page.id,
        notion_page_url: page.url,
        status: 'done',
        error_message: null,
        created_at: page.created_time,
        source: 'notion',
      };
    });
  } catch (e) {
    console.error('Notion fetch error:', e);
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
    const search = searchParams.get('search') ?? '';
    const type = searchParams.get('type') ?? '';
    const status = searchParams.get('status') ?? '';

    // 1. 로컬 DB 조회
    let query = supabase
      .from('bossai_notion_uploads')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) query = query.or(`original_name.ilike.%${search}%,ai_title.ilike.%${search}%,category.ilike.%${search}%`);
    if (type)   query = query.eq('file_type', type);
    if (status) query = query.eq('status', status);

    const { data: localData } = await query;
    const localUploads = (localData ?? []).map(r => ({ ...r, source: 'local' }));

    // 2. Notion DB 직접 조회 (로컬 DB가 비어있거나 상태 필터 없을 때)
    let notionUploads: typeof localUploads = [];
    if (!status) {
      const { data: companyRow } = await supabase
        .from('bossai_company_settings')
        .select('notion_config')
        .eq('user_id', user.id)
        .single();
      const config = (companyRow?.notion_config ?? {}) as NotionConfig;
      const notionItems = await fetchFromNotion(config, search, type);
      // 로컬 DB에 없는 것만 추가 (notion_page_id 기준 중복 제거)
      const localPageIds = new Set(localUploads.map(u => u.notion_page_id).filter(Boolean));
      notionUploads = notionItems.filter(n => !localPageIds.has(n.notion_page_id));
    }

    // 3. 병합: 로컬 우선, Notion 추가
    const uploads = [...localUploads, ...notionUploads]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    return NextResponse.json({ uploads });
  } catch (e) {
    console.error('notion/history GET:', e);
    return NextResponse.json({ uploads: [] });
  }
}
