import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia, postCommentOnOwnPost } from '@/lib/sns/platforms-server';
import type { Platform } from '@/lib/sns/platforms';
import { GoogleGenerativeAI } from '@google/generative-ai';

const COUPANG_DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

async function generateHookContent(
  productName: string,
  price: number,
  discountRate: number,
  firstReview: string,
  platform: Platform,
  aiApiKey?: string,
): Promise<string> {
  const charLimit: Record<Platform, number> = { twitter: 240, threads: 480, facebook: 1000, instagram: 1800, linkedin: 2000 };
  const limit = charLimit[platform];

  const platformStyle =
    platform === 'threads' ? '스레드 감성: 짧고 임팩트 있는 문장, 줄바꿈 적극 활용, 공백으로 리듬감 표현'
    : platform === 'twitter' ? '트위터 스타일: 간결하고 임팩트, 해시태그 2~3개'
    : platform === 'instagram' ? '인스타그램 스타일: 이모지 풍부하게, 해시태그 10개 이내'
    : platform === 'linkedin' ? '링크드인 스타일: 가치 중심, 약간 전문적 톤'
    : '자연스러운 SNS 스타일';

  const prompt = `실제 구매 후기를 바탕으로 ${platform} 플랫폼에 올릴 후킹 홍보글을 ${limit}자 이내로 작성해주세요.

상품명: ${productName}
가격: ${price.toLocaleString()}원${discountRate > 0 ? ` (${discountRate}% 할인)` : ''}
실제 구매 후기: "${firstReview || '만족스러운 구매였습니다'}"

요구사항:
- ${platformStyle}
- 첫 문장이 바로 시선을 끌어야 함 (궁금증 유발 or 강한 공감 포인트)
- 후기 내용을 자연스럽게 녹여서 신뢰감 형성 (광고스럽지 않게)
- "진짜 써봤는데", "솔직히 말하면" 같은 진정성 있는 톤
- 가격·할인율 정보 포함
- 이모지 적극 활용해서 가독성 UP
- 구매링크는 댓글에 따로 달 예정이니 본문에 절대 포함하지 마세요
- ${limit}자 이내로 작성`;

  const apiKey = aiApiKey || process.env.GEMINI_API_KEY;
  const fallback = firstReview
    ? `"${firstReview.substring(0, 80)}"\n\n이 후기 보고 바로 질렀습니다 😮\n\n🛒 ${productName}\n💸 ${price.toLocaleString()}원${discountRate > 0 ? ` (${discountRate}% 할인!)` : ''}\n\n구매링크는 댓글에 👇`
    : `🛒 ${productName}\n💸 ${price.toLocaleString()}원${discountRate > 0 ? ` (${discountRate}% 할인!)` : ''}\n\n구매링크는 댓글에 👇`;

  if (!apiKey) return fallback;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch {
    return fallback;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const {
    productName, productUrl, price, discountRate, affiliateUrl,
    imageUrls, firstReview, platforms, aiApiKey,
    generatedContent: preGenerated,  // 미리 생성된 내용이 있으면 AI 재생성 생략
  } = await req.json();

  if (!productName || !affiliateUrl || !platforms?.length)
    return NextResponse.json({ error: '상품명, 제휴링크, 플랫폼은 필수입니다' }, { status: 400 });

  // 첫 번째 이미지만 첨부
  const firstImage: string[] = imageUrls?.[0] ? [imageUrls[0]] : [];
  const commentText = `🛒 구매하러 가기 👇\n${affiliateUrl}\n\n${COUPANG_DISCLOSURE}`;

  const results: { platform: string; success: boolean; content?: string; error?: string }[] = [];
  const postIds: Record<string, string> = {};
  const generatedContent: Record<string, string> = {};

  for (const platform of platforms as Platform[]) {
    const { data: conn } = await supabase
      .from('sns_connections')
      .select('access_token, platform_user_id, is_active')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('is_active', true)
      .single();

    if (!conn) {
      results.push({ platform, success: false, error: '연결되지 않은 플랫폼' });
      continue;
    }

    try {
      const content = (preGenerated as Record<string, string> | undefined)?.[platform]
        || await generateHookContent(productName, price || 0, discountRate || 0, firstReview || '', platform, aiApiKey);
      generatedContent[platform] = content;

      // 메인 포스트 (첫 번째 이미지만 첨부)
      const { id: platformPostId } = await postToPlatformWithMedia(
        platform, conn.access_token, conn.platform_user_id || '',
        content, firstImage,
      );
      postIds[platform] = platformPostId;

      // 댓글: 구매링크 + 쿠팡 파트너스 고지문구
      try {
        await postCommentOnOwnPost(
          platform, conn.access_token, conn.platform_user_id || '',
          platformPostId, commentText,
        );
      } catch (e) {
        console.warn(`[${platform}] 구매링크 댓글 달기 실패:`, e);
      }

      results.push({ platform, success: true, content });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ platform, success: false, error: message });
    }
  }

  // 히스토리 저장 (성공한 플랫폼이 하나라도 있을 때)
  const successPlatforms = results.filter((r) => r.success).map((r) => r.platform);
  if (successPlatforms.length > 0) {
    await supabase.from('coupang_post_history').insert({
      user_id: user.id,
      product_name: productName,
      product_url: productUrl || '',
      affiliate_url: affiliateUrl,
      image_urls: imageUrls || [],
      first_review: firstReview || '',
      platforms: successPlatforms,
      generated_content: generatedContent,
      post_ids: postIds,
    });
  }

  return NextResponse.json({ results });
}
