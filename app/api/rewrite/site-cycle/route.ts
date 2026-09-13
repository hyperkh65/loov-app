/**
 * POST /api/rewrite/site-cycle
 * 특정 워드프레스 사이트로 라우팅된 소스의 글을 그 사이트 전용으로
 * 리라이팅+발행까지 한 번에 처리한다. process/publish-next는 전체
 * 소스가 공유하는 발행 슬롯(20분당 1건)이라 소스가 30개 넘어가면 사이트
 * 하나가 몇 시간이고 순서를 못 받을 수 있음 — 특정 사이트는 무조건 매
 * 크론마다 새 글이 나가야 할 때 이 라우트로 그 사이트 전용 슬롯을 보장한다.
 * Body: { site_url: string }
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

const BASE = 'http://172.17.0.1:3100';

function authOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: '인증 실패' }, { status: 401 });

  const { site_url } = await req.json().catch(() => ({}));
  if (!site_url) return NextResponse.json({ ok: false, error: 'site_url 필요' }, { status: 400 });

  const ownerId = process.env.OWNER_USER_ID!;
  const supabase = createAdminClient();
  const cronSecret = process.env.CRON_SECRET || process.env.BOT_SECRET || '';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` };

  const { data: site } = await supabase
    .from('wordpress_sites')
    .select('id')
    .eq('user_id', ownerId)
    .eq('site_url', site_url)
    .single();
  if (!site) return NextResponse.json({ ok: false, error: `wordpress_sites에 ${site_url} 없음` }, { status: 404 });

  const { data: sources } = await supabase
    .from('bossai_rewrite_sources')
    .select('id')
    .eq('user_id', ownerId)
    .eq('publish_wp_site_id', site.id);
  const sourceIds = (sources || []).map(s => s.id);
  if (!sourceIds.length) {
    return NextResponse.json({ ok: true, message: `${site_url}로 라우팅된 소스 없음` });
  }

  // 이미 리라이팅 끝난 게 있으면 그것부터 바로 발행 — 없으면 pending 중
  // 가장 오래된 것 하나를 리라이팅부터 진행
  const { data: readyArticle } = await supabase
    .from('bossai_rewrite_articles')
    .select('id')
    .eq('user_id', ownerId)
    .eq('status', 'ready')
    .in('source_id', sourceIds)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  let targetId: string | null = readyArticle?.id || null;

  if (!targetId) {
    const { data: pendingArticle } = await supabase
      .from('bossai_rewrite_articles')
      .select('id')
      .eq('user_id', ownerId)
      .eq('status', 'pending')
      .in('source_id', sourceIds)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (!pendingArticle) {
      return NextResponse.json({ ok: true, message: '대기 중인 기사 없음(다음 RSS 동기화 대기)' });
    }

    try {
      const processRes = await fetch(`${BASE}/api/rewrite/process`, {
        method: 'POST', headers, body: JSON.stringify({ article_id: pendingArticle.id }),
        signal: AbortSignal.timeout(280_000),
      });
      const processData = await processRes.json();
      if (!processData.ok) {
        return NextResponse.json({ ok: false, error: `리라이팅 실패: ${processData.error}` }, { status: 500 });
      }
    } catch (e) {
      return NextResponse.json({ ok: false, error: `리라이팅 요청 실패: ${String(e)}` }, { status: 500 });
    }
    targetId = pendingArticle.id;
  }

  try {
    const publishRes = await fetch(`${BASE}/api/rewrite/publish-next`, {
      method: 'POST', headers, body: JSON.stringify({ article_id: targetId }),
      signal: AbortSignal.timeout(200_000),
    });
    const publishData = await publishRes.json();
    return NextResponse.json({ ok: true, articleId: targetId, publish: publishData });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `발행 요청 실패: ${String(e)}` }, { status: 500 });
  }
}
