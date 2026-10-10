import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { listWpCategories, pickWpCategory } from '@/lib/wp-category';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('article_id');
  const { data: a } = await supabase.from('bossai_auto_articles').select('title, content').eq('id', id || '').single();
  const [categories, suggested] = await Promise.all([listWpCategories('https://2days.kr'), pickWpCategory('https://2days.kr', a?.title || '', a?.content || '')]);
  return NextResponse.json({ categories, suggested });
}
