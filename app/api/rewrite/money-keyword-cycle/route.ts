/**
 * POST /api/rewrite/money-keyword-cycle
 * bossai_keyword_opportunities(category='finance')에서 diamond/gold + can_rank1
 * 등급 키워드를 정면으로 노리는 오리지널 글을 써서 money.2days.kr에 발행한다.
 * (money / miracool / finance 사이트가 같은 키워드 풀을 나눠 씀; body.site_url로 선택)
 * 뉴스 리라이팅(site-cycle)과는 별개 콘텐츠 스트림 —
 * "진짜 돈 되는 키워드"가 없으면 라이프스타일처럼 구글트렌드로 억지로
 * 때우지 않고 이번 사이클은 그냥 건너뛴다.
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { generateBlogContent } from '@/lib/blog-content-generator';
import { publishRewrittenArticle } from '@/lib/rewrite-publish';
import { publishSlotFree } from '@/lib/scheduler/blog-runner';

// 사이트별 "발행 설정 캐리어" — bossai_rewrite_sources의 비활성 소스 행. RSS가 없는
// 키워드 발행 사이트도 publishRewrittenArticle의 카페/텀블러/SNS 크로스포스팅을
// 그대로 재사용하기 위함 (is_active=false라 sync-sites 폴링 대상에서는 제외됨).
const SITES: Record<string, { sourceId: string }> = {
  'https://money.2days.kr': { sourceId: '78df8c59-b47f-49cc-a273-09f34cf2693d' },
  'https://miracool.co.kr': { sourceId: '9ff047e8-eda9-4115-b227-3176844e2ba8' },
  'https://finance.2days.kr': { sourceId: 'ed651d96-f3d8-420d-a430-59722b746147' },
};
// 이 사이클보다 먼저 나갈 만큼 신선한 후보만 씀 — 너무 오래된 캐시는 경쟁 상황이 바뀌었을 수 있음
const FRESH_MS = 24 * 60 * 60 * 1000;

function authOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: '인증 실패' }, { status: 401 });

  const { ai_model = 'qwen3', site_url = 'https://money.2days.kr' } = await req.json().catch(() => ({})) as { ai_model?: string; site_url?: string };
  const cfg = SITES[site_url];
  if (!cfg) return NextResponse.json({ ok: false, error: `지원하지 않는 site_url: ${site_url}` }, { status: 400 });
  const SITE_URL = site_url;
  const ownerId = process.env.OWNER_USER_ID!;
  const supabase = createAdminClient();

  const { data: site } = await supabase
    .from('wordpress_sites')
    .select('id')
    .eq('user_id', ownerId)
    .eq('site_url', SITE_URL)
    .single();
  if (!site) return NextResponse.json({ ok: false, error: `wordpress_sites에 ${SITE_URL} 없음 — 먼저 사이트 생성 필요` }, { status: 404 });

  if (!await publishSlotFree(SITE_URL)) {
    return NextResponse.json({ ok: true, message: '발행 슬롯 대기(분산 발행) — 건너뜀' });
  }

  const since = new Date(Date.now() - FRESH_MS).toISOString();
  const { data: candidates } = await supabase
    .from('bossai_keyword_opportunities')
    .select('keyword, score, grade, can_rank1')
    .eq('user_id', ownerId)
    .eq('category', 'finance')
    .gte('created_at', since)
    .gt('score', 0)
    .in('grade', ['diamond', 'gold'])
    .order('can_rank1', { ascending: false })
    .order('score', { ascending: false })
    .limit(1);

  const picked = candidates?.[0];
  if (!picked) {
    return NextResponse.json({ ok: true, message: 'diamond/gold 등급 키워드 없음 — 이번 사이클 건너뜀' });
  }

  try {
    const { title, content, meta_description, imageUrl } = await generateBlogContent(picked.keyword, ai_model);
    const result = await publishRewrittenArticle(
      { title, content, representative_image_url: imageUrl, meta: meta_description },
      ownerId, cfg.sourceId,
    );

    // 재사용 방지 — 캐시는 auto-discover가 계속 새로 채우니 쓴 건 지워서
    // 같은 사이클이 반복해서 같은 키워드를 다시 집지 않게 함
    await supabase
      .from('bossai_keyword_opportunities')
      .delete()
      .eq('user_id', ownerId)
      .eq('keyword', picked.keyword)
      .eq('category', 'finance');

    return NextResponse.json({ ok: true, keyword: picked.keyword, grade: picked.grade, title, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, keyword: picked.keyword, error: String(e) }, { status: 500 });
  }
}
