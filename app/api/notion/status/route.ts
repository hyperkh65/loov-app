import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { Client } from '@notionhq/client';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data } = await supabase
      .from('bossai_company_settings')
      .select('notion_config')
      .eq('user_id', user.id)
      .single();

    const config = data?.notion_config ?? {};
    if (!config.apiKey || !config.databaseId) {
      return NextResponse.json({ connected: false, reason: 'no_config' });
    }

    // Verify Notion connection
    const notion = new Client({ auth: config.apiKey });
    const db = await notion.databases.retrieve({ database_id: config.databaseId }) as { title?: { plain_text?: string }[] };
    const dbTitle = db.title?.[0]?.plain_text ?? 'Notion DB';

    return NextResponse.json({ connected: true, databaseName: dbTitle });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ connected: false, reason: msg });
  }
}
