/**
 * affiliate_video_projects가 READY_TO_PUBLISH(QA 게이트 통과)에 도달하면
 * 인스타그램 릴스로 자동 발행 — 발굴→매칭→렌더까지는 되는데 발행이 이어지지
 * 않던 지점을 연결(사용자 확정: @2dayskr 계정으로 발행).
 */
import { createAdminClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia } from '@/lib/sns/platforms-server';

const IG_PLATFORM_USER_ID = '34489947500650071'; // @2dayskr — 쿠팡 상품 릴스 계정(사용자 확정)
const DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

function buildCaption(hook: string | undefined, productName: string | undefined, affiliateUrl: string | undefined): string {
  return [
    hook || productName || '오늘의 추천템',
    '',
    productName ? `▶ ${productName}` : '',
    affiliateUrl ? `구매 링크: ${affiliateUrl}` : '',
    '',
    DISCLOSURE,
    '',
    '#쿠팡 #쿠팡추천 #생활꿀템 #가성비템 #추천템',
  ].filter(Boolean).join('\n');
}

export async function runAffiliatePublishAuto(userId: string): Promise<{ published: number; results: string[] }> {
  const supabase = createAdminClient();

  const { data: projects } = await supabase
    .from('affiliate_video_projects')
    .select('id, product_id')
    .eq('user_id', userId)
    .eq('status', 'READY_TO_PUBLISH');

  if (!projects?.length) return { published: 0, results: ['발행 대기 중인 영상 없음'] };

  const { data: conn } = await supabase
    .from('sns_connections')
    .select('access_token, platform_user_id')
    .eq('user_id', userId)
    .eq('platform', 'instagram')
    .eq('platform_user_id', IG_PLATFORM_USER_ID)
    .eq('is_active', true)
    .single();
  if (!conn) throw new Error('@2dayskr 인스타그램 연결 없음 — 허브에서 재연결 필요');

  const results: string[] = [];
  let published = 0;

  for (const project of projects) {
    try {
      const { data: variant } = await supabase
        .from('affiliate_video_variants')
        .select('id, script_id')
        .eq('project_id', project.id)
        .limit(1)
        .single();
      if (!variant) { results.push(`${project.id}: variant 없음`); continue; }

      const { data: render } = await supabase
        .from('affiliate_renders')
        .select('id, public_url')
        .eq('variant_id', variant.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!render?.public_url) { results.push(`${project.id}: 완료된 렌더 없음`); continue; }

      const [{ data: product }, { data: script }, { data: match }] = await Promise.all([
        supabase.from('affiliate_products').select('product_name').eq('id', project.product_id).single(),
        supabase.from('affiliate_scripts').select('hook_text').eq('id', variant.script_id).single(),
        supabase.from('affiliate_product_matches').select('listing_id').eq('product_id', project.product_id).limit(1).single(),
      ]);
      const { data: listing } = match?.listing_id
        ? await supabase.from('affiliate_listings').select('affiliate_url').eq('id', match.listing_id).single()
        : { data: null };

      const caption = buildCaption(script?.hook_text, product?.product_name, listing?.affiliate_url);
      const pub = await postToPlatformWithMedia('instagram', conn.access_token, conn.platform_user_id, caption, [render.public_url]);

      const { data: job } = await supabase
        .from('affiliate_publication_jobs')
        .insert({ user_id: userId, render_id: render.id, platform: 'instagram', status: 'completed' })
        .select('id')
        .single();

      if (job) {
        await supabase.from('affiliate_publications').insert({
          user_id: userId,
          publication_job_id: job.id,
          platform: 'instagram',
          platform_post_id: pub.id,
          disclosure_template: DISCLOSURE,
        });
      }

      await supabase.from('affiliate_video_projects').update({ status: 'PUBLISHED' }).eq('id', project.id);

      published++;
      results.push(`${product?.product_name || project.id}: 발행 완료 (ig:${pub.id})`);
    } catch (e) {
      results.push(`${project.id}: 실패 — ${(e as Error).message?.slice(0, 150)}`);
    }
  }

  return { published, results };
}
