import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { Client } from '@notionhq/client';

interface NotionConfig { apiKey?: string; databaseId?: string }

async function getNotionConfig(userId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from('bossai_company_settings')
    .select('notion_config')
    .eq('user_id', userId)
    .single();
  return (data?.notion_config ?? {}) as NotionConfig;
}

// 갤러리 DB가 없으면 Notion에 자동 생성
async function ensureGalleryDb(notion: Client, parentPageId: string): Promise<string> {
  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: '📸 LOOV 갤러리' } }],
    properties: {
      '이름': { title: {} },
      '사진': { files: {} },
      '카테고리': {
        select: {
          options: [
            { name: '개인', color: 'blue' },
            { name: '업무', color: 'green' },
            { name: '비밀', color: 'purple' },
          ],
        },
      },
      '메모': { rich_text: {} },
      '날짜': { date: {} },
      '즐겨찾기': { checkbox: {} },
    },
  });
  return db.id;
}

// GET → 갤러리 DB 아이템 목록
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const config = await getNotionConfig(user.id, supabase);
  if (!config.apiKey) return NextResponse.json({ error: 'Notion API 키 미설정', needSetup: true }, { status: 400 });

  const notion = new Client({ auth: config.apiKey });

  // gallery DB ID는 app_settings GALLERY_NOTION_DB_URL에 저장
  const { data: settings } = await (await import('@/lib/supabase-server')).createAdminClient()
    .from('app_settings').select('settings').eq('id', 1).single();
  let dbId = (settings?.settings as Record<string, string>)?.['GALLERY_NOTION_DB_URL'] || '';

  if (!dbId && config.databaseId) {
    // 메인 notion DB의 parent page로 갤러리 DB 생성
    try {
      const mainDb = await notion.databases.retrieve({ database_id: config.databaseId }) as { parent?: { page_id?: string } };
      const parentPageId = mainDb.parent?.page_id;
      if (parentPageId) {
        dbId = await ensureGalleryDb(notion, parentPageId);
        // 저장
        const admin = (await import('@/lib/supabase-server')).createAdminClient();
        const { data: ex } = await admin.from('app_settings').select('settings').eq('id', 1).single();
        const cur = (ex?.settings as Record<string, string>) || {};
        await admin.from('app_settings').update({ settings: { ...cur, GALLERY_NOTION_DB_URL: dbId } }).eq('id', 1);
      }
    } catch { /* parent 접근 불가 */ }
  }

  if (!dbId) return NextResponse.json({ error: '갤러리 DB 없음. 설정에서 GALLERY_NOTION_DB_URL 입력', needSetup: true }, { status: 400 });

  const category = req.nextUrl.searchParams.get('category');

  try {
    const filter = category && category !== 'all'
      ? { property: '카테고리', select: { equals: category === 'personal' ? '개인' : category === 'work' ? '업무' : '비밀' } }
      : undefined;

    const res = await notion.databases.query({
      database_id: dbId,
      filter: filter as Parameters<typeof notion.databases.query>[0]['filter'],
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      page_size: 100,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = res.results.map((page: any) => {
      const p = page.properties as Record<string, any>;
      const files: any[] = p['사진']?.files || [];
      const images = files.map((f: any) => f.file?.url || f.external?.url || '').filter(Boolean) as string[];
      return {
        id: page.id as string,
        title: (p['이름']?.title?.[0]?.plain_text as string) || '제목 없음',
        image_url: images[0] || null,
        images,
        category: (p['카테고리']?.select?.name as string) || '',
        memo: (p['메모']?.rich_text?.[0]?.plain_text as string) || '',
        is_favorite: (p['즐겨찾기']?.checkbox as boolean) || false,
        date: (p['날짜']?.date?.start as string) || null,
        notion_page_url: page.url as string,
        created_at: page.created_time as string,
      };
    });

    return NextResponse.json({ items, dbId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
