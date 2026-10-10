/**
 * 예약 발행 실행 (GitHub Actions에서 30분마다 호출)
 * POST /api/auto-service/scheduled-run
 * Authorization: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  const supabase = await createAdminClient();
  const now = new Date().toISOString();

  // 예약 시간이 지난 scheduled 상태 글 조회
  const { data: articles, error } = await supabase
    .from('bossai_auto_articles')
    .select('id, scheduled_platforms')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!articles || articles.length === 0) {
    return NextResponse.json({ processed: 0, message: '예약된 글 없음' });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const article of articles) {
    const platforms = article.scheduled_platforms || {};
    try {
      const res = await fetch(`${baseUrl}/api/auto-service/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({
          article_id: article.id,
          blog_platforms: platforms.blog_platforms || [],
          sns_platforms: platforms.sns_platforms || [],
          wp_site_ids: platforms.wp_site_ids || [],
        }),
        signal: AbortSignal.timeout(300_000),
      });
      const data = await res.json();
      const anySuccess = Object.values(data.results || {}).some((r: unknown) => (r as { success: boolean }).success);
      results.push({ id: article.id, success: anySuccess });
    } catch (err) {
      results.push({ id: article.id, success: false, error: String(err) });
      // 실패해도 status를 failed로 업데이트
      await supabase
        .from('bossai_auto_articles')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', article.id);
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
