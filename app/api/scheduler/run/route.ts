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
import { findFfmpeg, findKoreanFont, escapeDrawtext } from '@/lib/shorts/nas-ffmpeg';
import { nasExec, nasExecWithStdin } from '@/lib/nas-ssh';
import type { Schedule } from '@/lib/scheduler';

export const maxDuration = 300;

// affiliate_video_projects가 READY_TO_PUBLISH(QA 게이트 통과)까지는 가는데 발행이
// 이어지지 않던 지점을 연결 — 인스타그램 릴스로 자동 발행(사용자 확정: @2dayskr 계정).
// 별도 파일(lib/scheduler/affiliate-publish-runner.ts)로 뺐다가 Turbopack 프로덕션
// 빌드에서 이 라우트가 아닌 엉뚱한 라우트(coupang/auto-post)의 청크에 코드가 묶여버려
// 런타임에 실행 자체가 안 되는 버그를 실측 확인 — 이 라우트 파일에 직접 인라인해서 회피.
const AFFILIATE_IG_PLATFORM_USER_ID = '34489947500650071'; // @2dayskr
const AFFILIATE_THREADS_PLATFORM_USER_ID = '25873039292318366'; // @2days.kr (표시명 "투데이s" — 사용자가 스크린샷으로 재확인한 실제 계정, @2dayskr 아님)
const AFFILIATE_YOUTUBE_CHANNEL_ID = 'UCOThNyCRe20_Qz1m65NYzfA'; // 현가젯 — 쿠팡 발행용 채널
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

async function refreshYoutubeToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('YouTube 토큰 갱신 실패: ' + (data.error_description || data.error));
  return data.access_token;
}

// app/api/youtube/upload/route.ts와 동일한 resumable upload 로직을 인라인 —
// 별도 파일로 빼면 위에서 실측한 Turbopack 청크 버그를 다시 겪을 위험이 있어
// 이 라우트 안에 그대로 둔다. 유튜브 쇼핑 제품태그는 파트너 심사가 별도로
// 필요해서(사용자 확인) 설명란에 쿠팡 링크를 텍스트로만 넣는다.
async function uploadToYoutube(params: {
  userId: string; videoUrl: string; title: string; description: string; channelId: string;
}): Promise<{ videoId: string; url: string }> {
  const supabase = createAdminClient();
  const { data: conn } = await supabase
    .from('sns_connections')
    .select('access_token, refresh_token, extra')
    .eq('user_id', params.userId)
    .eq('platform', 'youtube')
    .eq('platform_user_id', params.channelId)
    .eq('is_active', true)
    .single();
  if (!conn) throw new Error(`YouTube 채널(${params.channelId}) 연결 없음 — 허브에서 재연결 필요`);

  let accessToken = conn.access_token;
  const expiresAt = conn.extra?.expires_at ? new Date(conn.extra.expires_at) : null;
  if (!expiresAt || expiresAt <= new Date()) {
    if (!conn.refresh_token) throw new Error('YouTube 토큰 만료 + refresh_token 없음 — 재연결 필요');
    accessToken = await refreshYoutubeToken(conn.refresh_token);
    await supabase.from('sns_connections').update({
      access_token: accessToken,
      extra: { expires_at: new Date(Date.now() + 3600 * 1000).toISOString() },
    }).eq('user_id', params.userId).eq('platform', 'youtube').eq('platform_user_id', params.channelId);
  }

  const videoRes = await fetch(params.videoUrl);
  if (!videoRes.ok) throw new Error('영상 다운로드 실패: ' + videoRes.status);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(videoBuffer.byteLength),
      },
      body: JSON.stringify({
        snippet: {
          title: params.title.slice(0, 100),
          description: params.description.slice(0, 5000),
          tags: ['쿠팡', '쿠팡추천', '생활꿀템', 'shorts'],
          categoryId: '22',
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      }),
    }
  );
  if (!initRes.ok) throw new Error('YouTube 업로드 시작 실패: ' + (await initRes.text()).slice(0, 200));
  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('YouTube upload URL 없음');

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(videoBuffer.byteLength) },
    body: videoBuffer,
  });
  if (!uploadRes.ok) throw new Error('YouTube 업로드 실패: ' + (await uploadRes.text()).slice(0, 200));
  const videoData = await uploadRes.json();
  return { videoId: videoData.id, url: `https://www.youtube.com/shorts/${videoData.id}` };
}

async function runAffiliatePublishAuto(userId: string): Promise<{ published: number; results: string[] }> {
  const supabase = createAdminClient();

  const { data: projects } = await supabase
    .from('affiliate_video_projects')
    .select('id, product_id')
    .eq('user_id', userId)
    .eq('status', 'READY_TO_PUBLISH');

  if (!projects?.length) return { published: 0, results: ['발행 대기 중인 영상 없음'] };

  const { data: igConn } = await supabase
    .from('sns_connections')
    .select('access_token, platform_user_id')
    .eq('user_id', userId)
    .eq('platform', 'instagram')
    .eq('platform_user_id', AFFILIATE_IG_PLATFORM_USER_ID)
    .eq('is_active', true)
    .single();

  const { data: threadsConn } = await supabase
    .from('sns_connections')
    .select('access_token, platform_user_id')
    .eq('user_id', userId)
    .eq('platform', 'threads')
    .eq('platform_user_id', AFFILIATE_THREADS_PLATFORM_USER_ID)
    .eq('is_active', true)
    .single();

  const results: string[] = [];
  let published = 0;

  // 발행 기록(publication_jobs/publications) 남기고 프로젝트 상태를 갱신 —
  // 인스타/유튜브 각각 독립적으로 시도해서 한쪽이 실패/한도초과여도 다른 쪽은
  // 그대로 올라가게 함(오늘 인스타 하루 게시 한도로 실제로 막힌 적 있음).
  async function recordPublication(renderId: string, platform: string, postId: string) {
    const { data: job } = await supabase
      .from('affiliate_publication_jobs')
      .insert({ user_id: userId, render_id: renderId, platform, status: 'completed' })
      .select('id')
      .single();
    if (job) {
      await supabase.from('affiliate_publications').insert({
        user_id: userId, publication_job_id: job.id, platform,
        platform_post_id: postId, disclosure_template: AFFILIATE_DISCLOSURE,
      });
    }
  }

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
      const label = product?.product_name || project.id;
      let anySuccess = false;

      if (igConn) {
        try {
          const pub = await postToPlatformWithMedia('instagram', igConn.access_token, igConn.platform_user_id, caption, [render.public_url]);
          await recordPublication(render.id, 'instagram', pub.id);
          anySuccess = true;
          results.push(`${label}: 인스타 발행 완료 (ig:${pub.id})`);
        } catch (e) {
          results.push(`${label}: 인스타 실패 — ${(e as Error).message?.slice(0, 150)}`);
        }
      } else {
        results.push(`${label}: 인스타 연결 없음, 스킵`);
      }

      if (threadsConn) {
        try {
          const pub = await postToPlatformWithMedia('threads', threadsConn.access_token, threadsConn.platform_user_id, caption, [render.public_url]);
          await recordPublication(render.id, 'threads', pub.id);
          anySuccess = true;
          results.push(`${label}: 스레드 발행 완료 (${pub.id})`);
        } catch (e) {
          results.push(`${label}: 스레드 실패 — ${(e as Error).message?.slice(0, 150)}`);
        }
      } else {
        results.push(`${label}: 스레드 연결 없음, 스킵`);
      }

      try {
        const yt = await uploadToYoutube({
          userId,
          videoUrl: render.public_url,
          title: (script?.hook_text || product?.product_name || '오늘의 추천템').slice(0, 100),
          description: caption,
          channelId: AFFILIATE_YOUTUBE_CHANNEL_ID,
        });
        await recordPublication(render.id, 'youtube', yt.videoId);
        anySuccess = true;
        results.push(`${label}: 유튜브 발행 완료 (${yt.url})`);
      } catch (e) {
        results.push(`${label}: 유튜브 실패 — ${(e as Error).message?.slice(0, 150)}`);
      }

      if (anySuccess) {
        await supabase.from('affiliate_video_projects').update({ status: 'PUBLISHED', updated_at: new Date().toISOString() }).eq('id', project.id);
        published++;
      }
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
// 후보당 1회) 하루 호출량은 못 늘림(사용자 확정 — 유료 전환 안 함) — 대신 키워드
// 풀 자체를 넓혀서 몇 주에 걸쳐 커버하는 카테고리를 늘린다. "생활용품" 같은
// 범용 단어 대신 "신박함/데모 가능"한 니치 가젯 위주로 골라야 (1) 알리 쪽에 실제
// 홍보영상이 붙어있을 확률이 높고 (2) 쿠팡 베스트셀러처럼 이미 레드오션인
// 범용 생필품과 안 겹쳐서 매칭도 잘 되고 콘텐츠로도 더 흥미로움(사용자 피드백).
const AFFILIATE_DISCOVERY_KEYWORDS = [
  // 차량용 신박한 아이템
  'car gadget accessory', 'car phone holder magnetic', 'car organizer gadget',
  'car vacuum cleaner mini', 'car air freshener gadget', 'car charger multifunction',
  // 휴대폰/전자기기 액세서리
  'phone gadget accessory', 'phone camera lens clip', 'wireless charger stand gadget',
  'cable organizer gadget', 'phone cooling fan gadget', 'selfie gadget tool',
  // 주방 신박 도구
  'kitchen gadget tool multifunction', 'vegetable cutter gadget', 'kitchen storage gadget',
  'coffee gadget tool', 'food sealer gadget',
  // 청소/생활 신박 도구
  'cleaning gadget tool', 'multifunctional cleaning brush', 'window cleaning gadget',
  'shoe cleaning gadget',
  // 캠핑/아웃도어
  'camping gadget tool', 'outdoor multifunction tool', 'portable camping light gadget',
  // 홈/데스크 정리 가젯
  'desk organizer gadget', 'cable management gadget', 'led light strip smart',
  // 반려동물 신박 아이템
  'pet gadget tool', 'pet grooming gadget', 'pet feeder gadget',
  // 헬스/피트니스 가젯
  'fitness gadget tool', 'massage gadget tool', 'posture corrector gadget',
  // 육아 신박 아이템
  'baby gadget tool', 'baby feeding gadget',
  // 신박 아이디어 상품 (범용 최후순위)
  'creative gadget idea', 'as seen on tv gadget', 'life hack tool gadget',
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

// 바이럴 영상 재업로드 자동화 — X(트위터) 계정(momentoviral 등)에서 이미 수집해둔
// 영상(bossai_x_videos, x-notion-api 스크레이퍼가 채움)을 랜덤하게 골라 유튜브
// 쇼츠로 올린다. 별도 채널(2days_movie)에만 올려서 쿠팡 수익화 채널(현가젯)이
// 저작권 문제로 스트라이크/정지되는 걸 방지(사용자 확정). posted_at으로 중복 방지.
const VIRAL_YOUTUBE_CHANNEL_ID = 'UC1xCt7o1CXWe4EVVdWYxkxQ'; // @2days_movie (채널명 "투데이즈케이알")
const VIRAL_VIDEO_DISCLOSURE = '원본 출처가 있는 영상입니다. 저작권 문제 시 연락 주시면 즉시 조치하겠습니다.';

async function pickRandom<T>(arr: T[], n: number): Promise<T[]> {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// x-notion-api 스크레이퍼는 video_url을 컨테이너 내부 상대경로(/downloads/유저명/파일)로
// 저장함(app/api/x-videos/migrate-to-nas가 이미 처리하는 것과 동일 문제) — 업로드하려면
// 실제로 다운로드 가능한 공개 URL이어야 해서, NAS 웹루트(xmedia)로 파일을 복사하고
// video_url을 공개 URL로 갱신한 뒤 그 값을 반환한다(이미 변환된 건 그대로 통과).
async function ensurePublicVideoUrl(supabase: ReturnType<typeof createAdminClient>, video: { id: string; username: string; video_url: string }): Promise<string> {
  if (!video.video_url.startsWith('/downloads/')) return video.video_url;

  const rel = video.video_url.replace(/^\/downloads\//, '');
  const slashIdx = rel.indexOf('/');
  if (slashIdx < 0) throw new Error('video_url 경로 형식 이상: ' + video.video_url);
  const username = rel.slice(0, slashIdx);
  const filename = rel.slice(slashIdx + 1);
  const NAS_DIR = '/volume1/web/xmedia';
  const DOWNLOADS_DIR = '/volume1/docker/x-notion/downloads';

  await nasExec(`mkdir -p "${NAS_DIR}/${username}" && cp -n "${DOWNLOADS_DIR}/${username}/${filename}" "${NAS_DIR}/${username}/${filename}"`, 60_000);

  const publicUrl = `https://hy64.synology.me/xmedia/${username}/${encodeURIComponent(filename)}`;
  await supabase.from('bossai_x_videos').update({ video_url: publicUrl }).eq('id', video.id);
  return publicUrl;
}

// 원본을 그냥 재업로드하지 말고 편집해서 올리자는 요청(사용자 확정) — 검정
// 배경 레터박스 + 위쪽 2줄 후킹 문구(흰색+노란 강조) + 아래쪽 반응 자막, 요즘
// 커뮤니티 이슈요약 숏폼에서 흔한 스타일. 세로 꽉 채우는 크롭이 아니라
// force_original_aspect_ratio=decrease+pad로 원본 비율은 그대로 두고 위아래
// 검정으로 채운다 — 그래야 저 스타일의 "검정 바탕" 느낌이 남.
async function editViralVideoForShorts(params: {
  sourceUrl: string; lineTop1: string; lineTop2: string; caption: string;
}): Promise<string> {
  const ffmpeg = await findFfmpeg();
  // findKoreanFont()는 다른 파이프라인(상품영상)도 같이 쓰는 공용 검색이라 새로
  // 설치한 볼드 폰트 때문에 그쪽 결과가 흔들리면 안 됨 — 이 용도로만 직접 경로 지정.
  // (요청사항: "글자도 좀 크고 볼드처리하는게 핵심" — 일반체는 두꺼워 보이지 않아서
  // Nanum Gothic Bold를 별도로 받아 설치함)
  // ponytail: 경로 하드코딩 + 존재 확인 없음 — NAS에 직접 설치해둔 폰트라 자체적으로
  // 사라질 일은 없지만, 없어지면 이 파이프라인만 실패(다른 파이프라인은 무관).
  const BOLD_FONT_PATH = '/volume1/homes/urjent/bin/fonts/NanumGothicBold.ttf';
  const jobId = `viral_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const dir = `/tmp/${jobId}`;

  const top1 = escapeDrawtext(params.lineTop1);
  const top2 = escapeDrawtext(params.lineTop2);
  const bottom = escapeDrawtext(params.caption);
  const fontArg = `fontfile='${BOLD_FONT_PATH}':`;

  // 요청사항: 영상은 더 작게 가운데로, 검정 배경이 확실히 더 넓게 보이게, 글자는
  // 크고 굵게. 900x1250 박스 안으로만 축소(비율 유지)한 뒤 1080x1920 검정
  // 캔버스 가운데에 배치 — 위/아래뿐 아니라 좌우에도 검정 여백이 생김.
  // borderw(외곽선)까지 더해 폰트 자체보다 훨씬 굵고 도드라져 보이게 함.
  const vf = [
    'scale=900:1250:force_original_aspect_ratio=decrease',
    'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
    `drawtext=${fontArg}text='${top1}':fontsize=70:fontcolor=white:borderw=6:bordercolor=black:x=(w-text_w)/2:y=h*0.05`,
    `drawtext=${fontArg}text='${top2}':fontsize=92:fontcolor=yellow:borderw=8:bordercolor=black:x=(w-text_w)/2:y=h*0.13`,
    `drawtext=${fontArg}text='${bottom}':fontsize=66:fontcolor=white:borderw=7:bordercolor=black:x=(w-text_w)/2:y=h*0.90`,
  ].join(',');

  const outFile = `${jobId}.mp4`;
  const script = [
    '#!/bin/bash', 'set -e',
    `mkdir -p "${dir}"`,
    `curl -sL --max-time 60 "${params.sourceUrl}" -o "${dir}/source.mp4"`,
    `${ffmpeg} -hide_banner -loglevel error -i "${dir}/source.mp4" -vf "${vf}" ` +
      `-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart -y "${dir}/${outFile}"`,
    `mkdir -p /volume1/web/xmedia/_edited`,
    `cp "${dir}/${outFile}" "/volume1/web/xmedia/_edited/${outFile}"`,
    `rm -rf "${dir}"`,
    'echo EDIT_DONE',
  ].join('\n');

  await nasExecWithStdin(`cat > /tmp/${jobId}.sh`, script);
  // 큰 원본(20MB대)은 -preset fast 인코딩도 2분을 넘기는 게 실측 확인돼 넉넉히 잡음
  const result = await nasExec(`bash /tmp/${jobId}.sh; rm -f /tmp/${jobId}.sh`, 240_000);
  if (!result.stdout.includes('EDIT_DONE')) throw new Error('영상 편집 실패: ' + (result.stderr || result.stdout).slice(0, 300));

  return `https://hy64.synology.me/xmedia/_edited/${outFile}`;
}

async function runViralVideoYoutubeAuto(schedule: Schedule): Promise<{ uploaded: number; results: string[] }> {
  const supabase = createAdminClient();
  const config = (schedule.config as { usernames?: string[] }) || {};
  const usernames = config.usernames?.length ? config.usernames : ['momentoviral'];

  // 쿠팡 발행에 쓰던 것과 같은 스레드 계정(@2dayskr)에도 같이 올림(사용자 확정).
  const { data: threadsConn } = await supabase
    .from('sns_connections')
    .select('access_token, platform_user_id')
    .eq('user_id', schedule.user_id)
    .eq('platform', 'threads')
    .eq('platform_user_id', AFFILIATE_THREADS_PLATFORM_USER_ID)
    .eq('is_active', true)
    .single();

  // 배경에서 새 영상 계속 수집(현재 실행을 기다리게 하지 않음) — 다음 회차 재고 보충용
  for (const username of usernames) {
    fetch('http://aboda.kr:5053/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'xc-aboda-2026' },
      body: JSON.stringify({ username, count: 30, force: false }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { /* 재고 보충 실패는 이번 회차와 무관, 무시 */ });
  }

  const { data: candidates } = await supabase
    .from('bossai_x_videos')
    .select('id, username, tweet_id, tweet_text, tweet_url, video_url')
    .in('username', usernames)
    .is('posted_at', null)
    .order('collected_at', { ascending: false })
    .limit(50);

  if (!candidates?.length) return { uploaded: 0, results: ['업로드할 새 영상 없음 (재고 소진 — 다음 회차에 자동 보충됨)'] };

  const picked = await pickRandom(candidates, 2);
  const results: string[] = [];
  let uploaded = 0;

  for (const video of picked) {
    try {
      const publicVideoUrl = await ensurePublicVideoUrl(supabase, video);

      // 자막 3줄(윗줄1/윗줄2/아랫말) + 유튜브 제목/설명을 한 번의 AI 호출로 생성
      // AI 번역 실패 시에도 원문(외국어일 수 있음)이 자막/제목에 그대로 노출되면 안 됨 —
      // 전부 안전한 한국어 기본 문구로 폴백(실제로 AI 호출 전체가 실패해서 이 기본값이
      // 그대로 나간 사고가 있었음).
      let top1 = '요즘 화제라는', top2 = '이 영상', caption = '완전 신기하지 않아?';
      let koTitle = '오늘의 화제 영상';
      let koDesc = video.tweet_text || '';
      try {
        const translated = await callAISimple(
          `다음은 영상에 달린 원문 캡션이다(외국어일 수 있음). 이 영상을 한국 쇼츠 채널에 소개하려고 한다.\n` +
          `요즘 인스타/유튜브 쇼츠에서 유행하는 "커뮤니티 짤 요약"체로 써야 한다 — 실제 사람이 재밌어서\n` +
          `공유하듯이 유쾌하고 친근한 말투로. 딱딱한 설명체 절대 금지, 존댓말도 금지(반말/구어체).\n` +
          `ㅋㅋㅋ, ㄷㄷ, !, ? 같은 감탄 표현을 자연스럽게 섞어도 좋음.\n` +
          `반드시 이 형식으로만 출력(각 줄 그대로, 예시 문구 그대로 베끼지 말고 이 영상 내용에 맞게):\n` +
          `윗줄1: (영상 상황을 궁금증 유발하듯 짧게, 12자 내외. 예: "산책하던 강아지가", "이 남자가 한 짓")\n` +
          `윗줄2: (핵심 포인트/감탄 키워드, 6~10자, 임팩트 있게. 예: "실화냐;;", "충격 결말", "완전 반전")\n` +
          `아랫말: (보고 난 반응을 사람처럼 한 줄로, 12자 내외. 예: "이거 실화임?ㅋㅋㅋ", "진짜 대박이다", "나만 소름?")\n` +
          `제목: (유튜브 쇼츠 제목 1줄, 25자 이내, 클릭하고 싶게)\n` +
          `설명: (유튜브 설명란 2~3문장, 친근한 반말체)\n\n` +
          `원문: ${video.tweet_text || '(텍스트 없음)'}`,
        );
        const m = (re: RegExp) => translated.match(re)?.[1]?.trim();
        top1 = m(/윗줄1:\s*(.+)/) || top1;
        top2 = m(/윗줄2:\s*(.+)/) || top2;
        caption = m(/아랫말:\s*(.+)/) || caption;
        koTitle = (m(/제목:\s*(.+)/) || koTitle).slice(0, 80);
        koDesc = m(/설명:\s*([\s\S]+?)(?=\n\S+:|$)/) || koDesc;
      } catch (e) {
        console.error('[viral_video_youtube_auto] 자막/제목 생성 실패, 기본 문구로 폴백:', e);
      }

      const editedVideoUrl = await editViralVideoForShorts({ sourceUrl: publicVideoUrl, lineTop1: top1, lineTop2: top2, caption });

      const description = [koDesc, '', `원본: ${video.tweet_url}`, VIRAL_VIDEO_DISCLOSURE].filter(Boolean).join('\n');

      const yt = await uploadToYoutube({
        userId: schedule.user_id,
        videoUrl: editedVideoUrl,
        title: koTitle,
        description,
        channelId: VIRAL_YOUTUBE_CHANNEL_ID,
      });

      const postedPlatforms = ['youtube_2days_movie'];
      let threadsNote = '';
      if (threadsConn) {
        try {
          const threadsCaption = [koTitle, '', koDesc].filter(Boolean).join('\n');
          const pub = await postToPlatformWithMedia('threads', threadsConn.access_token, threadsConn.platform_user_id, threadsCaption, [editedVideoUrl]);
          postedPlatforms.push('threads_2dayskr');
          threadsNote = ` / 스레드 발행 완료 (${pub.id})`;
        } catch (e) {
          threadsNote = ` / 스레드 실패 — ${(e as Error).message?.slice(0, 100)}`;
        }
      }

      await supabase.from('bossai_x_videos').update({
        posted_at: new Date().toISOString(),
        posted_platforms: postedPlatforms,
      }).eq('id', video.id);

      uploaded++;
      results.push(`@${video.username} ${video.tweet_id}: 업로드 완료 (${yt.url})${threadsNote}`);
    } catch (e) {
      results.push(`@${video.username} ${video.tweet_id}: 실패 — ${(e as Error).message?.slice(0, 150)}`);
    }
  }

  return { uploaded, results };
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
      case 'viral_video_youtube_auto': {
        const r = await runViralVideoYoutubeAuto(schedule);
        result = r as unknown as Record<string, unknown>;
        summary = `${r.uploaded}건 업로드 — ${r.results.join(' / ')}`.slice(0, 500);
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
