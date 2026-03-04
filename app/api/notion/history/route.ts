import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

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

    let query = supabase
      .from('bossai_notion_uploads')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) {
      query = query.or(`original_name.ilike.%${search}%,ai_title.ilike.%${search}%,category.ilike.%${search}%`);
    }
    if (type) query = query.eq('file_type', type);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ uploads: data ?? [] });
  } catch (e) {
    console.error('notion/history GET:', e);
    return NextResponse.json({ uploads: [] });
  }
}
