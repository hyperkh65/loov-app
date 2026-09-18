/**
 * POST /api/rewrite/publish-next
 * "ready" 상태 기사를 소스별 라운드로빈으로 골라 설정된 WordPress 사이트 +
 * 연결된 SNS 전체에 발행. 소스 하나가 한 번에 몰아서 쏟아지지 않도록 소스별
 * 발행 간격은 30분으로 제한하되(사용자 확정 — 기존 1시간에서 단축), 호출
 * 한 번에 여러 소스를 순서대로 처리해서 20분 간격 크론 1틱당 1건만 나가던
 * 처리량 한계를 풂 — 19개 소스가 각자 1시간(→30분)에 한 번씩 자기 차례를
 * 원하는데 크론이 20분마다 1건만 처리하면 산술적으로 못 따라가는 게
 * 실측(경향신문 기사 72시간 지연, one.yoosol 최대 2.5일 지연) 확인됨.
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { publishRewrittenArticle } from '@/lib/rewrite-publish';

export const maxDuration = 200; // self-hosted라 실제 강제는 안 되지만 auto-run의 fetch 타임아웃과 맞춤

const PUBLISH_INTERVAL_MS = 30 * 60 * 1000;
const MAX_PUBLISHES_PER_CALL = 8;
const TIME_BUDGET_MS = 170_000; // auto-run의 200s abort보다 여유 있게 끊어서 부분 응답을 보장

// one.yoosol/yoonfree — 생성 속도가 빨라 일반 라운드로빈으로는 계속 밀리는 게
// 실측 확인됨(사용자 확정 우선순위). 둘 다 준비돼 있으면 대기시간과 무관하게
// 항상 먼저 처리.
const PRIORITY_SOURCE_IDS = new Set([
  '1c036b9d-2a2b-449d-9b97-0a12c76dab6f', // one.yoosol
  '132c4df6-2a18-4693-8799-342893aa1469', // yoonfree
]);

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

type ArticleRow = {
  id: string; source_id: string | null;
  rewritten_title: string; rewritten_content: string; rewritten_meta: string | null;
  representative_image_url: string | null;
};

async function publishArticle(supabase: ReturnType<typeof createAdminClient>, ownerId: string, article: ArticleRow) {
  try {
    const result = await publishRewrittenArticle(
      {
        title: article.rewritten_title,
        content: article.rewritten_content,
        representative_image_url: article.representative_image_url,
        meta: article.rewritten_meta,
      },
      ownerId,
      article.source_id,
    );

    const status = result.wordpressUrl ? 'published' : 'ready';
    await supabase
      .from('bossai_rewrite_articles')
      .update({
        status,
        published_urls: { wordpress: result.wordpressUrl, sns: result.sns, naver_cafe: result.naverCafe, tumblr: result.tumblr, linkedin: result.linkedin, wordpress_com: result.wordpressCom, github_pages: result.githubPages },
        published_at: result.wordpressUrl ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', article.id);

    return { ok: true, published: !!result.wordpressUrl, data: { id: article.id, title: article.rewritten_title, ...result } };
  } catch (e) {
    await supabase
      .from('bossai_rewrite_articles')
      .update({ published_urls: { publish_error: String(e).slice(0, 300) }, updated_at: new Date().toISOString() })
      .eq('id', article.id);
    return { ok: false, error: String(e), data: { id: article.id, title: article.rewritten_title } };
  }
}

// "가장 오래된 ready 하나"만 뽑으면 백로그 큰 소스가 계속 우선권을 가져가서
// 다른 소스는 자기 차례가 와도(간격 통과해도) 영영 발행이 안 되는 문제가
// 실사용 중 확인됨 — 소스별로 순서를 공평하게 배정하되, 아직 발행 간격이 안
// 지난 소스는 건너뛰고 지금 당장 발행 가능한 소스 중 우선순위 소스 먼저,
// 그다음 가장 오래 기다린 소스를 고름. 없으면 null.
async function pickNextArticle(supabase: ReturnType<typeof createAdminClient>, ownerId: string): Promise<ArticleRow | { waitMinutes: number } | null> {
  const { data: readyBySource } = await supabase
    .from('bossai_rewrite_articles')
    .select('source_id, created_at')
    .eq('user_id', ownerId)
    .eq('status', 'ready')
    .order('created_at', { ascending: true });

  if (!readyBySource?.length) return null;

  const sourceKeys = [...new Set(readyBySource.map((r) => r.source_id ?? 'null'))];
  const candidates: Array<{ sourceKey: string; lastServedAt: string; waitMs: number }> = [];
  for (const sourceKey of sourceKeys) {
    let lastPublishedQuery = supabase
      .from('bossai_rewrite_articles')
      .select('published_at')
      .eq('user_id', ownerId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1);
    lastPublishedQuery = sourceKey === 'null' ? lastPublishedQuery.is('source_id', null) : lastPublishedQuery.eq('source_id', sourceKey);
    const { data: lastPublished } = await lastPublishedQuery.single();
    const sinceLast = lastPublished?.published_at ? Date.now() - new Date(lastPublished.published_at).getTime() : Infinity;
    candidates.push({
      sourceKey,
      lastServedAt: lastPublished?.published_at || '0000-01-01',
      waitMs: Math.max(0, PUBLISH_INTERVAL_MS - sinceLast),
    });
  }

  const ready = candidates.filter((c) => c.waitMs === 0).sort((a, b) => {
    const aPriority = PRIORITY_SOURCE_IDS.has(a.sourceKey);
    const bPriority = PRIORITY_SOURCE_IDS.has(b.sourceKey);
    if (aPriority !== bPriority) return aPriority ? -1 : 1;
    return a.lastServedAt < b.lastServedAt ? -1 : 1;
  });
  if (!ready.length) {
    const soonest = candidates.sort((a, b) => a.waitMs - b.waitMs)[0];
    return { waitMinutes: Math.ceil(soonest.waitMs / 60000) };
  }

  const chosenSourceKey = ready[0].sourceKey;
  let articleQuery = supabase
    .from('bossai_rewrite_articles')
    .select('id, source_id, rewritten_title, rewritten_content, rewritten_meta, representative_image_url')
    .eq('user_id', ownerId)
    .eq('status', 'ready')
    .order('created_at', { ascending: true })
    .limit(1);
  articleQuery = chosenSourceKey === 'null' ? articleQuery.is('source_id', null) : articleQuery.eq('source_id', chosenSourceKey);
  const { data } = await articleQuery.single();
  return data;
}

export async function POST(req: NextRequest) {
  if (!await authOk(req)) return err('인증 실패', 401);

  const ownerId = process.env.OWNER_USER_ID!;
  const supabase = await createAdminClient();

  const body = await req.json().catch(() => ({}));
  const { article_id } = body as { article_id?: string };

  if (article_id) {
    const { data: article } = await supabase
      .from('bossai_rewrite_articles')
      .select('id, source_id, rewritten_title, rewritten_content, rewritten_meta, representative_image_url')
      .eq('user_id', ownerId)
      .eq('status', 'ready')
      .eq('id', article_id)
      .single();
    if (!article) return NextResponse.json({ ok: true, published: false, reason: '발행 대기 중인 기사 없음' });
    const result = await publishArticle(supabase, ownerId, article);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  // 크론이 20분 간격으로만 도는데 소스가 19개라, 호출당 1건씩만 처리하면
  // 산술적으로 못 따라가는 게 실측 확인됨(경향신문 72시간·one.yoosol 2.5일
  // 지연) — 시간 예산/최대 건수 안에서 지금 당장 발행 가능한 소스를 있는
  // 대로 이어서 처리.
  const startedAt = Date.now();
  const results: Array<Record<string, unknown>> = [];
  let lastNoWork: { ok: true; published: false; reason: string } | null = null;

  for (let i = 0; i < MAX_PUBLISHES_PER_CALL; i++) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;

    const picked = await pickNextArticle(supabase, ownerId);
    if (!picked) { lastNoWork = { ok: true, published: false, reason: '발행 대기 중인 기사 없음' }; break; }
    if ('waitMinutes' in picked) {
      lastNoWork = { ok: true, published: false, reason: `발행 간격 대기 중 — ${picked.waitMinutes}분 후 재시도` };
      break;
    }

    const result = await publishArticle(supabase, ownerId, picked);
    results.push(result);
  }

  if (!results.length) return NextResponse.json(lastNoWork || { ok: true, published: false, reason: '발행 대기 중인 기사 없음' });

  const publishedCount = results.filter((r) => r.ok && (r as { published?: boolean }).published).length;
  return NextResponse.json({ ok: true, published: publishedCount > 0, publishedCount, attempted: results.length, results });
}
