/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import {
  parseNotionPageId,
  fetchBlocksRecursive,
  blocksToMarkdown,
  extractFileRefs,
  downloadFileToNas,
  getPageTitle,
  getPageCover,
  getPageIcon,
  createNotionClient,
  getNasFilePath,
} from '@/lib/notion-mirror';

export const maxDuration = 60;

// Delay helper
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSync(
  userId: string,
  notionToken: string,
  jobId: string,
  pageId?: string,
  fullSync?: boolean
) {
  const supabase = createAdminClient();

  // Update job to running
  await supabase
    .from('bossai_notion_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId);

  try {
    const notion = createNotionClient(notionToken);

    // Parse root page ID
    const DEFAULT_PAGE_URL = 'https://www.notion.so/YnK-131c999644708011a105c4ec67ef49ea';
    const rootPageId = parseNotionPageId(pageId || DEFAULT_PAGE_URL);

    // Stats
    let pagesCount = 0;
    let blocksCount = 0;
    let filesCount = 0;
    const errors: string[] = [];

    // Get existing pages for incremental sync
    let existingPagesMap: Record<string, string> = {};
    if (!fullSync) {
      const { data: existingPages } = await supabase
        .from('bossai_notion_pages')
        .select('id, last_edited_time')
        .eq('user_id', userId);
      existingPagesMap = Object.fromEntries(
        (existingPages || []).map((p: any) => [p.id, p.last_edited_time])
      );
    }

    // Helper: sync a single page
    async function syncPage(pgId: string, databaseId?: string) {
      await delay(350);
      let page: any;
      try {
        page = await notion.pages.retrieve({ page_id: pgId });
      } catch (e: any) {
        const msg = `페이지 조회 실패 (${pgId}): ${e?.message || e}`;
        console.error(msg);
        errors.push(msg);
        return;
      }

      // Incremental: skip if not changed
      if (!fullSync && existingPagesMap[page.id]) {
        const storedTime = existingPagesMap[page.id];
        const notionTime = page.last_edited_time;
        if (storedTime && notionTime && new Date(notionTime) <= new Date(storedTime)) {
          return;
        }
      }

      const title = getPageTitle(page);
      const cover = getPageCover(page);
      const icon = getPageIcon(page);

      // Parent info
      let parentId: string | null = null;
      let parentType: string | null = null;
      if (page.parent) {
        parentType = page.parent.type;
        if (page.parent.type === 'page_id') parentId = page.parent.page_id;
        else if (page.parent.type === 'database_id') parentId = page.parent.database_id;
        else if (page.parent.type === 'block_id') parentId = page.parent.block_id;
      }

      // Fetch blocks
      const blocks = await fetchBlocksRecursive(notion, pgId);
      blocksCount += blocks.length;

      // Convert to markdown
      const markdown = blocksToMarkdown(blocks);

      // Extract and download files
      const fileRefs = extractFileRefs(blocks);
      const fileRefsResult: any[] = [];
      for (const ref of fileRefs) {
        const nasPath = getNasFilePath(pgId, ref.url);
        const downloaded = await downloadFileToNas(ref.url, nasPath);
        fileRefsResult.push({ ...ref, nasPath, downloaded });
        if (downloaded) filesCount++;
      }

      // Upsert raw layer
      await supabase.from('bossai_notion_page_raw').upsert({
        page_id: page.id,
        user_id: userId,
        page_json: page,
        block_tree_json: blocks,
        markdown,
        last_edited_time: page.last_edited_time,
        file_refs: fileRefsResult,
        synced_at: new Date().toISOString(),
      });

      // Upsert service layer: pages
      await supabase.from('bossai_notion_pages').upsert({
        id: page.id,
        user_id: userId,
        title,
        cover,
        icon,
        parent_id: parentId,
        parent_type: parentType,
        url: page.url,
        last_edited_time: page.last_edited_time,
        properties: page.properties || {},
        is_database_item: !!databaseId,
        database_id: databaseId || null,
        synced_at: new Date().toISOString(),
      });

      // Replace blocks: delete old, insert new
      await supabase
        .from('bossai_notion_blocks')
        .delete()
        .eq('page_id', page.id)
        .eq('user_id', userId);

      if (blocks.length > 0) {
        const blockRows = blocks.map((block: any, idx: number) => ({
          id: block.id,
          user_id: userId,
          page_id: page.id,
          parent_id: block.parent?.block_id || block.parent?.page_id || null,
          type: block.type,
          content: block[block.type] || {},
          order_index: idx,
          has_children: block.has_children || false,
          depth: block._depth || 0,
          synced_at: new Date().toISOString(),
        }));

        // Insert in batches of 50
        for (let i = 0; i < blockRows.length; i += 50) {
          await supabase.from('bossai_notion_blocks').insert(blockRows.slice(i, i + 50));
        }
      }

      pagesCount++;

      // Find child databases in blocks and sync them (에러 격리)
      const dbBlocks = blocks.filter((b: any) => b.type === 'child_database');
      for (const dbBlock of dbBlocks) {
        try {
          await syncDatabase(dbBlock.id);
        } catch (e: any) {
          errors.push(`DB 동기화 실패 (${dbBlock.id}): ${e?.message || e}`);
        }
      }

      // Find child pages in blocks and sync them recursively (에러 격리)
      const childPageBlocks = blocks.filter((b: any) => b.type === 'child_page');
      for (const cpBlock of childPageBlocks) {
        try {
          await syncPage(cpBlock.id);
        } catch (e: any) {
          errors.push(`하위 페이지 동기화 실패 (${cpBlock.id}): ${e?.message || e}`);
        }
      }
    }

    // Helper: sync a database and all its items
    async function syncDatabase(dbId: string) {
      await delay(350);
      let db: any;
      try {
        db = await notion.databases.retrieve({ database_id: dbId });
      } catch (e: any) {
        const msg = `DB 조회 실패 (${dbId}): ${e?.message || e}`;
        console.error(msg);
        errors.push(msg);
        return;
      }

      // Get DB title
      const dbTitle = richTextToString(db.title || []);

      // Upsert database
      await supabase.from('bossai_notion_databases').upsert({
        id: db.id,
        user_id: userId,
        title: dbTitle,
        description: richTextToString(db.description || []),
        properties_schema: db.properties || {},
        synced_at: new Date().toISOString(),
      });

      // Query all items with pagination
      let cursor: string | undefined;
      do {
        await delay(350);
        let queryRes: any;
        try {
          queryRes = await notion.request({
            path: `databases/${dbId}/query`,
            method: 'POST',
            body: { start_cursor: cursor, page_size: 100 },
          } as any);
        } catch (e: any) {
          const msg = `DB 쿼리 실패 (${dbId}): ${e?.message || e}`;
          console.error(msg);
          errors.push(msg);
          break;
        }

        for (const item of queryRes.results as any[]) {
          try {
            const itemTitle = getPageTitle(item);
            const itemCover = getPageCover(item);
            const itemIcon = getPageIcon(item);

            await supabase.from('bossai_notion_database_items').upsert({
              id: item.id,
              user_id: userId,
              database_id: dbId,
              page_id: item.id,
              title: itemTitle,
              properties: item.properties || {},
              cover: itemCover,
              icon: itemIcon,
              last_edited_time: item.last_edited_time,
              synced_at: new Date().toISOString(),
            });

            await syncPage(item.id, dbId);
          } catch (e: any) {
            errors.push(`DB 아이템 처리 실패 (${item.id}): ${e?.message || e}`);
          }
        }

        cursor = queryRes?.has_more ? queryRes.next_cursor : undefined;
      } while (cursor);
    }

    // Start sync from root page
    await syncPage(rootPageId);

    // Update job to done
    await supabase
      .from('bossai_notion_jobs')
      .update({
        status: 'done',
        finished_at: new Date().toISOString(),
        result: { pagesCount, blocksCount, filesCount, errors },
      })
      .eq('id', jobId);
  } catch (err: any) {
    await supabase
      .from('bossai_notion_jobs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: String(err?.message || err),
      })
      .eq('id', jobId);
  }
}

// Import richTextToString from notion-mirror
function richTextToString(richText: any[]): string {
  return (richText || []).map((t: any) => t.plain_text || '').join('');
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get Notion token — mirror 전용 토큰 우선, 없으면 일반 notion_config 사용
  const { data: settings } = await supabase
    .from('bossai_company_settings')
    .select('notion_config, notion_mirror_config')
    .eq('user_id', user.id)
    .single();

  const mirrorConfig = settings?.notion_mirror_config as { apiKey?: string } | null;
  const generalConfig = settings?.notion_config as { apiKey?: string } | null;
  const apiKey = mirrorConfig?.apiKey || generalConfig?.apiKey;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Notion 미러 토큰을 먼저 설정해주세요. (동기화 탭 상단 토큰 설정)' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { pageId, fullSync } = body as { pageId?: string; fullSync?: boolean };

  const syncType = fullSync ? 'full_sync' : pageId ? 'page_sync' : 'incremental';

  // Create job record
  const adminSupabase = createAdminClient();
  const { data: job, error: jobError } = await adminSupabase
    .from('bossai_notion_jobs')
    .insert({
      user_id: user.id,
      type: syncType,
      status: 'pending',
      payload: { pageId: pageId || null, fullSync: fullSync || false },
    })
    .select()
    .single();

  if (jobError || !job) {
    console.error('notion job insert error:', jobError);
    return NextResponse.json({ error: 'Failed to create job', detail: jobError?.message }, { status: 500 });
  }

  // Fire and forget
  runSync(user.id, apiKey, job.id, pageId, fullSync).catch(console.error);

  return NextResponse.json({ jobId: job.id, status: 'pending' });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminSupabase = createAdminClient();
  const { data: job } = await adminSupabase
    .from('bossai_notion_jobs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ job: job || null });
}
