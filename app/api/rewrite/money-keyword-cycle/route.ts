/**
 * POST /api/rewrite/money-keyword-cycle
 * bossai_keyword_opportunities(category='finance')에서 diamond/gold + can_rank1
 * 등급 키워드를 정면으로 노리는 오리지널 글을 써서 money.2days.kr에 발행한다.
 * 뉴스 리라이팅(site-cycle, finance.2days.kr)과는 별개 콘텐츠 스트림 —
 * "진짜 돈 되는 키워드"가 없으면 라이프스타일처럼 구글트렌드로 억지로
 * 때우지 않고 이번 사이클은 그냥 건너뛴다.
 * Auth: Bearer CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { generateBlogContent } from '@/lib/blog-content-generator';
import { publishRewrittenArticle } from '@/lib/rewrite-publish';

const SITE_URL = 'https://money.2days.kr';
// bossai_rewrite_sources의 "발행 설정 캐리어" 역할만 하는 비활성 소스 행 —
// RSS가 없는 키워드 발행 사이트도 publishRewrittenArticle의 네이버카페/텀블러/
// 링크드인/워드프레스닷컴/깃헙페이지/SNS 크로스포스팅을 그대로 재사용하기 위해
// (기존 뉴스 리라이팅 사이트들과 동일하게 "새로 만드는 사이트는 다 올라가야
// 한다"는 요구사항) 만들어둠 — is_active=false라 sync-sites RSS 폴링 대상에서는 제외됨.
const PUBLISH_SOURCE_ID = '78df8c59-b47f-49cc-a273-09f34cf2693d';
// 이 사이클보다 먼저 나갈 만큼 신선한 후보만 씀 — 너무 오래된 캐시는 이미
// 경쟁 상황이 바뀌었을 수 있음
const FRESH_MS = 24 * 60 * 60 * 1000;
// 20분 크론마다 불려도 실제 발행은 하루 6회 수준으로 — "진짜 돈 되는" 글은
// 양보다 질이라 뉴스 리라이팅처럼 매 크론 발행할 필요 없음(제안값, 조정 가능)
const MIN_GAP_MS = 4 * 60 * 60 * 1000;

async function recentlyPublished(): Promise<boolean> {
  try {
    const res = await fetch(`${SITE_URL}/wp-json/wp/v2/posts?per_page=1&orderby=date&order=desc`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const posts = await res.json() as Array<{ date_gmt?: string }>;
    const lastDate = posts[0]?.date_gmt;
    if (!lastDate) return false;
    return Date.now() - new Date(`${lastDate}Z`).getTime() < MIN_GAP_MS;
  } catch { return false; }
}

function authOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: '인증 실패' }, { status: 401 });

  const { ai_model = 'qwen3' } = await req.json().catch(() => ({})) as { ai_model?: string };
  const ownerId = process.env.OWNER_USER_ID!;
  const supabase = createAdminClient();

  const { data: site } = await supabase
    .from('wordpress_sites')
    .select('id')
    .eq('user_id', ownerId)
    .eq('site_url', SITE_URL)
    .single();
  if (!site) return NextResponse.json({ ok: false, error: `wordpress_sites에 ${SITE_URL} 없음 — 먼저 사이트 생성 필요` }, { status: 404 });

  if (await recentlyPublished()) {
    return NextResponse.json({ ok: true, message: `최근 ${MIN_GAP_MS / 3600000}시간 내 이미 발행함 — 건너뜀` });
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
      ownerId, PUBLISH_SOURCE_ID,
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
