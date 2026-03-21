import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const username = req.nextUrl.searchParams.get('username') || undefined;
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');

  let query = supabase
    .from('bossai_x_videos')
    .select('*', { count: 'exact' })
    .order('collected_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (username) query = query.eq('username', username);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [], total: count ?? 0, offset, pageSize: PAGE_SIZE });
}

// 발행 완료 기록
export async function PATCH(req: NextRequest) {
  const { id, platforms } = await req.json();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('bossai_x_videos')
    .update({ posted_at: new Date().toISOString(), posted_platforms: platforms })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
