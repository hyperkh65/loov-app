import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const adminSupabase = createAdminClient();

  // Get page
  const { data: page, error: pageError } = await adminSupabase
    .from('bossai_notion_pages')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (pageError || !page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  // Get blocks
  const { data: blocks } = await adminSupabase
    .from('bossai_notion_blocks')
    .select('*')
    .eq('page_id', id)
    .eq('user_id', user.id)
    .order('order_index', { ascending: true });

  // Get raw markdown
  const { data: raw } = await adminSupabase
    .from('bossai_notion_page_raw')
    .select('markdown')
    .eq('page_id', id)
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({
    page,
    blocks: blocks || [],
    rawMarkdown: raw?.markdown || '',
  });
}
