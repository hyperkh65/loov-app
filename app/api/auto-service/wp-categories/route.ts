import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { listWpCategories, pickWpCategory } from '@/lib/wp-category';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // suggest=0: 목록만 즉시(AI 추천이 느리거나 실패해도 드롭다운은 바로 뜨게 — 2026-11-09 "계속 불러오는 중" 원인)
  if (req.nextUrl.searchParams.get('suggest') === '0') {
    try { return NextResponse.json({ categories: await listWpCategories('https://2days.kr') }); }
    catch (e) { return NextResponse.json({ error: String(e) }, { status: 502 }); }
  }
  const id = req.nextUrl.searchParams.get('article_id');
  const { data: a } = await supabase.from('bossai_auto_articles').select('title, content').eq('id', id || '').single();
  const suggested = await Promise.race([
    pickWpCategory('https://2days.kr', a?.title || '', a?.content || ''),
    new Promise<null>(res => setTimeout(() => res(null), 22_000)),
  ]);
  return NextResponse.json({ suggested });
}
