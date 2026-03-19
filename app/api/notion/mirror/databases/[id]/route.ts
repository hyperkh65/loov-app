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

  // Get database
  const { data: database, error: dbError } = await adminSupabase
    .from('bossai_notion_databases')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (dbError || !database) {
    return NextResponse.json({ error: 'Database not found' }, { status: 404 });
  }

  // Get database items
  const { data: items } = await adminSupabase
    .from('bossai_notion_database_items')
    .select('*')
    .eq('database_id', id)
    .eq('user_id', user.id)
    .order('last_edited_time', { ascending: false });

  return NextResponse.json({
    database,
    items: items || [],
  });
}
