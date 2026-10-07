/**
 * POST /api/scheduler/run
 *
 * NAS cron 설정 (1분마다 실행):
 *   * * * * * curl -s -X POST https://loov.co.kr/api/scheduler/run \
 *     -H "x-internal-key: YOUR_TELEGRAM_WEBHOOK_SECRET" 2>/dev/null
 *
 * 또는 대시보드에서 수동 실행 (로그인 세션 사용)
 */

import { SNS_HOOK_GUIDE } from '@/lib/sns/hook-style';
import { alertOwner, isAuthError } from '@/lib/owner-alert';
import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-server';
import { isInternalRequest } from '@/lib/internal-auth';
import { computeNextRunAt } from '@/lib/scheduler';

// interval_hours는 정수 컬럼이라 40분 같은 주기는 config.interval_minutes로 지정
function intervalHoursOf(s: { interval_hours: number; config?: unknown }): number {
  const m = Number((s.config as { interval_minutes?: number } | null)?.interval_minutes);
  return m > 0 ? m / 60 : s.interval_hours;
}
import { runBlogAuto, SLOT_WAIT_ERROR } from '@/lib/scheduler/blog-runner';
import { runCoupangAuto } from '@/lib/scheduler/coupang-runner';
import { runAgodaAuto } from '@/lib/scheduler/agoda-runner';
import { runShortsAuto } from '@/lib/scheduler/shorts-runner';
import { runInstagramAuto } from '@/lib/scheduler/instagram-runner';
import { runNaverTechAuto } from '@/lib/scheduler/naver-tech-runner';
import { runKeywordAuto } from '@/lib/scheduler/keyword-auto-runner';
import { runTossAuto } from '@/lib/scheduler/toss-runner';
import { createGoLink, pickContentAngle } from '@/lib/affiliate-tracking';
import { fetchDemandKeywords, matchesDemand } from '@/lib/affiliate-demand-signal';
import { recordPriceSnapshot, getPriceDropNote } from '@/lib/affiliate-price-history';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import { searchAliExpressItems, getAliExpressItemDetail } from '@/lib/affiliate-engine/aliexpress-datahub';
import { upsertCoupangMatch } from '@/lib/affiliate-engine/coupang-match';
import { searchProducts } from '@/lib/coupang/api';
import { getSetting } from '@/lib/get-setting';
import { callAI, callAISimple, getGeminiKeys } from '@/lib/ai-call';
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
const VIRAL_THREADS_PLATFORM_USER_ID = '25203934249239577'; // @2dayskr — 바이럴 영상 전용(사용자 확정 2026-10-03)
const AFFILIATE_THREADS_PLATFORM_USER_ID = '25873039292318366'; // @2days.kr (표시명 "투데이s" — 사용자가 스크린샷으로 재확인한 실제 계정, @2dayskr 아님)
const AFFILIATE_YOUTUBE_CHANNEL_ID = 'UCOThNyCRe20_Qz1m65NYzfA'; // 현가젯 — 쿠팡 발행용 채널
const AFFILIATE_DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

// 인스타/스레드는 본문에 외부링크가 있으면 도달률이 깎이는 게 실사용 중 확인돼(사용자
// 확정) 링크를 댓글로 분리 — 본문엔 명확한 행동유도 문구만 남김. 유튜브는 설명란 링크에
// 그런 페널티가 없어 그대로 둠(buildAffiliateYoutubeDescription).
// CTA만 있고 감정이입 문구가 없으면 "밋밋하다"는 사용자 피드백 — 실사용 후기 톤의
// 한 줄을 훅과 CTA 사이에 넣어 전환 유도력을 높임.
function buildAffiliateCaption(hook: string | undefined, productName: string | undefined): string {
  return [
    hook || '이거 하나 바꿨더니 매일 쓰는 시간이 달라짐',
    '',
    productName ? `▶ ${productName}` : '',
    '가격이랑 실제 후기는 댓글 링크에 정리해뒀어요 👇',
    '',
    '#쿠팡 #쿠팡추천 #생활꿀템 #가성비템 #추천템',
  ].filter(Boolean).join('\n');
}

function buildAffiliateLinkComment(affiliateUrl: string | undefined): string {
  return [
    affiliateUrl ? `짜잔, 여기 있어요 👇\n${affiliateUrl}` : '',
    '',
    AFFILIATE_DISCLOSURE,
  ].filter(Boolean).join('\n');
}

function buildAffiliateYoutubeDescription(hook: string | undefined, productName: string | undefined, affiliateUrl: string | undefined): string {
  return [
    hook || (productName ? `요즘 이거 없인 못 살아요 👀 ${productName}` : '이건 진짜 안 보면 후회하는 템'),
    '',
    productName ? `▶ ${productName}` : '',
    '직접 써보고 진심으로 추천하는 거라 자신 있게 올려요.',
    affiliateUrl ? `👉 구매 링크: ${affiliateUrl}` : '',
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

      const caption = buildAffiliateCaption(script?.hook_text, product?.product_name);
      const linkComment = buildAffiliateLinkComment(listing?.affiliate_url);
      const label = product?.product_name || project.id;
      let anySuccess = false;

      if (igConn) {
        try {
          const pub = await postToPlatformWithMedia('instagram', igConn.access_token, igConn.platform_user_id, caption, [render.public_url]);
          await recordPublication(render.id, 'instagram', pub.id);
          anySuccess = true;
          let note = '';
          try { await postCommentOnOwnPost('instagram', igConn.access_token, igConn.platform_user_id, pub.id, linkComment); }
          catch (e) { note = ` / 링크 댓글 실패 — ${(e as Error).message?.slice(0, 80)}`; }
          results.push(`${label}: 인스타 발행 완료 (ig:${pub.id})${note}`);
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
          let note = '';
          try { await postCommentOnOwnPost('threads', threadsConn.access_token, threadsConn.platform_user_id, pub.id, linkComment); }
          catch (e) { note = ` / 링크 댓글 실패 — ${(e as Error).message?.slice(0, 80)}`; }
          results.push(`${label}: 스레드 발행 완료 (${pub.id})${note}`);
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
          description: buildAffiliateYoutubeDescription(script?.hook_text, product?.product_name, listing?.affiliate_url),
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

// 쇼츠 편집(2026-10-03 사용자 확정 디자인): 흰 배경 + 상단 채널명 + 굵은 2단 제목(흰 글씨/노란 강조,
// 두꺼운 검정 외곽선) + 가운데 영상 + 하단 검정 굵은 자막 2줄 — 인기 이슈요약 쇼츠 스타일.
const fitFont = (text: string, max: number, width = 1000) => {
  const units = [...text].reduce((n, ch) => n + (/[ㄱ-힝]/.test(ch) ? 1 : 0.6), 0) || 1;
  return Math.max(40, Math.min(max, Math.floor(width / units)));
};

async function editViralVideoForShorts(params: {
  sourceUrl: string; lineTop1: string; lineTop2: string; sub1: string; sub2: string;
}): Promise<string> {
  const ffmpeg = await findFfmpeg();
  // ponytail: NAS에 직접 설치한 볼드 폰트 경로 하드코딩 — 없어지면 이 파이프라인만 실패
  const BOLD_FONT_PATH = '/volume1/homes/urjent/bin/fonts/NanumGothicBold.ttf';
  const jobId = `viral_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const dir = `/tmp/${jobId}`;
  const f = `fontfile='${BOLD_FONT_PATH}':`;
  const t = (s: string) => escapeDrawtext(s);
  const title = (text: string, color: string, y: number) =>
    `drawtext=${f}text='${t(text)}':fontsize=${fitFont(text, 110)}:fontcolor=${color}:borderw=12:bordercolor=black:shadowcolor=black@0.45:shadowx=5:shadowy=6:x=(w-text_w)/2:y=${y}`;
  const sub = (text: string, y: number) =>
    `drawtext=${f}text='${t(text)}':fontsize=${fitFont(text, 70)}:fontcolor=black:borderw=1:bordercolor=black:x=(w-text_w)/2:y=${y}`;

  const VIDEO_TOP = 520, VIDEO_H = 1000;
  const vf = [
    `scale=1080:${VIDEO_H}:force_original_aspect_ratio=decrease`,
    `pad=1080:1920:(ow-iw)/2:${VIDEO_TOP}+(${VIDEO_H}-ih)/2:white`,
    `drawtext=${f}text='투데이즈 영상':fontsize=46:fontcolor=black:x=60:y=80`,
    title(params.lineTop1, 'white', 210),
    title(params.lineTop2, 'yellow', 350),
    params.sub1 ? sub(params.sub1, 1560) : '',
    params.sub2 ? sub(params.sub2, 1660) : '',
  ].filter(Boolean).join(',');

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
  const result = await nasExec(`bash /tmp/${jobId}.sh; rm -f /tmp/${jobId}.sh`, 240_000);
  if (!result.stdout.includes('EDIT_DONE')) throw new Error('영상 편집 실패: ' + (result.stderr || result.stdout).slice(0, 300));
  return `https://hy64.synology.me/xmedia/_edited/${outFile}`;
}

// 영상 프레임 3장을 뽑아 base64로 — 자막을 원문 트윗이 아니라 실제 화면 기준으로 쓰기 위함
async function extractVideoFrames(sourceUrl: string): Promise<string[]> {
  const ffmpeg = await findFfmpeg();
  const dir = `/tmp/frames_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const script = [
    '#!/bin/bash', 'set -e', `mkdir -p "${dir}"`,
    `curl -sL --max-time 60 "${sourceUrl}" -o "${dir}/s.mp4"`,
    `${ffmpeg} -hide_banner -loglevel error -i "${dir}/s.mp4" -vf "fps=1/2,scale=512:-2" -frames:v 3 "${dir}/f%d.jpg"`,
    `for x in "${dir}"/f*.jpg; do echo "FRAME:$(base64 "$x" | tr -d '\\n')"; done`,
    `rm -rf "${dir}"`,
  ].join('\n');
  const id = dir.split('/').pop();
  await nasExecWithStdin(`cat > /tmp/${id}.sh`, script);
  const r = await nasExec(`bash /tmp/${id}.sh; rm -f /tmp/${id}.sh`, 120_000);
  return r.stdout.split('\n').filter(l => l.startsWith('FRAME:')).map(l => l.slice(6)).filter(Boolean);
}

async function geminiVisionJson(prompt: string, images: string[]): Promise<Record<string, string>> {
  for (const key of await getGeminiKeys()) {
    for (const model of ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash']) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, ...images.map(data => ({ inline_data: { mime_type: 'image/jpeg', data } }))] }],
            generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) continue;
        const text = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
        const json = text.match(/\{[\s\S]*\}/)?.[0];
        if (json) return JSON.parse(json);
      } catch { /* 다음 모델/키 */ }
    }
  }
  throw new Error('Gemini 비전 실패');
}

async function runViralVideoYoutubeAuto(schedule: Schedule): Promise<{ uploaded: number; results: string[] }> {
  const supabase = createAdminClient();
  const config = (schedule.config as { usernames?: string[] }) || {};
  const usernames = config.usernames?.length ? config.usernames : ['momentoviral'];

  // 영상은 @2dayskr 스레드로(사용자 확정 2026-10-03 — @2days.kr은 블로그 글 전용)
  const { data: threadsConn } = await supabase
    .from('sns_connections')
    .select('access_token, platform_user_id')
    .eq('user_id', schedule.user_id)
    .eq('platform', 'threads')
    .eq('platform_user_id', VIRAL_THREADS_PLATFORM_USER_ID)
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

  const { data: rawCandidates } = await supabase
    .from('bossai_x_videos')
    .select('id, username, tweet_id, tweet_text, tweet_url, video_url')
    .in('username', usernames)
    .is('posted_at', null)
    .order('collected_at', { ascending: false })
    .limit(50);

  // momentoviral과 달리 buitengebieden/AMAZlNGNATURE 등은 이미지 게시물도 섞여 있어서
  // 스크래퍼가 정적 이미지(.png 등)까지 "영상"으로 주워담는 게 실측 확인됨 — ffmpeg가
  // 이미지를 영상으로 편집해도 유튜브에서 "재생할 수 없음" 처리되는 깨진 파일이 나옴.
  // 실제 영상 확장자만 후보로 남김.
  const candidates = (rawCandidates || []).filter(c => /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(c.video_url || ''));

  if (!candidates.length) return { uploaded: 0, results: ['업로드할 새 영상 없음 (재고 소진 — 다음 회차에 자동 보충됨)'] };

  // 1시간마다 2개씩 올리던 걸 3시간마다 1개로 줄임 — 양보다 질(사용자 확정): 매 회차 AI
  // 파싱이 실패하면 정체돼 보이는 기본 문구가 그대로 나가던 문제와 겹쳐 "티 나는 자동화"로
  // 보였음. 빈도를 줄이고(스케줄 interval_hours를 3으로 별도 변경) 아래 파싱도 견고화함.
  const picked = await pickRandom(candidates, 1);
  const results: string[] = [];
  let uploaded = 0;

  for (const video of picked) {
    try {
      const publicVideoUrl = await ensurePublicVideoUrl(supabase, video);

      // 자막 3줄(윗줄1/윗줄2/아랫말) + 유튜브 제목/설명을 한 번의 AI 호출로 생성.
      // 예전엔 "라벨: 값" 줄 단위 정규식 파싱이었는데, 매번 기본 문구만 나가는 사고가
      // 반복 확인됨 — 종교/문화적 소재(예: 기도하는 사람 영상)에서 라벨 형식을 안 지키고
      // 딴 얘기를 하는 경우가 있었던 것으로 추정. JSON 강제 출력으로 바꿔 신뢰도를 높이고,
      // koDesc 기본값도 원문(외국어일 수 있음) 대신 안전한 한국어 문구로 고정
      // (예전엔 여기만 원문 그대로 노출되는 사고가 있었음).
      let top1 = '요즘 난리난', top2 = '이 영상 ㄷㄷ', sub1 = '', sub2 = '';
      let koTitle = '오늘의 화제 영상';
      let koDesc = '오늘 알고리즘에 뜬 영상인데 진짜 신기해서 가져와봤어!';
      let threadsHook = '';
      try {
        // 원문 트윗만 보고 쓰면 강아지를 고양이라 하는 식의 엉뚱한 자막이 나옴 — 실제 프레임을 보고 쓰게 함
        const frames = await extractVideoFrames(publicVideoUrl);
        if (!frames.length) throw new Error('프레임 추출 실패');
        const parsed = await geminiVisionJson(
          `이 이미지들은 한 짧은 영상의 장면들이다. 원문 캡션(외국어일 수 있음, 참고만): ${video.tweet_text || '(없음)'}\n\n` +
          `한국 쇼츠 채널용 자막을 써라. 반드시 **화면에 실제로 보이는 것**만 근거로 — 동물 종류·인물 수·행동을 정확히. ` +
          `원문 캡션이 화면과 다르면 화면을 따른다. 확실하지 않은 디테일(나이·국적·이름)은 쓰지 마라.\n` +
          `말투: 커뮤니티 짤 요약체 반말, 사람이 재밌어서 공유하듯. ㄷㄷ/ㅋㅋ/?! 자연스럽게.\n\n` +
          `JSON 하나만 출력:\n` +
          `{"top1":"상단 제목 1줄(8~10자, 상황 제시, 예: 6살 수영천재의)",` +
          `"top2":"상단 제목 2줄(6~9자, 감탄 포인트, 예: 미친 훈련수준 ㄷㄷ)",` +
          `"sub1":"하단 자막 1줄(12~16자, 장면 설명)","sub2":"하단 자막 2줄(12~16자, 여운·반응)",` +
          `"title":"유튜브 쇼츠 제목(25자 이내)","desc":"유튜브 설명(2~3문장 반말)",` +
          `"threads":"스레드 본문(아래 규칙)"}\n\n${SNS_HOOK_GUIDE}`,
          frames,
        );
        top1 = parsed.top1?.trim() || top1;
        top2 = parsed.top2?.trim() || top2;
        sub1 = parsed.sub1?.trim() || '';
        sub2 = parsed.sub2?.trim() || '';
        koTitle = (parsed.title?.trim() || koTitle).slice(0, 80);
        koDesc = parsed.desc?.trim() || koDesc;
        threadsHook = parsed.threads?.trim() || '';
      } catch (e) {
        console.error('[viral_video_youtube_auto] 자막/제목 생성 실패, 기본 문구로 폴백:', e);
      }

      const editedVideoUrl = await editViralVideoForShorts({ sourceUrl: publicVideoUrl, lineTop1: top1, lineTop2: top2, sub1, sub2 });

      const description = [koDesc, '', `원본: ${video.tweet_url}`, VIRAL_VIDEO_DISCLOSURE].filter(Boolean).join('\n');

      // 유튜브 업로드가 실패(토큰 만료 등)해도 스레드 발행은 구글이랑 무관한
      // 별개 작업이라 영향받으면 안 되는데, 예전엔 유튜브를 먼저 await하고
      // 실패하면 통째로 catch로 빠져서 스레드 코드까지 아예 실행이 안 됐음
      // (실사용 중 확인 — 유튜브 토큰 만료 기간 동안 스레드까지 같이 멈춰 있었음)
      // — 서로 독립적으로 시도하도록 분리.
      const postedPlatforms: string[] = [];
      let ytNote = '';
      try {
        const yt = await uploadToYoutube({
          userId: schedule.user_id,
          videoUrl: editedVideoUrl,
          title: koTitle,
          description,
          channelId: VIRAL_YOUTUBE_CHANNEL_ID,
        });
        postedPlatforms.push('youtube_2days_movie');
        ytNote = `유튜브 업로드 완료 (${yt.url})`;
      } catch (e) {
        ytNote = `유튜브 실패 — ${(e as Error).message?.slice(0, 100)}`;
      }

      let threadsNote = '';
      if (threadsConn) {
        try {
          const threadsCaption = threadsHook || [koTitle, '', koDesc].filter(Boolean).join('\n');
          const pub = await postToPlatformWithMedia('threads', threadsConn.access_token, threadsConn.platform_user_id, threadsCaption, [editedVideoUrl]);
          postedPlatforms.push('threads_2dayskr');
          threadsNote = ` / 스레드 발행 완료 (${pub.id})`;
        } catch (e) {
          threadsNote = ` / 스레드 실패 — ${(e as Error).message?.slice(0, 100)}`;
        }
      }

      if (postedPlatforms.length > 0) {
        await supabase.from('bossai_x_videos').update({
          posted_at: new Date().toISOString(),
          posted_platforms: postedPlatforms,
        }).eq('id', video.id);
        uploaded++;
      }

      results.push(`@${video.username} ${video.tweet_id}: ${ytNote}${threadsNote}`);
    } catch (e) {
      results.push(`@${video.username} ${video.tweet_id}: 실패 — ${(e as Error).message?.slice(0, 150)}`);
    }
  }

  return { uploaded, results };
}

// 무신사 큐레이터 — 쿠팡/알리익스프레스와 달리 오픈 API가 없지만, 큐레이터
// 대시보드(curator.29cm.co.kr)가 내부적으로 쓰는 api.one.musinsa.com JSON API를
// 브라우저 네트워크 탭에서 실측 확인함(로그인 세션 쿠키 app_atk + X-Platform:MUSINSA
// 헤더만 있으면 인증됨). 리프레시 플로우는 못 찾아서 app_atk가 언젠가 만료되면
// 브라우저에서 재로그인 후 값을 다시 저장해야 함(X 스크래퍼 쿠키와 동일한 리스크).
const MUSINSA_THREADS_PLATFORM_USER_ID = '28733238669628153'; // @seanonthemail — 무신사 큐레이터 전용 신규 계정(쿠팡용 계정과 분리, 사용자 확정)
const MUSINSA_INSTAGRAM_PLATFORM_USER_ID = '29046724018350449'; // @seanonthemail
const MUSINSA_FACEBOOK_PLATFORM_USER_ID = '33857054073943353'; // 김현
const MUSINSA_DISCLOSURE = '이 포스팅은 무신사 큐레이터 활동의 일환으로, 구매가 발생할 경우 일정 수수료를 제공받습니다.';
const MUSINSA_KEYWORDS = [
  '후드티', '맨투맨', '니트', '가디건', '청바지', '슬랙스', '자켓', '코트', '무스탕', '패딩',
  '원피스', '스커트', '블라우스', '반팔티', '긴팔티', '스니커즈', '로퍼', '부츠', '크로스백',
  '볼캡', '비니', '머플러', '트레이닝세트', '카고팬츠', '와이드팬츠',
];

async function musinsaApi(path: string, method: 'GET' | 'POST' = 'GET'): Promise<Record<string, unknown>> {
  // app_atk 단일 쿠키만으로는 401 — musinsa.com 도메인의 세션 관련 쿠키 전체를
  // (브라우저의 credentials:'include'와 동등하게) 실어 보내야 인증됨(실측 확인).
  const cookie = await getSetting('MUSINSA_COOKIE');
  if (!cookie) throw new Error('무신사 로그인 쿠키(MUSINSA_COOKIE 설정) 없음');
  const res = await fetch(`https://api.one.musinsa.com${path}`, {
    method,
    headers: { 'X-Platform': 'MUSINSA', 'Cookie': cookie },
  });
  const json = await res.json().catch(() => null) as { data?: Record<string, unknown>; meta?: { result?: string; message?: string } } | null;
  if (!res.ok || json?.meta?.result !== 'SUCCESS') {
    throw new Error(`무신사 API 실패(${res.status}): ${json?.meta?.message || res.statusText}`);
  }
  return json.data || {};
}

interface MusinsaProduct {
  goodsNo: number; goodsName: string; brandName: string | null; imageUrl: string;
  originalPrice: number; finalPrice: number; finalDiscount: number;
  expectedEarnings: number; isSoldOut: boolean;
}

// 검색 API의 imageUrl은 대표 이미지 1장뿐 — goods-detail(공개 API, 로그인/쿠키 불필요)에서
// 실제 등록된 상품 이미지 전체를 긁어와 캐러셀로 올림. 개수는 상품마다 다름(실측 2~8장 정도).
async function getMusinsaProductImages(goodsNo: number, fallback: string): Promise<string[]> {
  try {
    const res = await fetch(`https://goods-detail.musinsa.com/api2/goods/${goodsNo}`);
    if (!res.ok) return [fallback];
    const json = await res.json() as { data?: unknown };
    const matches = [...JSON.stringify(json.data || {}).matchAll(/\/images\/goods_img\/[^"]+/g)].map(m => m[0]);
    const unique = [...new Set(matches)].map(p => `https://image.msscdn.net/thumbnails${p}`);
    return unique.length ? unique.slice(0, 5) : [fallback];
  } catch {
    return [fallback];
  }
}

async function runMusinsaCuratorAuto(schedule: Schedule): Promise<{ posted: number; goodsNo?: number; results: string[] }> {
  const supabase = createAdminClient();

  const [{ data: threadsConn }, { data: igConn }, { data: fbConn }] = await Promise.all([
    supabase.from('sns_connections').select('access_token, platform_user_id').eq('user_id', schedule.user_id)
      .eq('platform', 'threads').eq('platform_user_id', MUSINSA_THREADS_PLATFORM_USER_ID).eq('is_active', true).single(),
    supabase.from('sns_connections').select('access_token, platform_user_id').eq('user_id', schedule.user_id)
      .eq('platform', 'instagram').eq('platform_user_id', MUSINSA_INSTAGRAM_PLATFORM_USER_ID).eq('is_active', true).single(),
    supabase.from('sns_connections').select('access_token, platform_user_id').eq('user_id', schedule.user_id)
      .eq('platform', 'facebook').eq('platform_user_id', MUSINSA_FACEBOOK_PLATFORM_USER_ID).eq('is_active', true).single(),
  ]);

  if (!threadsConn && !igConn && !fbConn) return { posted: 0, results: ['무신사 발행용 SNS 계정 연결 안 됨(스레드/인스타/페북 전부)'] };

  const idx = schedule.keyword_index % MUSINSA_KEYWORDS.length;
  const keyword = MUSINSA_KEYWORDS[idx];
  await supabase.from('bossai_schedules').update({ keyword_index: (idx + 1) % MUSINSA_KEYWORDS.length }).eq('id', schedule.id);

  // 최근에 이미 올린 상품은 제외(중복 방지) — 쿠팡 파이프라인과 동일하게 이력 전체를 확인
  const { data: recentLogs } = await supabase
    .from('bossai_schedule_logs')
    .select('result')
    .eq('schedule_id', schedule.id)
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(5000);
  const recentGoodsNo = new Set(
    (recentLogs || []).map(l => (l.result as { goodsNo?: number })?.goodsNo).filter(Boolean)
  );

  let list: MusinsaProduct[];
  try {
    const data = await musinsaApi(`/api2/affiliate/v2/products/search?keyword=${encodeURIComponent(keyword)}&page=1&size=30`);
    list = (data.list || []) as MusinsaProduct[];
  } catch (e) {
    return { posted: 0, results: [`"${keyword}" 검색 실패 — ${(e as Error).message}`] };
  }

  const demandKeywords = await fetchDemandKeywords();
  const musinsaRankScore = (p: MusinsaProduct) => p.expectedEarnings * (matchesDemand(p.goodsName, demandKeywords) ? 1.5 : 1);
  const picked = list
    .filter(p => !p.isSoldOut && !recentGoodsNo.has(p.goodsNo))
    .sort((a, b) => musinsaRankScore(b) - musinsaRankScore(a))[0];

  if (!picked) return { posted: 0, results: [`"${keyword}" 후보 없음(품절 제외/이미 게시된 상품만 있음)`] };

  let link: string;
  try {
    const linkData = await musinsaApi(`/api2/affiliate/v2/link/product/${picked.goodsNo}`, 'POST');
    link = linkData.link as string;
  } catch (e) {
    return { posted: 0, goodsNo: picked.goodsNo, results: [`"${picked.goodsName}" 링크 생성 실패 — ${(e as Error).message}`] };
  }

  // 실데이터 긴급성 — 어제 스냅샷과 비교해서 진짜 가격 하락이면 프롬프트에 반영.
  const priceDropNote = await getPriceDropNote('musinsa', String(picked.goodsNo), picked.finalPrice);
  recordPriceSnapshot('musinsa', String(picked.goodsNo), picked.finalPrice).catch(() => {});

  // 앵글을 매번 하나 골라서(할인/비교/후기/상황) 프롬프트에 반영하고 go-link에 태깅 —
  // 나중에 클릭 데이터로 뭐가 실제로 잘 먹히는지 비교하기 위함.
  const contentAngle = pickContentAngle();
  const MUSINSA_ANGLE_GUIDE: Record<string, string> = {
    discount: '이 가격이 왜 의외인지(평소·비슷한 상품 대비)를 중심으로.',
    compare: '다른 선택지와 뭐가 다른지 비교하는 관점으로(구체적 스펙 지어내지 말 것).',
    review: '"이 브랜드/카테고리 써본 사람들 사이에서 자주 나오는 얘기는" 식으로 일반화된 여론 톤으로(특정 개인의 후기를 지어내지 말 것).',
    use_case: '이 옷/아이템이 필요해지는 구체적 상황(어떤 자리, 어떤 코디 고민) 묘사에 집중.',
  };

  let caption = '';
  try {
    caption = (await callAISimple(
      `너는 패션 계정을 운영하는 20대 인플루언서다. 아래 무신사 상품을 소개하는 스레드(Threads) 게시물 문구를 써라.\n` +
      `광고 티 나는 딱딱한 카피 금지, 진짜 갖고 싶어서 자랑하듯 반말/구어체로 3~5줄. 이모지는 1~2개만.\n\n` +
      `[클릭을 유도하는 훅 규칙 — 반드시 지킬 것]\n` +
      `1. 첫 1~2줄엔 상품명·브랜드명을 절대 넣지 마라. 상황이나 변화만 먼저 던지고 "이게 뭔지"는 뒤에서 밝혀라.\n` +
      `2. 막연한 칭찬 대신 구체적이고 의외인 디테일을 최소 하나 넣어라(전후 비교, 의외의 반응 등).\n` +
      `3. 이번 글의 앵글: ${contentAngle}. ${MUSINSA_ANGLE_GUIDE[contentAngle]}\n` +
      `4. 가격/할인율 정보를 자연스럽게 녹여서 "이 가격에 안 사면 손해"라는 느낌은 주되, 다 풀어서\n` +
      `   결론까지 내려주지 말고 궁금증은 남겨라.\n\n` +
      `상품명: ${picked.goodsName}\n브랜드: ${picked.brandName || '무신사'}\n정가: ${picked.originalPrice.toLocaleString()}원\n` +
      `할인가: ${picked.finalPrice.toLocaleString()}원 (${picked.finalDiscount}% 할인)\n` +
      `${priceDropNote ? `${priceDropNote}\n` : ''}\n` +
      `${SNS_HOOK_GUIDE}\n\n마지막에 링크나 해시태그는 넣지 마(내가 따로 붙일 거임). 본문만 출력해.`,
    )).trim();
  } catch (e) {
    console.error('[musinsa_curator_auto] 캡션 생성 실패, 기본 문구로 폴백:', e);
    caption = `써보니 생각보다 계속 손이 가는 아이템이 있어서 공유해요.\n${picked.finalDiscount}% 할인 중이에요.`;
  }

  const goLink = await createGoLink({
    platform: 'musinsa',
    networkProductId: String(picked.goodsNo),
    productName: picked.goodsName,
    destinationUrl: link,
    scheduleId: schedule.id,
    contentChannel: 'sns_comment',
    contentAngle,
  });

  // 링크/고지문은 본문이 아니라 댓글로 — 본문은 순수 후기 톤만 남겨서 광고 티를 줄임(사용자 확정).
  // "행동유도 문구(CTA)"가 없으면 클릭률이 눈에 띄게 낮아진다는 게 SNS 커머스 전환
  // 관련 리서치의 공통 결론이라 명시적으로 추가 — 링크 위치(댓글)를 캡션에서 알려줘야
  // 실제로 눌러볼 확률이 올라감(사용자 확정, 리서치 반영).
  const mainCaption = [caption, '', '🛍️ 이 조합 저장하고 싶으면 댓글 링크 확인하세요!', '', '#무신사 #무신사큐레이터 #패션추천 #오오티디'].join('\n');
  const linkComment = [goLink, '', MUSINSA_DISCLOSURE].join('\n');
  const images = await getMusinsaProductImages(picked.goodsNo, picked.imageUrl);

  const results: string[] = [];
  let posted = 0;

  const targets: Array<{ platform: 'threads' | 'instagram' | 'facebook'; conn: { access_token: string; platform_user_id: string } | null | undefined; label: string }> = [
    { platform: 'threads', conn: threadsConn, label: '스레드' },
    { platform: 'instagram', conn: igConn, label: '인스타' },
    { platform: 'facebook', conn: fbConn, label: '페이스북' },
  ];

  for (const { platform, conn, label } of targets) {
    if (!conn) continue;
    try {
      // 페이스북은 앱에 댓글 권한(pages_manage_engagement)이 없어 링크를 본문에 직접 넣음(사용자 확정 2026-10-07)
      const isFb = platform === 'facebook';
      const pub = await postToPlatformWithMedia(platform, conn.access_token, conn.platform_user_id, isFb ? `${mainCaption.replace('댓글 링크 확인하세요', '아래 링크 확인하세요')}\n\n${linkComment}` : mainCaption, images);
      posted++;
      results.push(`${label} 발행 완료 (${pub.id})`);
      if (!isFb) try {
        await postCommentOnOwnPost(platform, conn.access_token, conn.platform_user_id, pub.id, linkComment);
      } catch (e) {
        results[results.length - 1] += ` / 링크 댓글 실패 — ${(e as Error).message?.slice(0, 80)}`;
      }
    } catch (e) {
      results.push(`${label} 발행 실패 — ${(e as Error).message?.slice(0, 120)}`);
    }
  }

  return { posted: posted > 0 ? 1 : 0, goodsNo: picked.goodsNo, results: [`"${picked.goodsName}" — ${results.join(' / ')}`] };
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
        .select('result, started_at')
        .eq('schedule_id', schedule.id)
        .eq('status', 'success')
        .order('started_at', { ascending: false })
        .limit(5000);
      const postedLogs = (recentLogs || [])
        .map(l => ({ id: (l.result as { productId?: string })?.productId, t: new Date(l.started_at as string).getTime() }))
        .filter(l => l.id) as { id: string; t: number }[];
      // 클릭 나온 상품도 최소 7일은 쉬게 함 — 이 쿨다운이 없어서 같은 상품이 매시간 재발행됐음
      const cooldownCutoff = Date.now() - 7 * 24 * 3600 * 1000;
      recentProductIds = postedLogs.map(l => l.id);

      // 클릭이 실제로 나온 상품은 "영구 제외" 대상에서 빼서 다른 앵글로 재사용
      // 가능하게 한다 — 지금까지는 뭐가 잘 됐는지와 무관하게 한 번 쓴 상품은
      // 무조건 새 상품으로 넘어가고 있었음.
      try {
        const { data: goLinks } = await supabase
          .from('bossai_affiliate_go_links')
          .select('id, network_product_id')
          .eq('platform', 'coupang')
          .gte('created_at', new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString())
          .limit(5000);
        const idToProduct = new Map((goLinks || []).map(g => [g.id, g.network_product_id as string]));
        if (idToProduct.size) {
          const { data: clicks } = await supabase
            .from('bossai_affiliate_click_events')
            .select('go_link_id')
            .in('go_link_id', [...idToProduct.keys()])
            .limit(5000);
          const winningProductIds = new Set((clicks || []).map(c => idToProduct.get(c.go_link_id)).filter(Boolean));
          recentProductIds = postedLogs.filter(l => l.t >= cooldownCutoff || !winningProductIds.has(l.id)).map(l => l.id);
        }
      } catch { /* 클릭 데이터 조회 실패는 무시 — 기존 dedup 동작으로 폴백 */ }
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
      case 'keyword_auto': {
        const kwConfig = (schedule.config as { source_id?: string; category?: string; tistory_blog_name?: string; tistory_category_id?: string | number }) || {};
        if (!kwConfig.source_id) { summary = 'keyword_auto 스케줄에 config.source_id 없음 — 건너뜀'; break; }
        const r = await runKeywordAuto(schedule.user_id, kwConfig.source_id, kwConfig.category || 'twenties',
          kwConfig.tistory_blog_name ? { blog_name: kwConfig.tistory_blog_name, category_id: kwConfig.tistory_category_id } : undefined);
        result = r as unknown as Record<string, unknown>;
        summary = r.summary;
        break;
      }
      case 'toss_auto': {
        const r = await runTossAuto(schedule.user_id, schedule.id);
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
      case 'musinsa_curator_auto': {
        const r = await runMusinsaCuratorAuto(schedule);
        result = r as unknown as Record<string, unknown>;
        summary = `${r.posted}건 발행 — ${r.results.join(' / ')}`.slice(0, 500);
        break;
      }
    }

    // 예외 없이 결과 문구로만 실패를 알리는 러너(유튜브 연결 끊김 등)도 알림
    if (/실패 —|연결 없음|재연결 필요/.test(summary)) {
      alertOwner(`sched:${schedule.id}:sum`, `⚠️ [${schedule.name}] 일부 실패\n${summary.slice(0, 400)}`);
    }

    const nextRunAt = computeNextRunAt(intervalHoursOf(schedule), schedule.run_at_hour, now);

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

    // 슬롯 대기·스킵은 정상 동작이라 제외, 나머지 연결/인증/AI 생성 실패는 텔레그램으로 알림(같은 사유 6시간 1회)
    if (!errorMsg.includes(SLOT_WAIT_ERROR) && !errorMsg.startsWith('[스킵]') && (isAuthError(errorMsg) || /연결(이|되지| 없음)|api ?key|생성 실패|invalid argument/i.test(errorMsg))) {
      alertOwner(`sched:${schedule.id}:${errorMsg.slice(0, 30)}`, `⚠️ [${schedule.name}] 실패\n${errorMsg.slice(0, 300)}\n→ 계정 연결/쿠키/API 키 확인 필요`);
    }

    // 발행 슬롯 대기(분산 발행)는 실패가 아니라 순서 대기 — 1주기를 통째로 날리지 않게 10분 뒤 재시도
    const nextRunAt = errorMsg.includes(SLOT_WAIT_ERROR)
      ? new Date(Date.now() + 10 * 60e3)
      : computeNextRunAt(intervalHoursOf(schedule), schedule.run_at_hour, now);
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
