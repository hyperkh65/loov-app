/**
 * 예약 발행 설정/취소
 * POST /api/auto-service/schedule  { article_id, scheduled_at, blog_platforms, sns_platforms, wp_site_ids }
 * DELETE /api/auto-service/schedule  { article_id }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { article_id, scheduled_at, blog_platforms = [], sns_platforms = [], wp_site_ids = [] } = await req.json();
  if (!article_id) return NextResponse.json({ error: 'article_id 필요' }, { status: 400 });
  if (!scheduled_at) return NextResponse.json({ error: 'scheduled_at 필요' }, { status: 400 });

  const { error } = await supabase
    .from('bossai_auto_articles')
    .update({
      status: 'scheduled',
      scheduled_at,
      scheduled_platforms: { blog_platforms, sns_platforms, wp_site_ids },
      updated_at: new Date().toISOString(),
    })
    .eq('id', article_id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { article_id } = await req.json();
  if (!article_id) return NextResponse.json({ error: 'article_id 필요' }, { status: 400 });

  const { error } = await supabase
    .from('bossai_auto_articles')
    .update({
      status: 'draft',
      scheduled_at: null,
      scheduled_platforms: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', article_id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
