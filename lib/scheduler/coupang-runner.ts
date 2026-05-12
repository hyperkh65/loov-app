import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { getGoldboxProducts, searchProducts, createAffiliateLinks } from '@/lib/coupang/api';
import { getSetting } from '@/lib/get-setting';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import type { Platform } from '@/lib/sns/platforms';
import type { Schedule, CoupangAutoConfig } from './index';

const DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

async function getSnsConnections(userId: string): Promise<Array<{ platform: string; platform_user_id: string; platform_username: string; access_token: string; is_active: boolean }>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('sns_connections')
    .select('platform, platform_user_id, platform_username, access_token, is_active')
    .eq('user_id', userId)
    .eq('is_active', true);
  return (data || []) as typeof data extends null ? [] : NonNullable<typeof data>;
}

function getSection(text: string, tag: string, allTags: string[]): string {
  const marker = `[[[${tag}]]]`;
  const start = text.indexOf(marker);
  if (start < 0) return '';
  const from = start + marker.length;
  let end = text.length;
  for (const t of allTags) {
    if (t === tag) continue;
    const pos = text.indexOf(`[[[${t}]]]`, from);
    if (pos >= 0 && pos < end) end = pos;
  }
  return text.slice(from, end).trim();
}

export async function runCoupangAuto(schedule: Schedule, recentProductIds: string[] = []): Promise<{ productName: string; platforms: string[]; results: string[] }> {
  const config = schedule.config as CoupangAutoConfig;

  const accessKey = await getSetting('COUPANG_ACCESS_KEY');
  const secretKey = await getSetting('COUPANG_SECRET_KEY');
  if (!accessKey || !secretKey) throw new Error('쿠팡파트너스 API 키가 설정되지 않았습니다');

  // 상품 수집
  let products;
  if (config.product_source === 'keyword' && config.search_keywords?.length) {
    const kw = config.search_keywords[Math.floor(Math.random() * config.search_keywords.length)];
    products = await searchProducts(kw, accessKey, secretKey);
  } else {
    products = await getGoldboxProducts(accessKey, secretKey);
  }

  if (!products?.length) throw new Error('상품을 가져오지 못했습니다');

  // 최근 발행하지 않은 상품 선택
  const candidates = products.filter(p => !recentProductIds.includes(String(p.productId)));
  const product = (candidates.length ? candidates : products)[0] as {
    productId: number | string;
    productName: string;
    productPrice: number;
    productUrl: string;
    productImage?: string;
    discountRate?: number;
  };

  if (config.min_discount && (product.discountRate || 0) < config.min_discount) {
    const filtered = products.find(p => (p as typeof product).discountRate && (p as typeof product).discountRate! >= config.min_discount!);
    if (filtered) Object.assign(product, filtered);
  }

  // 제휴링크 생성
  let affiliateUrl = product.productUrl;
  try {
    const links = await createAffiliateLinks([product.productUrl], accessKey, secretKey);
    if (links[0]) affiliateUrl = links[0];
  } catch { /* 폴백: 원본 URL */ }

  // SNS 텍스트 생성
  const TAGS = ['THREADS', 'TWITTER', 'FACEBOOK', 'INSTAGRAM'];
  const prompt = `너는 SNS 마케팅 전문가야. 쿠팡 파트너스 상품을 각 SNS 플랫폼에 맞는 후킹성 멘트로 작성해줘.
반드시 한국어로만 작성하고, 중국어·일본어 등 외국 문자 절대 사용 금지.

상품명: ${product.productName}
가격: ${product.productPrice.toLocaleString()}원${(product as typeof product & { discountRate?: number }).discountRate ? ` (-${(product as typeof product & { discountRate: number }).discountRate}%)` : ''}

[플랫폼별 작성 규칙]
- THREADS: 줄바꿈으로 리듬감. 2~4줄 짧은 문장. 이모지 1~2개. URL 없이 (댓글로 추가)
- TWITTER: 한 방에 꽂히는 문장 + 해시태그 2~3개. 240자 이내. URL 없이 (댓글로 추가)
- FACEBOOK: 친근하게 250자 내외. 이모지 적당히. URL 없이
- INSTAGRAM: 감성적, 이모지 풍부, 해시태그 10개. URL 없이

반드시 아래 구분자 형식으로만 출력 (설명/코드블록 없이):
[[[THREADS]]]
스레드용 텍스트
[[[TWITTER]]]
트위터용 텍스트
[[[FACEBOOK]]]
페이스북용 텍스트
[[[INSTAGRAM]]]
인스타그램용 텍스트`;

  const aiText = await generateText(prompt, 'qwen3');

  const textMap: Record<string, string> = {
    threads:   getSection(aiText, 'THREADS', TAGS),
    twitter:   getSection(aiText, 'TWITTER', TAGS),
    facebook:  getSection(aiText, 'FACEBOOK', TAGS),
    instagram: getSection(aiText, 'INSTAGRAM', TAGS),
  };

  const comment = `🔗 상품 링크: ${affiliateUrl}\n\n${DISCLOSURE}`;

  // SNS 연결 계정 조회
  const connections = await getSnsConnections(schedule.user_id);
  const platforms = config.sns_platforms.filter(p => ['threads', 'twitter', 'facebook', 'instagram'].includes(p));
  const results: string[] = [];

  for (const platform of platforms) {
    const conn = connections.find(c => c.platform === platform);
    if (!conn) { results.push(`${platform}: 계정 미연결`); continue; }

    const text = textMap[platform];
    if (!text) { results.push(`${platform}: 텍스트 생성 실패`); continue; }

    try {
      const postResult = await postToPlatformWithMedia(
        platform as Platform,
        conn.access_token,
        conn.platform_user_id,
        text,
        product.productImage ? [product.productImage] : undefined,
      );
      // 제휴링크를 댓글로
      try {
        await postCommentOnOwnPost(platform as Platform, conn.access_token, conn.platform_user_id, postResult.id, comment);
      } catch { /* 댓글 실패 시 무시 */ }
      results.push(`${platform}: 발행 완료`);
    } catch (err) {
      results.push(`${platform}: ${(err as Error).message?.slice(0, 50) || '실패'}`);
    }
  }

  return { productName: product.productName, platforms, results };
}
