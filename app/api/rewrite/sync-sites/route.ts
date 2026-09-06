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
    .select('id, user_id, name, site_url, feed_url')
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

      const items = await fetchFeedItems(feedUrl, 10);
      let siteNew = 0;

      for (const item of items) {
        const { data: existing } = await supabase
          .from('bossai_rewrite_articles')
          .select('id')
          .eq('user_id', ownerId)
          .eq('source_url', item.link)
          .limit(1);
        if (existing && existing.length > 0) continue;

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
