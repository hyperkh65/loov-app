import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { tracking_id } = await req.json() as { tracking_id: number };
  if (!tracking_id) return NextResponse.json({ error: 'tracking_id 필요' }, { status: 400 });

  const adminDb = await createAdminClient();

  // Get tracking record
  const { data: tracking, error: trackingError } = await adminDb
    .from('bossai_keyword_tracking')
    .select('*')
    .eq('id', tracking_id)
    .eq('user_id', user.id)
    .single();

  if (trackingError || !tracking) return NextResponse.json({ error: '추적 레코드 없음' }, { status: 404 });

  const [naverClientId, naverClientSecret] = await Promise.all([
    getSetting('NAVER_CLIENT_ID'),
    getSetting('NAVER_CLIENT_SECRET'),
  ]);

  if (!naverClientId || !naverClientSecret) {
    return NextResponse.json({ error: '네이버 API 키 미설정' }, { status: 400 });
  }

  const headers = { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret };

  // Search Naver Blog with keyword (display=100, sort=sim)
  let rank: number | null = null;
  let page: number | null = null;
  let found = false;
  let total = 0;

  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/blog?query=${encodeURIComponent(tracking.keyword)}&display=100&sort=sim`,
      { headers, signal: AbortSignal.timeout(8000) }
    );

    if (res.ok) {
      const data = await res.json() as {
        total?: number;
        items?: Array<{ title: string; description: string; link: string; bloggername: string; bloggerlink: string }>;
      };
      total = data.total || 0;
      const items = data.items || [];

      // Try URL match first
      if (tracking.article_url) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (
            (item.link && item.link.includes(tracking.article_url)) ||
            (item.bloggerlink && tracking.article_url.includes(item.bloggerlink))
          ) {
            rank = i + 1;
            page = Math.ceil(rank / 10);
            found = true;
            break;
          }
        }
      }

      // Try article_id match in link
      if (!found && tracking.article_id) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.link && item.link.includes(tracking.article_id)) {
            rank = i + 1;
            page = Math.ceil(rank / 10);
            found = true;
            break;
          }
        }
      }

      // Try title match
      if (!found && tracking.article_title) {
        const cleanTitle = tracking.article_title.replace(/<[^>]+>/g, '').toLowerCase();
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const itemTitle = item.title.replace(/<[^>]+>/g, '').toLowerCase();
          if (itemTitle.includes(cleanTitle.slice(0, 20)) || cleanTitle.includes(itemTitle.slice(0, 20))) {
            rank = i + 1;
            page = Math.ceil(rank / 10);
            found = true;
            break;
          }
        }
      }
    }
  } catch (e) {
    return NextResponse.json({ error: `검색 오류: ${e}` }, { status: 500 });
  }

  const now = new Date().toISOString();

  // Update best_rank
  const newBestRank = rank !== null
    ? (tracking.best_rank === null || rank < tracking.best_rank ? rank : tracking.best_rank)
    : tracking.best_rank;

  // Update tracking record
  await adminDb
    .from('bossai_keyword_tracking')
    .update({
      current_rank: rank,
      current_page: page,
      best_rank: newBestRank,
      last_checked_at: now,
      check_count: (tracking.check_count || 0) + 1,
    })
    .eq('id', tracking_id);

  // Insert rank history
  await adminDb
    .from('bossai_keyword_rank_history')
    .insert({
      tracking_id,
      rank,
      page,
      checked_at: now,
    });

  return NextResponse.json({ rank, page, found, total });
}
