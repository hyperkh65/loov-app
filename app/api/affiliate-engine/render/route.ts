/**
 * POST /api/affiliate-engine/render
 * Phase 10: 생성된 스크립트를 실제 숏폼 영상으로 렌더링.
 * 기존 /api/shorts/render(TTS+Ken Burns+자막+NAS ffmpeg+R2 업로드)를 그대로
 * 재사용 — 각 장면 이미지는 우선 상품의 실제 제휴 리스팅 사진을 재사용한다
 * (장면별로 다른 사진을 붙이는 건 별도 이미지 소싱이 필요해 다음 범위).
 * Body: { script_id: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

export const maxDuration = 280;

interface Scene { id: number; duration: number; narration: string; subtitle: string }

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

  // 내부 서버-투-서버 호출은 반드시 로컬 주소로 — NEXT_PUBLIC_APP_URL(공인 도메인)로 호출하면
  // 컨테이너 → 라우터 → 공인IP → 자기 자신으로 되돌아오는 hairpin NAT을 타게 되는데,
  // 이 왕복 연결이 오래 걸리는 렌더링 스트림 중간에 끊기는 문제가 실제로 확인됨.
  const internalUrl = process.env.INTERNAL_BASE_URL || 'http://localhost:3000';
  const renderRes = await fetch(`${internalUrl}/api/shorts/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') || '',
    },
    body: JSON.stringify({ scenes: scenesWithImages, title: structure.title }),
    signal: AbortSignal.timeout(270_000),
  });

  if (!renderRes.body) return NextResponse.json({ error: '렌더링 응답 없음' }, { status: 500 });

  const reader = renderRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let videoUrl: string | null = null;
  let errorMsg: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'done') videoUrl = evt.url;
        if (evt.type === 'error') errorMsg = evt.message;
      } catch { /* 무시 */ }
    }
  }

  if (!videoUrl) return NextResponse.json({ error: errorMsg || '렌더링 실패' }, { status: 500 });

  const admin = createAdminClient();
  const totalDuration = structure.scenes.reduce((sum, s) => sum + (s.duration || 0), 0);

  const { data: project } = await admin.from('affiliate_video_projects').insert({
    user_id: user.id,
    product_id: script.product_id,
    listing_id: match?.listing_id || null,
    status: 'READY_TO_PUBLISH',
  }).select().single();

  const { data: variant } = await admin.from('affiliate_video_variants').insert({
    user_id: user.id,
    project_id: project?.id,
    script_id: scriptId,
    variant_label: script.variant_label,
    duration_sec: totalDuration,
  }).select().single();

  await admin.from('affiliate_renders').insert({
    user_id: user.id,
    variant_id: variant?.id,
    status: 'completed',
    public_url: videoUrl,
    resolution: '1080x1920',
    duration_sec: totalDuration,
    finished_at: new Date().toISOString(),
  });

  await supabase.from('affiliate_products').update({ status: 'IN_PRODUCTION', updated_at: new Date().toISOString() }).eq('id', script.product_id);

  return NextResponse.json({ ok: true, video_url: videoUrl, project_id: project?.id });
}
