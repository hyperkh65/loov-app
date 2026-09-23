/**
 * POST /api/rewrite/publish-next
 * "ready" 상태 기사를 SNS 계정 그룹(@2dayskr/@2dayskr_korea/@aboda_miracool)
 * 라운드로빈으로 골라 설정된 WordPress 사이트 + 연결된 SNS 전체에 발행
 * (2026-09-23, 사용자 확정 — 예전엔 소스별 로테이션이라 같은 계정으로 나가는
 * 소스끼리 서로 순서를 다퉈서 결국 한 계정만 자주 발행되던 문제가 있었음).
 * 그룹 하나가 한 번에 몰아서 쏟아지지 않도록 그룹별 발행 간격은 10분으로
 * 제한하되(30분에서 10분으로 단축, one.yoosol 37건 적체 확인 후 단축, 크론
 * 주기도 20분에서 10분으로 같이 줄임), 호출 한 번에 여러 건을 순서대로
 * 처리해서 크론 1틱당 1건만 나가던 처리량 한계를 풂.
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { publishRewrittenArticle, getSnsAccountRouting } from '@/lib/rewrite-publish';

export const maxDuration = 200; // self-hosted라 실제 강제는 안 되지만 auto-run의 fetch 타임아웃과 맞춤

const PUBLISH_INTERVAL_MS = 10 * 60 * 1000;
const MAX_PUBLISHES_PER_CALL = 5;
// 기사 1건 발행(워드프레스+SNS 여러 개+네이버카페+텀블러 등 순차 호출)이 실측
// 60~90초까지 걸리는 걸 확인함(과거 maxDuration을 60→300으로 올린 이력, d14d305).
// 이 체크는 "다음 건을 시작하기 전"에만 걸리고 진행 중인 발행을 끊지는 못하므로,
// 남은 예산 + 발행 1건 최악 소요시간(~90초)의 합이 auto-run의 200s abort보다
// 작아야 안전함 — 처음 배포 때 8건/170초로 잡았다가 실제로 크론 1틱이 5분
// 넘게 안 끝나는 걸 실측 확인해서 보수적으로 낮춤.
const TIME_BUDGET_MS = 100_000;

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

// 소스 단위 로테이션 대신 "계정 그룹" 단위로 로테이션(사용자 확정) — 소스별로
// 돌리면 같은 계정으로 나가는 소스끼리 서로 순서를 다퉈서 결국 그 계정 하나만
// 자주 발행되고 다른 계정은 밀리는 문제가 있음. @2dayskr / @2dayskr_korea /
// @aboda_miracool 세 그룹이 매번 공평하게 한 번씩 자기 차례를 받도록 함 —
// 그룹 안에서 여러 소스가 준비돼 있으면 우선순위 소스(one.yoosol/yoonfree)
// 먼저, 그다음 가장 오래 기다린 소스.
const accountGroupCache = new Map<string, string>();
async function accountGroupForSource(sourceId: string | null): Promise<string> {
  const key = sourceId ?? 'null';
  const cached = accountGroupCache.get(key);
  if (cached) return cached;
  const accounts = await getSnsAccountRouting(sourceId);
  const group = accounts[0] || '@2dayskr';
  accountGroupCache.set(key, group);
  return group;
}

async function pickNextArticle(supabase: ReturnType<typeof createAdminClient>, ownerId: string): Promise<ArticleRow | { waitMinutes: number } | null> {
  const { data: readyArticles } = await supabase
    .from('bossai_rewrite_articles')
    .select('id, source_id, created_at')
    .eq('user_id', ownerId)
    .eq('status', 'ready')
    .order('created_at', { ascending: true });

  if (!readyArticles?.length) return null;

  // 최근 발행된 글들로 그룹별 "마지막 발행 시각"을 근사 — 그룹 자체가 컬럼이
  // 아니라 소스→그룹 매핑을 거쳐야 해서 SQL로 바로 집계가 안 됨. 그룹이 3개뿐이고
  // 발행 빈도가 높아서 최근 60건이면 세 그룹 모두 충분히 포함됨.
  const { data: recentPublished } = await supabase
    .from('bossai_rewrite_articles')
    .select('source_id, published_at')
    .eq('user_id', ownerId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(60);

  const readyWithGroup = await Promise.all(
    readyArticles.map(async (a) => ({ ...a, group: await accountGroupForSource(a.source_id) }))
  );
  const lastPublishedAtByGroup = new Map<string, string>();
  for (const p of recentPublished || []) {
    const group = await accountGroupForSource(p.source_id);
    if (!lastPublishedAtByGroup.has(group) && p.published_at) lastPublishedAtByGroup.set(group, p.published_at);
  }

  const groupKeys = [...new Set(readyWithGroup.map((a) => a.group))];
  const candidates = groupKeys.map((group) => {
    const lastAt = lastPublishedAtByGroup.get(group);
    const sinceLast = lastAt ? Date.now() - new Date(lastAt).getTime() : Infinity;
    return { group, lastServedAt: lastAt || '0000-01-01', waitMs: Math.max(0, PUBLISH_INTERVAL_MS - sinceLast) };
  });

  const ready = candidates.filter((c) => c.waitMs === 0).sort((a, b) => (a.lastServedAt < b.lastServedAt ? -1 : 1));
  if (!ready.length) {
    const soonest = candidates.sort((a, b) => a.waitMs - b.waitMs)[0];
    return { waitMinutes: Math.ceil(soonest.waitMs / 60000) };
  }

  const chosenGroup = ready[0].group;
  const inGroup = readyWithGroup.filter((a) => a.group === chosenGroup).sort((a, b) => {
    const aPriority = PRIORITY_SOURCE_IDS.has(a.source_id ?? '');
    const bPriority = PRIORITY_SOURCE_IDS.has(b.source_id ?? '');
    if (aPriority !== bPriority) return aPriority ? -1 : 1;
    return a.created_at < b.created_at ? -1 : 1;
  });
  const chosenId = inGroup[0].id;

  const { data } = await supabase
    .from('bossai_rewrite_articles')
    .select('id, source_id, rewritten_title, rewritten_content, rewritten_meta, representative_image_url')
    .eq('id', chosenId)
    .single();
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
