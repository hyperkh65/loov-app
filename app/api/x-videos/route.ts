import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const username = req.nextUrl.searchParams.get('username') || undefined;
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');

  let query = supabase
    .from('bossai_x_videos')
    .select('*')
    .order('collected_at', { ascending: false })
    .limit(limit);

  if (username) query = query.eq('username', username);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
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
