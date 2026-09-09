/**
 * POST /api/rewrite/publish-next
 * "ready" 상태 기사 중 가장 오래된 것 하나를 골라 설정된 WordPress 사이트 +
 * 연결된 SNS 전체에 발행. 한 번에 몰아서 쏟아지지 않도록 발행 간격은 1시간으로 제한.
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { publishRewrittenArticle } from '@/lib/rewrite-publish';

export const maxDuration = 200; // self-hosted라 실제 강제는 안 되지만 auto-run의 fetch 타임아웃과 맞춤

const PUBLISH_INTERVAL_MS = 60 * 60 * 1000;

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

  const body = await req.json().catch(() => ({}));
  const { article_id } = body as { article_id?: string };

  type ArticleRow = {
    id: string; source_id: string | null;
    rewritten_title: string; rewritten_content: string; rewritten_meta: string | null;
    representative_image_url: string | null;
  };
  let article: ArticleRow | null = null;

  if (article_id) {
    const { data } = await supabase
      .from('bossai_rewrite_articles')
      .select('id, source_id, rewritten_title, rewritten_content, rewritten_meta, representative_image_url')
      .eq('user_id', ownerId)
      .eq('status', 'ready')
      .eq('id', article_id)
      .single();
    article = data;
    if (!article) return NextResponse.json({ ok: true, published: false, reason: '발행 대기 중인 기사 없음' });
  } else {
    // "가장 오래된 ready 하나"만 뽑으면 process와 동일하게 백로그 큰 소스가
    // 계속 우선권을 가져가서 다른 소스는 자기 차례가 와도(간격 통과해도) 영영
    // 발행이 안 되는 문제가 실사용 중 확인됨 — 소스별로 순서를 공평하게
    // 배정하되, 아직 발행 간격이 안 지난 소스는 건너뛰고 지금 당장 발행
    // 가능한 소스 중에서 가장 오래 기다린 소스를 고름
    const { data: readyBySource } = await supabase
      .from('bossai_rewrite_articles')
      .select('source_id, created_at')
      .eq('user_id', ownerId)
      .eq('status', 'ready')
      .order('created_at', { ascending: true });

    if (!readyBySource?.length) {
      return NextResponse.json({ ok: true, published: false, reason: '발행 대기 중인 기사 없음' });
    }

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

    // 간격이 지나 지금 발행 가능한 소스들 중, 가장 오래 기다린(=마지막 발행이 가장
    // 오래전인) 소스를 우선 — 전부 간격 대기 중이면 가장 빨리 풀리는 소스로 안내
    const ready = candidates.filter((c) => c.waitMs === 0).sort((a, b) => (a.lastServedAt < b.lastServedAt ? -1 : 1));
    if (!ready.length) {
      const soonest = candidates.sort((a, b) => a.waitMs - b.waitMs)[0];
      return NextResponse.json({ ok: true, published: false, reason: `발행 간격 대기 중 — ${Math.ceil(soonest.waitMs / 60000)}분 후 재시도` });
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
    article = data;
    if (!article) return NextResponse.json({ ok: true, published: false, reason: '발행 대기 중인 기사 없음' });
  }

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
        published_urls: { wordpress: result.wordpressUrl, sns: result.sns, naver_cafe: result.naverCafe, tumblr: result.tumblr },
        published_at: result.wordpressUrl ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', article.id);

    return NextResponse.json({ ok: true, published: !!result.wordpressUrl, data: { id: article.id, title: article.rewritten_title, ...result } });
  } catch (e) {
    await supabase
      .from('bossai_rewrite_articles')
      .update({ published_urls: { publish_error: String(e).slice(0, 300) }, updated_at: new Date().toISOString() })
      .eq('id', article.id);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
