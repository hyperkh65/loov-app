/**
 * POST /api/rewrite/publish-next
 * "ready" 상태 기사 중 가장 오래된 것 하나를 골라 설정된 WordPress 사이트 +
 * 연결된 SNS 전체에 발행. 한 번에 몰아서 쏟아지지 않도록 발행 간격은 15분으로 제한.
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { publishRewrittenArticle } from '@/lib/rewrite-publish';

export const maxDuration = 120;

const PUBLISH_INTERVAL_MS = 15 * 60 * 1000;

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

  const { data: lastPublished } = await supabase
    .from('bossai_rewrite_articles')
    .select('published_at')
    .eq('user_id', ownerId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .single();
  const sinceLast = lastPublished?.published_at ? Date.now() - new Date(lastPublished.published_at).getTime() : Infinity;

  if (sinceLast < PUBLISH_INTERVAL_MS) {
    return NextResponse.json({ ok: true, published: false, reason: `발행 간격(15분) 대기 중 — ${Math.ceil((PUBLISH_INTERVAL_MS - sinceLast) / 60000)}분 후 재시도` });
  }

  const { data: article } = await supabase
    .from('bossai_rewrite_articles')
    .select('id, rewritten_title, rewritten_content, representative_image_url')
    .eq('user_id', ownerId)
    .eq('status', 'ready')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!article) {
    return NextResponse.json({ ok: true, published: false, reason: '발행 대기 중인 기사 없음' });
  }

  try {
    const result = await publishRewrittenArticle(
      {
        title: article.rewritten_title,
        content: article.rewritten_content,
        representative_image_url: article.representative_image_url,
      },
      ownerId,
    );

    const status = result.wordpressUrl ? 'published' : 'ready';
    await supabase
      .from('bossai_rewrite_articles')
      .update({
        status,
        published_urls: { wordpress: result.wordpressUrl, sns: result.sns },
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
