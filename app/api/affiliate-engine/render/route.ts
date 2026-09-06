/**
 * POST /api/affiliate-engine/render
 * Phase 10: 생성된 스크립트를 실제 숏폼 영상으로 렌더링.
 * lib/shorts/render-core의 renderShortsVideo(TTS+Ken Burns+자막+NAS ffmpeg+R2
 * 업로드)를 같은 프로세스 안에서 직접 함수 호출로 재사용한다 — 자기 자신을
 * HTTP로 호출하는 방식은 hairpin NAT, undici bodyTimeout, 리버스 프록시
 * 타임아웃이 전부 실사용 중 확인되어 폐기.
 * 각 장면 이미지는 우선 상품의 실제 제휴 리스팅 사진을 재사용한다
 * (장면별로 다른 사진을 붙이는 건 별도 이미지 소싱이 필요해 다음 범위).
 *
 * 렌더링(TTS 9개+ffmpeg 합성)은 몇 분씩 걸려서 동기 응답으로 두면 안 됨 —
 * self-hosted Docker라 Node 프로세스가 계속 살아있는 걸 이용해 요청은 즉시
 * CREATING으로 응답하고 실제 작업은 백그라운드(await 안 하고 fire-and-forget)로
 * 계속 진행, 완료되면 DB 상태만 갱신. 프론트는 폴링으로 완료 확인.
 * Body: { script_id: string }
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { renderShortsVideo } from '@/lib/shorts/render-core';

interface Scene { id: number; duration: number; narration: string; subtitle: string }

async function runRenderInBackground(params: {
  projectId: string; userId: string; productId: string;
  scenes: (Scene & { image_url: string | null })[]; title: string;
  scriptId: string; variantLabel: string;
}) {
  const admin = createAdminClient();

  try {
    const result = await renderShortsVideo(params.scenes, { title: params.title });

    const totalDuration = params.scenes.reduce((sum, s) => sum + (s.duration || 0), 0);

    const { data: variant } = await admin.from('affiliate_video_variants').insert({
      user_id: params.userId,
      project_id: params.projectId,
      script_id: params.scriptId,
      variant_label: params.variantLabel,
      duration_sec: totalDuration,
    }).select().single();

    await admin.from('affiliate_renders').insert({
      user_id: params.userId,
      variant_id: variant?.id,
      status: 'completed',
      public_url: result.url,
      resolution: '1080x1920',
      duration_sec: totalDuration,
      finished_at: new Date().toISOString(),
    });

    await admin.from('affiliate_video_projects').update({ status: 'READY_TO_PUBLISH', updated_at: new Date().toISOString() }).eq('id', params.projectId);
    await admin.from('affiliate_products').update({ status: 'IN_PRODUCTION', updated_at: new Date().toISOString() }).eq('id', params.productId);
  } catch (e) {
    await admin.from('affiliate_video_projects').update({ status: 'REJECTED', updated_at: new Date().toISOString() }).eq('id', params.projectId);
    console.error('[affiliate-engine/render] 백그라운드 렌더링 실패:', e);
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const scriptId: string | undefined = body.script_id;
  if (!scriptId) return NextResponse.json({ error: 'script_id 필요' }, { status: 400 });

  const { data: script, error } = await supabase
    .from('affiliate_scripts')
    .select('id, product_id, variant_label, structure')
    .eq('id', scriptId)
    .eq('user_id', user.id)
    .single();
  if (error || !script) return NextResponse.json({ error: '스크립트를 찾을 수 없습니다' }, { status: 404 });

  const structure = script.structure as { title: string; scenes: Scene[] };
  if (!structure?.scenes?.length) return NextResponse.json({ error: '스크립트에 장면 데이터가 없습니다' }, { status: 400 });

  const { data: match } = await supabase
    .from('affiliate_product_matches')
    .select('listing_id, affiliate_listings(image_url)')
    .eq('product_id', script.product_id)
    .maybeSingle();
  const listingImageUrl = (match?.affiliate_listings as unknown as { image_url: string } | null)?.image_url || null;
  const scenesWithImages = structure.scenes.map(s => ({ ...s, image_url: listingImageUrl }));

  const { data: project, error: projectErr } = await supabase.from('affiliate_video_projects').insert({
    user_id: user.id,
    product_id: script.product_id,
    listing_id: match?.listing_id || null,
    status: 'CREATING',
  }).select().single();
  if (projectErr || !project) return NextResponse.json({ error: projectErr?.message || '프로젝트 생성 실패' }, { status: 500 });

  // 응답은 즉시 반환하고, 실제 렌더링은 응답 이후에도 계속 진행 — 그냥
  // await 없이 호출(void)하면 Next.js가 응답 전송 후 요청 컨텍스트를 정리하며
  // 이 fire-and-forget 작업이 이어지지 않을 수 있어(실사용 중 확인됨: mkdir조차
  // 실행 안 됨) 정확히 이 용도로 만들어진 after()로 감싼다.
  after(() => runRenderInBackground({
    projectId: project.id,
    userId: user.id,
    productId: script.product_id,
    scenes: scenesWithImages,
    title: structure.title,
    scriptId,
    variantLabel: script.variant_label,
  }));

  return NextResponse.json({ ok: true, project_id: project.id, status: 'CREATING' });
}
