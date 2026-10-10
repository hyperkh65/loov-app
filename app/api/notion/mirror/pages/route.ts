import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminSupabase = createAdminClient();
  const { data: pages, error } = await adminSupabase
    .from('bossai_notion_pages')
    .select('id, title, cover, icon, url, last_edited_time, synced_at, parent_id, parent_type, is_database_item')
    .eq('user_id', user.id)
    .eq('is_database_item', false)
    .order('last_edited_time', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pages: pages || [] });
}
