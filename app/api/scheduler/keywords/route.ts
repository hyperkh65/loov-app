/**
 * 스케줄러용 키워드 조회
 * 1. bossai_keyword_opportunities 캐시 확인 (24시간)
 * 2. 없으면 auto-discover 실행 트리거
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);

  // 캐시된 키워드 조회 (24시간 이내)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from('bossai_keyword_opportunities')
    .select('keyword, score, grade, difficulty, can_rank1, monthly_total, competition_score')
    .eq('user_id', user.id)
    .gte('created_at', since)
    .order('score', { ascending: false })
    .limit(limit);

  return NextResponse.json({
    keywords: data || [],
    cached: (data?.length || 0) > 0,
  });
}
