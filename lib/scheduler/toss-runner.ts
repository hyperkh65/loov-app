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

const AFFILIATE_IG_PLATFORM_USER_ID = '34489947500650071'; // @2dayskr
const AFFILIATE_THREADS_PLATFORM_USER_ID = '25873039292318366'; // @2days.kr (표시명 "투데이s")
const TOSS_DISCLOSURE = '이 포스팅은 토스쇼핑 제휴 마케팅 파트너 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

// 하루특가는 실제 종료 시각(endAt)이 있어서 진짜 긴급성을 문구에 쓸 수 있음
// (가짜 재촉 문구는 장기적으로 신뢰를 깎는다는 리서치 결론 — 오늘 세션에서
// 이미 확인·반영한 원칙, 여기선 실제 마감시간이라 안전하게 사용 가능)
function buildCaption(p: TossProduct): string {
  const discount = p.discountRate ? `${p.discountRate}% 할인` : '특가';
  const endLine = p.endAt ? formatDeadline(p.endAt) : '';
  return [
    `${p.displayName} 지금 ${discount} 중이에요 👀`,
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

export async function runTossAuto(userId: string): Promise<TossAutoResult> {
  const admin = createAdminClient();

  const [deals, bestSelling] = await Promise.all([
    fetchTodayDeals(30).catch(() => [] as TossProduct[]),
    fetchBestSelling(30).catch(() => [] as TossProduct[]),
  ]);
  const candidates = [...deals, ...bestSelling].filter(p => !p.isSoldOut);
  if (!candidates.length) return { summary: '토스 상품 후보 없음', results: [] };

  const { data: used } = await admin
    .from('bossai_toss_posts')
    .select('taca_item_id')
    .order('created_at', { ascending: false })
    .limit(500);
  const usedSet = new Set((used || []).map((r: { taca_item_id: number }) => r.taca_item_id));

  const picked = candidates.find(p => !usedSet.has(p.tacaItemId));
  if (!picked) return { summary: '토스 후보가 전부 이미 발행됨', results: [] };

  const { shortUrl } = await createShareLink(picked.tacaItemId);
  const caption = buildCaption(picked);
  const linkComment = buildLinkComment(shortUrl);

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
