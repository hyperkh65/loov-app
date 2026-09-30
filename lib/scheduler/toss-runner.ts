/**
 * 토스쇼핑 쉐어링크 자동발행 — 하루특가 상품 하나를 골라 쉐어링크를 발급받고
 * 기존 쿠팡 제휴 파이프라인과 같은 계정(@2days.kr 스레드/인스타)에 이미지로 발행한다.
 * 쿠팡 파이프라인처럼 영상 렌더링까지는 하지 않음 — 토스가 실제 상품 사진을
 * 바로 주기 때문에 이미지 포스트로 충분하고, 영상 파이프라인(스크립트/TTS/렌더)을
 * 새로 만드는 건 별도 요청 시 확장.
 */
import { createAdminClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import { toInstagramSafeImage } from '@/lib/rewrite-publish';
import { fetchTodayDeals, fetchBestSelling, createShareLink, type TossProduct } from '@/lib/toss-sharelink';
import { callAISimple } from '@/lib/ai-call';
import { createGoLink, pickContentAngle, type ContentAngle } from '@/lib/affiliate-tracking';
import { fetchDemandKeywords, matchesDemand } from '@/lib/affiliate-demand-signal';

const AFFILIATE_IG_PLATFORM_USER_ID = '34489947500650071'; // @2dayskr
const AFFILIATE_THREADS_PLATFORM_USER_ID = '25873039292318366'; // @2days.kr (표시명 "투데이s")
const TOSS_DISCLOSURE = '이 포스팅은 토스쇼핑 제휴 마케팅 파트너 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

// 하루특가는 실제 종료 시각(endAt)이 있어서 진짜 긴급성을 문구에 쓸 수 있음
// (가짜 재촉 문구는 장기적으로 신뢰를 깎는다는 리서치 결론 — 오늘 세션에서
// 이미 확인·반영한 원칙, 여기선 실제 마감시간이라 안전하게 사용 가능)
//
// 예전엔 고정 템플릿이 매번 "${상품명} 지금 할인 중이에요"로 첫 줄부터 상품명을
// 노출해서 광고로 바로 읽혔음(궁금증이 생길 틈이 없음) — AI로 바꿔서 상황/훅이
// 먼저 나오게 하고, API가 이미 주는 reviewScore/reviewCount(실제 평점·리뷰수)도
// 사회적 증거로 반영. AI 실패 시에도 상품명을 첫 줄에 두지 않는 폴백 유지.
const TOSS_ANGLE_GUIDE: Record<ContentAngle, string> = {
  discount: '이 가격이 왜 의외인지(평소·비슷한 상품 대비)를 중심으로.',
  compare: '다른 선택지와 뭐가 다른지 비교하는 관점으로(구체적 스펙 지어내지 말 것).',
  review: '실제 평점/리뷰수 데이터를 근거로 "이 정도면 검증된 것" 느낌을 주는 톤으로.',
  use_case: '이 상품이 필요해지는 구체적 상황(언제·어떤 불편) 묘사에 집중.',
};

async function buildCaption(p: TossProduct, angle: ContentAngle): Promise<string> {
  const discount = p.discountRate ? `${p.discountRate}% 할인` : '특가';
  const endLine = p.endAt ? formatDeadline(p.endAt) : '';
  const reviewLine = p.reviewScore && p.reviewCount
    ? `평점 ${p.reviewScore}, 리뷰 ${p.reviewCount.toLocaleString()}개 (실데이터 — 있는 그대로 언급)`
    : '리뷰 데이터 없음 — 리뷰/평점을 지어내지 마라';

  try {
    const caption = (await callAISimple(
      `너는 가성비 특가를 소개하는 캐주얼한 SNS 계정을 운영한다. 아래 토스쇼핑 상품으로 짧은 게시물 문구를 써라(3~5줄, 이모지 1~2개).\n\n` +
      `[클릭을 유도하는 훅 규칙 — 반드시 지킬 것]\n` +
      `1. 첫 1~2줄엔 상품명을 절대 넣지 마라. 상황이나 변화만 먼저 던져라.\n` +
      `2. 막연한 칭찬 대신 구체적이고 의외인 디테일을 최소 하나 넣어라.\n` +
      `3. 이번 글의 앵글: ${angle}. ${TOSS_ANGLE_GUIDE[angle]}\n` +
      `4. 가격/할인 정보는 자연스럽게 녹이되 다 풀어서 결론까지 내려주지 말고 궁금증은 남겨라.\n\n` +
      `상품명: ${p.displayName}\n가격: ${p.displayPrice.toLocaleString()}원` +
      (p.originalPrice > p.displayPrice ? ` (정가 ${p.originalPrice.toLocaleString()}원, ${discount})` : '') + `\n` +
      `${reviewLine}\n${endLine ? `마감: ${endLine}\n` : ''}\n` +
      `마지막에 링크/해시태그는 넣지 마(따로 붙일 거임). 본문만 출력해. 반드시 한국어로만.`,
    )).trim();
    if (caption) return caption;
  } catch { /* 폴백으로 진행 */ }

  return [
    `요즘 이거 하나로 아침 루틴이 확 바뀌었다는 얘기가 많길래 찾아봤어요.`,
    endLine,
    '',
    `${p.displayPrice.toLocaleString()}원` + (p.originalPrice > p.displayPrice ? ` (정가 ${p.originalPrice.toLocaleString()}원)` : ''),
    '🔗 구매 링크는 댓글 참고!',
    '',
    '#토스쇼핑 #특가 #오늘의특가 #가성비',
  ].filter(Boolean).join('\n');
}

function formatDeadline(endAtIso: string): string {
  try {
    const end = new Date(endAtIso);
    const now = new Date();
    const hoursLeft = Math.round((end.getTime() - now.getTime()) / 3_600_000);
    if (hoursLeft <= 0) return '';
    if (hoursLeft <= 48) return `⏰ ${hoursLeft}시간 뒤 종료`;
    return '';
  } catch { return ''; }
}

function buildLinkComment(shortUrl: string): string {
  return [`구매 링크: ${shortUrl}`, '', TOSS_DISCLOSURE].join('\n');
}

export interface TossAutoResult {
  summary: string;
  results: string[];
}

export async function runTossAuto(userId: string, scheduleId?: string): Promise<TossAutoResult> {
  const admin = createAdminClient();

  const [deals, bestSelling] = await Promise.all([
    fetchTodayDeals(30).catch(() => [] as TossProduct[]),
    fetchBestSelling(30).catch(() => [] as TossProduct[]),
  ]);
  const rawCandidates = [...deals, ...bestSelling].filter(p => !p.isSoldOut);
  if (!rawCandidates.length) return { summary: '토스 상품 후보 없음', results: [] };
  // 베스트셀링/오늘특가 순서(공급 신호)보다 실제 구매의도 키워드와 겹치는 상품을 우선.
  const demandKeywords = await fetchDemandKeywords();
  const candidates = [...rawCandidates].sort((a, b) =>
    Number(matchesDemand(b.displayName, demandKeywords)) - Number(matchesDemand(a.displayName, demandKeywords))
  );

  const { data: used } = await admin
    .from('bossai_toss_posts')
    .select('taca_item_id')
    .order('created_at', { ascending: false })
    .limit(500);
  const usedSet = new Set((used || []).map((r: { taca_item_id: number }) => r.taca_item_id));

  const picked = candidates.find(p => !usedSet.has(p.tacaItemId));
  if (!picked) return { summary: '토스 후보가 전부 이미 발행됨', results: [] };

  const { shortUrl } = await createShareLink(picked.tacaItemId);
  const contentAngle = pickContentAngle();
  const caption = await buildCaption(picked, contentAngle);
  const goLink = await createGoLink({
    platform: 'toss',
    networkProductId: String(picked.tacaItemId),
    productName: picked.displayName,
    destinationUrl: shortUrl,
    scheduleId,
    contentChannel: 'sns_comment',
    contentAngle,
  });
  const linkComment = buildLinkComment(goLink);

  const [igConn, threadsConn] = await Promise.all([
    admin.from('sns_connections').select('access_token, platform_user_id')
      .eq('user_id', userId).eq('platform', 'instagram')
      .eq('platform_user_id', AFFILIATE_IG_PLATFORM_USER_ID).eq('is_active', true).single()
      .then(r => r.data),
    admin.from('sns_connections').select('access_token, platform_user_id')
      .eq('user_id', userId).eq('platform', 'threads')
      .eq('platform_user_id', AFFILIATE_THREADS_PLATFORM_USER_ID).eq('is_active', true).single()
      .then(r => r.data),
  ]);

  const results: string[] = [];

  if (igConn) {
    try {
      const igImage = await toInstagramSafeImage(picked.thumbnailUrl).catch(() => picked.thumbnailUrl);
      const pub = await postToPlatformWithMedia('instagram', igConn.access_token, igConn.platform_user_id, caption, [igImage]);
      let note = '';
      try { await postCommentOnOwnPost('instagram', igConn.access_token, igConn.platform_user_id, pub.id, linkComment); }
      catch (e) { note = ` / 링크 댓글 실패 — ${(e as Error).message?.slice(0, 80)}`; }
      results.push(`인스타 발행 완료 (ig:${pub.id})${note}`);
    } catch (e) {
      results.push(`인스타 실패 — ${(e as Error).message?.slice(0, 150)}`);
    }
  } else {
    results.push('인스타 연결 없음, 스킵');
  }

  if (threadsConn) {
    try {
      const pub = await postToPlatformWithMedia('threads', threadsConn.access_token, threadsConn.platform_user_id, caption, [picked.thumbnailUrl]);
      let note = '';
      try { await postCommentOnOwnPost('threads', threadsConn.access_token, threadsConn.platform_user_id, pub.id, linkComment); }
      catch (e) { note = ` / 링크 댓글 실패 — ${(e as Error).message?.slice(0, 80)}`; }
      results.push(`스레드 발행 완료 (${pub.id})${note}`);
    } catch (e) {
      results.push(`스레드 실패 — ${(e as Error).message?.slice(0, 150)}`);
    }
  } else {
    results.push('스레드 연결 없음, 스킵');
  }

  await admin.from('bossai_toss_posts').insert({
    user_id: userId, taca_item_id: picked.tacaItemId, display_name: picked.displayName,
    short_url: shortUrl, results,
  });

  return { summary: `"${picked.displayName}" → ${results.join(' / ')}`, results };
}
