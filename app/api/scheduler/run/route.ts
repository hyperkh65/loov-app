/**
 * POST /api/scheduler/run
 *
 * NAS cron 설정 (1분마다 실행):
 *   * * * * * curl -s -X POST https://loov.co.kr/api/scheduler/run \
 *     -H "x-internal-key: YOUR_TELEGRAM_WEBHOOK_SECRET" 2>/dev/null
 *
 * 또는 대시보드에서 수동 실행 (로그인 세션 사용)
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-server';
import { isInternalRequest } from '@/lib/internal-auth';
import { computeNextRunAt } from '@/lib/scheduler';
import { runBlogAuto } from '@/lib/scheduler/blog-runner';
import { runCoupangAuto } from '@/lib/scheduler/coupang-runner';
import { runAgodaAuto } from '@/lib/scheduler/agoda-runner';
import { runShortsAuto } from '@/lib/scheduler/shorts-runner';
import { runInstagramAuto } from '@/lib/scheduler/instagram-runner';
import { runNaverTechAuto } from '@/lib/scheduler/naver-tech-runner';
import { postToPlatformWithMedia } from '@/lib/sns/platforms-server';
import { searchAliExpressItems, getAliExpressItemDetail } from '@/lib/affiliate-engine/aliexpress-datahub';
import { upsertCoupangMatch } from '@/lib/affiliate-engine/coupang-match';
import { searchProducts } from '@/lib/coupang/api';
import { getSetting } from '@/lib/get-setting';
import { callAI, callAISimple } from '@/lib/ai-call';
import { renderShortsVideo } from '@/lib/shorts/render-core';
import type { Schedule } from '@/lib/scheduler';

export const maxDuration = 300;

// affiliate_video_projects가 READY_TO_PUBLISH(QA 게이트 통과)까지는 가는데 발행이
// 이어지지 않던 지점을 연결 — 인스타그램 릴스로 자동 발행(사용자 확정: @2dayskr 계정).
// 별도 파일(lib/scheduler/affiliate-publish-runner.ts)로 뺐다가 Turbopack 프로덕션
// 빌드에서 이 라우트가 아닌 엉뚱한 라우트(coupang/auto-post)의 청크에 코드가 묶여버려
// 런타임에 실행 자체가 안 되는 버그를 실측 확인 — 이 라우트 파일에 직접 인라인해서 회피.
const AFFILIATE_IG_PLATFORM_USER_ID = '34489947500650071'; // @2dayskr
const AFFILIATE_DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

function buildAffiliateCaption(hook: string | undefined, productName: string | undefined, affiliateUrl: string | undefined): string {
  return [
    hook || productName || '오늘의 추천템',
    '',
    productName ? `▶ ${productName}` : '',
    affiliateUrl ? `구매 링크: ${affiliateUrl}` : '',
    '',
    AFFILIATE_DISCLOSURE,
    '',
    '#쿠팡 #쿠팡추천 #생활꿀템 #가성비템 #추천템',
  ].filter(Boolean).join('\n');
}

async function runAffiliatePublishAuto(userId: string): Promise<{ published: number; results: string[] }> {
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
    .eq('platform_user_id', AFFILIATE_IG_PLATFORM_USER_ID)
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

      const caption = buildAffiliateCaption(script?.hook_text, product?.product_name, listing?.affiliate_url);
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
          disclosure_template: AFFILIATE_DISCLOSURE,
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

// 상품 소싱 자동화 — 사람이 키워드를 넣어줘야 했던 /api/affiliate-engine/discover/
// aliexpress-video를 스케줄러가 스스로 키워드를 순환시키며 대신 호출하고, 새로
// 발굴된 상품은 스크립트 생성→렌더링(실제 소스영상 사용)까지 바로 이어서
// affiliate_publish_auto가 물려받을 READY_TO_PUBLISH 상태까지 만든다.
// RapidAPI Aliexpress DataHub 무료 플랜은 월 100회 한도라(검색 1회+상세조회
// 후보당 1회) limit을 낮게 유지 — 이 스케줄은 하루 1회로만 등록할 것.
const AFFILIATE_DISCOVERY_KEYWORDS = [
  'car phone holder', 'kitchen gadget', 'led light strip', 'desk organizer',
  'portable fan', 'cleaning brush', 'bathroom organizer', 'travel accessories',
  'pet grooming tool', 'phone accessories', 'home storage box', 'outdoor camping gear',
  'baby care gadget', 'fitness accessories', 'car cleaning tool',
];

async function toKoreanSearchKeyword(englishTitle: string): Promise<string> {
  try {
    const raw = await callAISimple(
      `다음 알리익스프레스 상품명에서 실제 상품 종류만 짧은 한국어 검색 키워드(2~4단어)로 뽑아줘. 브랜드명/과장광고 문구는 빼고, 쿠팡에서 검색했을 때 같은 종류 상품이 나올 만한 일반명사로. 키워드만 출력, 다른 말 하지 마.\n\n상품명: ${englishTitle}`,
    );
    const cleaned = raw.trim().split('\n')[0].replace(/["'.]/g, '').trim();
    return cleaned || englishTitle;
  } catch (e) {
    console.error('[affiliate_discover_auto] 한글 키워드 번역 실패, 영문 원문으로 검색:', e);
    return englishTitle;
  }
}

const AFFILIATE_SCRIPT_SYSTEM_PROMPT = '당신은 대한민국 최고의 숏폼 바이럴 콘텐츠 크리에이터입니다. 시청자가 첫 3초에 멈추고, 끝까지 보고, 공유하게 만드는 스크립트를 씁니다. 과장·허위 주장 없이 실제 상품 정보만 사용하세요. 반드시 유효한 JSON만 출력하며, 코드블록이나 추가 설명은 절대 포함하지 않습니다.';

function buildAffiliateScriptPrompt(input: {
  productName: string; brand: string | null; genericType: string | null;
  features: string[]; problemSolved: string | null; useCase: string | null;
  visualDescription: string | null;
}): string {
  return `아래 상품을 소개하는 60초 숏폼 영상 스크립트를 작성하세요. 9개 장면으로 구성.

상품명: ${input.productName}
브랜드: ${input.brand || '미상'}
종류: ${input.genericType || '미상'}
특징: ${input.features.join(', ') || '정보 없음'}
해결하는 문제: ${input.problemSolved || '정보 없음'}
사용 상황: ${input.useCase || '정보 없음'}
외관: ${input.visualDescription || '정보 없음'}

[구성]
- 장면1(훅, 3~5초): "이거 안 써봤으면 손해"류 강렬한 문제 제기. 상품명 직접 언급 금지.
- 장면2~3: 문제 상황 공감 (해결하는 문제를 구체적으로 보여줌)
- 장면4~6: 상품 등장 + 핵심 특징 하나씩 자연스럽게
- 장면7~8: 사용 후 만족감, 실제 사용 상황
- 장면9(마무리): 과장 없는 CTA (예: "궁금하면 찾아봐" 정도, 절대 노골적인 구매 강요 금지)

반드시 이 JSON 형식으로만 출력:
{
  "title": "영상 제목",
  "hook": "장면1의 후킹 문구",
  "scenes": [
    {"id": 1, "duration": 4, "narration": "나레이션 텍스트", "subtitle": "화면 자막(짧게)"}
  ]
}
scenes 배열은 반드시 9개, 전체 나레이션은 반드시 한국어로만 작성 (외국어 절대 금지).`;
}

async function runAffiliateDiscoverAuto(schedule: Schedule): Promise<{ discovered: number; results: string[] }> {
  const admin = createAdminClient();
  const userId = schedule.user_id;

  const idx = schedule.keyword_index % AFFILIATE_DISCOVERY_KEYWORDS.length;
  const keyword = AFFILIATE_DISCOVERY_KEYWORDS[idx];
  await admin.from('bossai_schedules').update({ keyword_index: (idx + 1) % AFFILIATE_DISCOVERY_KEYWORDS.length }).eq('id', schedule.id);

  const accessKey = await getSetting('COUPANG_ACCESS_KEY');
  const secretKey = await getSetting('COUPANG_SECRET_KEY');
  if (!accessKey || !secretKey) throw new Error('쿠팡파트너스 API 키가 설정되지 않았습니다');

  const SOURCE_NAME = '알리익스프레스 (영상 보유 상품)';
  let { data: source } = await admin.from('affiliate_sources').select('id').eq('user_id', userId).eq('name', SOURCE_NAME).maybeSingle();
  if (!source) {
    const { data: created } = await admin.from('affiliate_sources').insert({
      user_id: userId, name: SOURCE_NAME, source_type: 'ecommerce',
      discovery_method: 'API', usage_mode: 'PRODUCT_DISCOVERY',
      connector_status: 'CONNECTED', commercial_use_status: 'ALLOWED', enabled: true, priority: 30,
      notes: '스케줄러 자동 발굴 — RapidAPI Aliexpress DataHub, 키워드 자동 순환.',
    }).select('id').single();
    source = created;
  }
  if (!source) throw new Error('발굴 소스 등록 실패');

  const results: string[] = [];
  const items = await searchAliExpressItems(keyword, 2);

  for (const item of items) {
    const detail = await getAliExpressItemDetail(item.itemId).catch(() => null);
    if (!detail?.videoUrl) { results.push(`[${keyword}] ${item.title}: 영상 없음, 스킵`); continue; }

    const { data: sourceItem } = await admin.from('affiliate_source_items').upsert({
      user_id: userId, source_id: source.id, external_id: item.itemId,
      url: item.itemUrl, title: item.title, thumbnail_url: detail.videoThumbnail || item.image,
      raw_metrics: { sales: item.sales, rating: item.averageStarRate, video_url: detail.videoUrl },
      status: 'PROCESSED',
    }, { onConflict: 'source_id,external_id' }).select('id').single();

    const koKeyword = await toKoreanSearchKeyword(item.title);
    const onSearchError = () => [];
    let candidates = await searchProducts(koKeyword, accessKey, secretKey).catch(onSearchError);
    if (!candidates.length && koKeyword !== item.title) {
      candidates = await searchProducts(item.title, accessKey, secretKey).catch(onSearchError);
    }
    const best = candidates.find(c => c.productImage);
    if (!best) { results.push(`[${keyword}] ${item.title}: 쿠팡 매칭 실패(검색어: ${koKeyword})`); continue; }

    const match = await upsertCoupangMatch(admin, userId, best, accessKey, secretKey);
    if (match.status === 'FAILED' || !match.productId) { results.push(`[${keyword}] ${item.title}: 매칭 실패`); continue; }

    if (sourceItem) {
      await admin.from('affiliate_product_aliases').upsert({
        user_id: userId, product_id: match.productId, source_item_id: sourceItem.id, alias_name: item.title,
      }, { onConflict: 'product_id,source_item_id' });
    }

    if (match.status !== 'CREATED') { results.push(`[${keyword}] ${item.title}: 이미 있던 상품(업데이트만, 재처리 안 함)`); continue; }

    const { data: product } = await admin.from('affiliate_products').select('*').eq('id', match.productId).single();
    if (!product) { results.push(`[${keyword}] ${item.title}: 상품 재조회 실패`); continue; }

    let scriptRow: { id: string; structure: unknown } | null = null;
    try {
      const prompt = buildAffiliateScriptPrompt({
        productName: product.product_name, brand: product.brand, genericType: product.generic_product_type,
        features: product.features || [], problemSolved: product.problem_solved, useCase: product.use_case,
        visualDescription: product.visual_description,
      });
      const aiResult = await callAI({
        messages: [{ role: 'system', content: AFFILIATE_SCRIPT_SYSTEM_PROMPT }, { role: 'user', content: prompt }],
        maxTokens: 4000, temperature: 0.85, useFallback: true,
      });
      const jsonMatch = aiResult.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('JSON 없음');
      const parsed = JSON.parse(jsonMatch[0]) as { title: string; hook: string; scenes: Array<{ id: number; duration: number; narration: string; subtitle: string }> };
      const fullScript = (parsed.scenes || []).map(s => s.narration).join('\n\n');
      const { data: script } = await admin.from('affiliate_scripts').insert({
        user_id: userId, product_id: match.productId, variant_label: 'A_CURIOSITY',
        hook_class: 'PROBLEM', hook_text: parsed.hook, full_script: fullScript,
        structure: { title: parsed.title, scenes: parsed.scenes }, ai_model: aiResult.model, validated: false,
      }).select().single();
      scriptRow = script;
      await admin.from('affiliate_products').update({ status: 'READY', updated_at: new Date().toISOString() }).eq('id', match.productId);
    } catch (e) {
      results.push(`[${keyword}] ${item.title}: 스크립트 생성 실패 — ${(e as Error).message?.slice(0, 100)}`);
      continue;
    }
    if (!scriptRow) { results.push(`[${keyword}] ${item.title}: 스크립트 없음`); continue; }

    const { data: project } = await admin.from('affiliate_video_projects').insert({
      user_id: userId, product_id: match.productId, listing_id: match.listingId || null, status: 'CREATING',
    }).select().single();

    if (project) {
      const structure = scriptRow.structure as { title: string; scenes: Array<{ id: number; duration: number; narration: string; subtitle: string }> };
      const videoUrl = detail.videoUrl;
      const projectId = project.id;
      const productId = match.productId;
      const scriptId = scriptRow.id;
      after(() => renderShortsVideo(
        structure.scenes.map(s => ({ ...s, image_url: null })),
        { title: structure.title, sourceVideoUrl: videoUrl },
      ).then(async (result) => {
        const totalDuration = structure.scenes.reduce((sum, s) => sum + (s.duration || 0), 0);
        const { data: variant } = await admin.from('affiliate_video_variants').insert({
          user_id: userId, project_id: projectId, script_id: scriptId,
          variant_label: 'A_CURIOSITY', duration_sec: totalDuration,
        }).select().single();
        await admin.from('affiliate_renders').insert({
          user_id: userId, variant_id: variant?.id, status: 'completed',
          public_url: result.url, resolution: '1080x1920', duration_sec: totalDuration,
          finished_at: new Date().toISOString(),
        });
        await admin.from('affiliate_video_projects').update({ status: 'READY_TO_PUBLISH', updated_at: new Date().toISOString() }).eq('id', projectId);
        await admin.from('affiliate_products').update({ status: 'IN_PRODUCTION', updated_at: new Date().toISOString() }).eq('id', productId);
      }).catch(async (e) => {
        await admin.from('affiliate_video_projects').update({ status: 'REJECTED', updated_at: new Date().toISOString() }).eq('id', projectId);
        console.error('[affiliate_discover_auto] 렌더링 실패:', e);
      }));
    }

    results.push(`[${keyword}] ${item.title} → ${best.productName}: 발굴+스크립트+렌더 시작`);
  }

  return { discovered: results.length, results };
}

async function executeSchedule(schedule: Schedule) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // 실행 중으로 상태 변경
  await supabase
    .from('bossai_schedules')
    .update({ last_status: 'running' })
    .eq('id', schedule.id);

  // 로그 생성
  const { data: logRow } = await supabase
    .from('bossai_schedule_logs')
    .insert({ schedule_id: schedule.id, user_id: schedule.user_id, started_at: now, status: 'running' })
    .select()
    .single();

  const logId = logRow?.id;

  try {
    // 발행된 쿠팡 상품 ID 조회 (중복 방지) — "최근 10개"만 피하면 11번째 실행부터 같은
    // 상품이 다시 나올 수 있어서(실측 확인), 사실상 전체 이력을 봐서 완전히 재사용을 막는다.
    // 2시간 주기 기준 1년치도 5000개면 넉넉히 커버됨.
    let recentProductIds: string[] = [];
    if (schedule.type === 'coupang_auto') {
      const { data: recentLogs } = await supabase
        .from('bossai_schedule_logs')
        .select('result')
        .eq('schedule_id', schedule.id)
        .eq('status', 'success')
        .order('started_at', { ascending: false })
        .limit(5000);
      recentProductIds = (recentLogs || [])
        .map(l => (l.result as { productId?: string })?.productId)
        .filter(Boolean) as string[];
    }

    let result: Record<string, unknown> = {};
    let summary = '';

    switch (schedule.type) {
      case 'blog_auto': {
        const r = await runBlogAuto(schedule);
        result = r;
        summary = `"${r.keyword}" 블로그 발행 완료`;
        break;
      }
      case 'coupang_auto': {
        const r = await runCoupangAuto(schedule, recentProductIds);
        result = r as unknown as Record<string, unknown>;
        summary = `${r.productName} → ${r.results.join(', ')}`;
        break;
      }
      case 'agoda_auto': {
        const r = await runAgodaAuto(schedule);
        result = r;
        summary = `${r.city} 호텔 블로그 발행 완료: ${r.title}${r.results.length ? ` / ${r.results.join(', ')}` : ''}`;
        break;
      }
      case 'shorts_auto': {
        const r = await runShortsAuto(schedule);
        result = r;
        summary = `"${r.topic}" 숏폼 스크립트 생성${r.saved ? ' + 블로그 발행' : ''}`;
        break;
      }
      case 'instagram_auto': {
        const r = await runInstagramAuto(schedule);
        result = r as unknown as Record<string, unknown>;
        summary = `"${r.topic}" 인스타 ${r.published ? '발행 완료' : '캡션 생성(미발행)'}`;
        break;
      }
      case 'naver_tech_auto': {
        const r = await runNaverTechAuto(schedule.user_id);
        result = r as unknown as Record<string, unknown>;
        summary = r.summary;
        break;
      }
      case 'affiliate_publish_auto': {
        const r = await runAffiliatePublishAuto(schedule.user_id);
        result = r as unknown as Record<string, unknown>;
        summary = `${r.published}건 발행 — ${r.results.join(' / ')}`.slice(0, 500);
        break;
      }
      case 'affiliate_discover_auto': {
        const r = await runAffiliateDiscoverAuto(schedule);
        result = r as unknown as Record<string, unknown>;
        summary = `${r.discovered}건 처리 — ${r.results.join(' / ')}`.slice(0, 500);
        break;
      }
    }

    const nextRunAt = computeNextRunAt(schedule.interval_hours, schedule.run_at_hour, now);

    await supabase.from('bossai_schedules').update({
      last_run_at: now,
      next_run_at: nextRunAt.toISOString(),
      last_status: 'success',
    }).eq('id', schedule.id);

    if (logId) {
      await supabase.from('bossai_schedule_logs').update({
        finished_at: new Date().toISOString(),
        status: 'success',
        summary,
        result,
      }).eq('id', logId);
    }

    return { success: true, summary };
  } catch (err: unknown) {
    const errorMsg = (err instanceof Error ? err.message : String(err)).slice(0, 500);

    const nextRunAt = computeNextRunAt(schedule.interval_hours, schedule.run_at_hour, now);
    await supabase.from('bossai_schedules').update({
      last_run_at: now,
      next_run_at: nextRunAt.toISOString(),
      last_status: 'failed',
    }).eq('id', schedule.id);

    if (logId) {
      await supabase.from('bossai_schedule_logs').update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error: errorMsg,
      }).eq('id', logId);
    }

    return { success: false, error: errorMsg };
  }
}

export async function POST(req: NextRequest) {
  const isInternal = isInternalRequest(req);

  let userId: string | null = null;

  if (!isInternal) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
    userId = user.id;
  }

  // 실행할 스케줄 아이디 (수동 실행 시)
  const body = await req.json().catch(() => ({})) as { schedule_id?: string };
  const scheduleId = body.schedule_id;

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('bossai_schedules')
    .select('*')
    .eq('is_active', true);

  if (scheduleId) {
    query = query.eq('id', scheduleId);
  } else if (userId) {
    // 대시보드 수동 실행: 해당 유저 모든 스케줄
    query = query.eq('user_id', userId);
  } else {
    // NAS cron: 실행 시간이 된 것만
    query = query.lte('next_run_at', now);
  }

  const { data: allSchedules, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // last_status='running' 중이면 원래는 건너뛰는데, 실행 도중 프로세스가 죽어서
  // (배포 재시작 등) success/failed로 못 바뀌면 영원히 running으로 박제되어 다시는
  // 안 돌아가는 문제가 실사용 중 확인됨(쿠팡/아고다 스케줄이 며칠째 멈춰있었음).
  // 30분 넘게 running이면 죽은 것으로 보고 다시 시도
  const STALE_RUNNING_MS = 30 * 60 * 1000;
  const eligible = (allSchedules || []).filter((s) => {
    if (s.last_status !== 'running') return true;
    const runningSince = s.last_run_at ? new Date(s.last_run_at).getTime() : 0;
    return Date.now() - runningSince > STALE_RUNNING_MS;
  });

  // 이 GET~UPDATE 사이에 동시에 들어온 다른 호출(NAS 크론 + GitHub Actions 크론이
  // 겹치는 등)이 같은 스케줄을 같이 집어가서 똑같은 글이 초 단위로 두 번 발행되는
  // 사고가 실제로 확인됨(2days.kr "실손보험 비교" 글 6초 간격 중복). 실행 전에
  // "내가 먼저 running으로 바꿀 수 있었는지"를 원자적 UPDATE로 확인해서 선점 —
  // 못 바꾼(이미 다른 요청이 방금 가져간) 스케줄은 이번 회차에서 제외한다.
  // last_status.is.null 분기 필수 — SQL에서 NULL <> 'running'은 NULL(거짓 취급)이라
  // 한 번도 실행 안 된 새 스케줄(last_status가 NULL)은 neq만으로는 영원히 선점 불가
  // (affiliate_publish_auto 첫 등록 때 실제로 이 버그로 "실행할 스케줄 없음"만 나옴).
  const staleCutoffIso = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  const claimed: typeof eligible = [];
  for (const s of eligible) {
    const { data: claim } = await supabase
      .from('bossai_schedules')
      .update({ last_status: 'running', last_run_at: now })
      .eq('id', s.id)
      .or(`last_status.is.null,last_status.neq.running,last_run_at.lt.${staleCutoffIso}`)
      .select('id');
    if (claim?.length) claimed.push(s);
  }
  const schedules = claimed;

  if (!schedules.length) return NextResponse.json({ ran: 0, message: '실행할 스케줄 없음' });

  const results = await Promise.allSettled(
    schedules.map(s => executeSchedule(s as Schedule))
  );

  const summary = results.map((r, i) => ({
    id: schedules[i].id,
    name: schedules[i].name,
    ...(r.status === 'fulfilled' ? r.value : { success: false, error: String(r.reason) }),
  }));

  return NextResponse.json({ ran: schedules.length, results: summary });
}
