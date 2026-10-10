import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-server';

export const maxDuration = 30;

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const adminDb = await createAdminClient();

  // Get all active tracking records for user
  const { data: trackingList, error } = await adminDb
    .from('bossai_keyword_tracking')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get last 7 rank history for each tracking record
  const trackingIds = (trackingList || []).map(t => t.id);
  const historyMap: Record<number, Array<{ rank: number | null; page: number | null; checked_at: string }>> = {};

  if (trackingIds.length > 0) {
    for (const tid of trackingIds) {
      const { data: history } = await adminDb
        .from('bossai_keyword_rank_history')
        .select('rank, page, checked_at')
        .eq('tracking_id', tid)
        .order('checked_at', { ascending: false })
        .limit(7);
      historyMap[tid] = (history || []).reverse();
    }
  }

  const results = (trackingList || []).map(t => ({
    ...t,
    history: historyMap[t.id] || [],
  }));

  return NextResponse.json({ results });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { keyword, article_id, article_title, article_url } = await req.json() as {
    keyword: string;
    article_id?: string;
    article_title?: string;
    article_url?: string;
  };

  if (!keyword?.trim()) return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 });

  const adminDb = await createAdminClient();

  const { data, error } = await adminDb
    .from('bossai_keyword_tracking')
    .insert({
      user_id: user.id,
      keyword: keyword.trim(),
      article_id: article_id || null,
      article_title: article_title || null,
      article_url: article_url || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tracking: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const adminDb = await createAdminClient();

  const { error } = await adminDb
    .from('bossai_keyword_tracking')
    .update({ is_active: false })
    .eq('id', parseInt(id))
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
