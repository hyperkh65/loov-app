/**
 * POST /api/rewrite/publish-next
 * "ready" 상태 기사 중 가장 오래된 것 하나를 골라 설정된 WordPress 사이트 +
 * 연결된 SNS 전체에 발행. 한 번에 몰아서 쏟아지지 않도록 발행 간격은 2시간으로 제한.
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { publishRewrittenArticle } from '@/lib/rewrite-publish';

export const maxDuration = 200; // self-hosted라 실제 강제는 안 되지만 auto-run의 fetch 타임아웃과 맞춤

const PUBLISH_INTERVAL_MS = 2 * 60 * 60 * 1000;

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

  let articleQuery = supabase
    .from('bossai_rewrite_articles')
    .select('id, source_id, rewritten_title, rewritten_content, representative_image_url')
    .eq('user_id', ownerId)
    .eq('status', 'ready');
  articleQuery = article_id
    ? articleQuery.eq('id', article_id)
    : articleQuery.order('created_at', { ascending: true }).limit(1);
  const { data: article } = await articleQuery.single();

  if (!article) {
    return NextResponse.json({ ok: true, published: false, reason: '발행 대기 중인 기사 없음' });
  }

  // 발행 간격은 소스별로 따로 체크 — 소스마다 발행 대상 워드프레스/채널이
  // 달라졌으므로(예: 미라쿨 vs 아보다) 서로 무관한 소스끼리 발행을 막을 이유가 없음.
  // source_id가 없는 기존/수동 기사는 이전처럼 전체 기준으로 체크.
  let lastPublishedQuery = supabase
    .from('bossai_rewrite_articles')
    .select('published_at')
    .eq('user_id', ownerId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1);
  lastPublishedQuery = article.source_id
    ? lastPublishedQuery.eq('source_id', article.source_id)
    : lastPublishedQuery.is('source_id', null);
  const { data: lastPublished } = await lastPublishedQuery.single();
  const sinceLast = lastPublished?.published_at ? Date.now() - new Date(lastPublished.published_at).getTime() : Infinity;

  if (sinceLast < PUBLISH_INTERVAL_MS) {
    return NextResponse.json({ ok: true, published: false, reason: `발행 간격 대기 중 — ${Math.ceil((PUBLISH_INTERVAL_MS - sinceLast) / 60000)}분 후 재시도` });
  }

  try {
    const result = await publishRewrittenArticle(
      {
        title: article.rewritten_title,
        content: article.rewritten_content,
        representative_image_url: article.representative_image_url,
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
