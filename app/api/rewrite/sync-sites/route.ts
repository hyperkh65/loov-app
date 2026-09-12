/**
 * POST /api/rewrite/sync-sites
 * 등록된 소스 사이트의 RSS를 확인해 새 글을 bossai_rewrite_articles에 pending으로 추가
 * (원문 본문 + 이미지까지 이 시점에 스크랩해둠)
 * Auth: Bearer CRON_SECRET  OR  Supabase session
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { fetchFeedItems, discoverFeedUrl, scrapeArticleFull } from '@/lib/rewrite-site-scraper';

export const maxDuration = 120;

async function authOk(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch { return false; }
}

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: NextRequest) {
  if (!await authOk(req)) return err('인증 실패', 401);

  const ownerId = process.env.OWNER_USER_ID!;
  const supabase = await createAdminClient();

  const { data: sites } = await supabase
    .from('bossai_rewrite_sources')
    .select('id, user_id, name, site_url, feed_url, latest_only')
    .eq('user_id', ownerId)
    .eq('is_active', true);

  let newFound = 0;
  const perSiteResults: Array<{ site: string; newFound: number; error?: string }> = [];

  for (const site of sites || []) {
    try {
      let feedUrl = site.feed_url;
      if (!feedUrl) {
        feedUrl = await discoverFeedUrl(site.site_url);
        if (feedUrl) await supabase.from('bossai_rewrite_sources').update({ feed_url: feedUrl }).eq('id', site.id);
      }
      if (!feedUrl) { perSiteResults.push({ site: site.name, newFound: 0, error: '피드 없음' }); continue; }

      // latest_only 소스는 새 글 생산 속도가 처리(1시간에 소스당 1개 발행) 속도보다
      // 훨씬 빠른 경우(위즈 데이터센터 등 고빈도 소스)가 실사용 중 확인됨 — pending
      // 단계는 아래에서 최신글로 교체되지만, 이미 리라이팅까지 끝난 'ready'는 그
      // 대상이 아니라서 계속 쌓여서 최대 688개(5일치)까지 밀린 적이 있었음.
      // latest_only 소스는 애초에 "최신성"이 핵심이라 오래된 ready도 발행 의미가
      // 없으므로 3일 넘은 건 발행 전에 정리
      if (site.latest_only) {
        const threeDaysAgoReady = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
        await supabase
          .from('bossai_rewrite_articles')
          .delete()
          .eq('source_id', site.id)
          .eq('status', 'ready')
          .lt('created_at', threeDaysAgoReady);
      }

      // latest_only 소스는 오래된 글부터 밀린 순서로 처리하다 최신 이슈를 놓치는 걸
      // 방지하기 위해 피드의 최신 글 1개만 확인 — 처리 안 된 pending 백로그가
      // 있으면 이 최신 글로 교체(오래된 건 버림)
      const items = await fetchFeedItems(feedUrl, site.latest_only ? 1 : 10);
      let siteNew = 0;

      for (const item of items) {
        const { data: existing } = await supabase
          .from('bossai_rewrite_articles')
          .select('id')
          .eq('user_id', ownerId)
          .eq('source_url', item.link)
          .limit(1);
        if (existing && existing.length > 0) continue;

        // 일부 게시판(예: mcee.go.kr)은 글 링크에 jsessionid가 박혀있어 매번
        // 폴링할 때마다 같은 글인데 URL이 달라짐 — source_url 완전일치로는
        // 못 걸러져서 실사용 중 같은 기사가 몇 시간 동안 반복 등록되는 문제가
        // 있었음. 같은 소스에서 최근 3일 내 같은 제목이 이미 들어와 있으면
        // URL이 달라도 건너뜀.
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
        const { data: titleDup } = await supabase
          .from('bossai_rewrite_articles')
          .select('id')
          .eq('user_id', ownerId)
          .eq('source_id', site.id)
          .eq('title', item.title)
          .gte('created_at', threeDaysAgo)
          .limit(1);
        if (titleDup && titleDup.length > 0) continue;

        if (site.latest_only) {
          await supabase
            .from('bossai_rewrite_articles')
            .delete()
            .eq('source_id', site.id)
            .eq('status', 'pending');
        }

        const scraped = await scrapeArticleFull(item.link);

        await supabase.from('bossai_rewrite_articles').insert({
          user_id: ownerId,
          title: item.title,
          source_url: item.link,
          source_account: site.name,
          source_id: site.id,
          original_content: scraped.text,
          representative_image_url: scraped.images[0] || null,
          image_urls: scraped.images.slice(1),
          status: 'pending',
        });
        siteNew++;
      }

      await supabase.from('bossai_rewrite_sources').update({ last_checked_at: new Date().toISOString() }).eq('id', site.id);
      newFound += siteNew;
      perSiteResults.push({ site: site.name, newFound: siteNew });
    } catch (e) {
      perSiteResults.push({ site: site.name, newFound: 0, error: String(e).slice(0, 200) });
    }
  }

  return NextResponse.json({ ok: true, sitesChecked: (sites || []).length, newFound, results: perSiteResults });
}
