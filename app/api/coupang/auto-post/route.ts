import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { postToPlatformWithMedia } from '@/lib/sns/platforms-server';
import type { Platform } from '@/lib/sns/platforms';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface Review { reviewer: string; rating: number; content: string; images: string[] }

async function generatePostContent(
  productName: string,
  price: number,
  discountRate: number,
  affiliateUrl: string,
  reviews: Review[],
  platform: Platform,
  aiApiKey?: string,
): Promise<string> {
  const charLimit: Record<Platform, number> = { twitter: 270, threads: 490, facebook: 1000, instagram: 1800, linkedin: 2000 };
  const limit = charLimit[platform];

  const reviewText = reviews.slice(0, 2)
    .map((r) => `⭐${r.rating}/5 "${r.content.substring(0, 150)}"`)
    .join('\n');

  const prompt = `다음 쿠팡 상품의 SNS 홍보글을 ${limit}자 이내로 작성해주세요.

상품명: ${productName}
가격: ${price.toLocaleString()}원 (${discountRate}% 할인)
제휴 링크: ${affiliateUrl}
실제 구매 리뷰:
${reviewText || '(리뷰 없음)'}

요구사항:
- ${platform === 'twitter' ? '트위터 스타일, 해시태그 3개 이하' : platform === 'instagram' ? '인스타그램 스타일, 이모지 활용, 해시태그 10개 내외' : platform === 'linkedin' ? '전문적이고 비즈니스 톤' : '자연스러운 SNS 홍보글'}
- 실제 리뷰 내용을 인용해서 신뢰감 있게 작성
- 제휴 링크 반드시 포함
- 구매 유도 CTA 포함
- ${limit}자 이내로 작성`;

  const apiKey = aiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return `🛒 ${productName}\n\n💸 ${price.toLocaleString()}원 (${discountRate}% 할인!)\n\n${reviewText ? `💬 실제 구매 후기\n${reviews[0]?.content.substring(0, 200) || ''}\n\n` : ''}🔗 구매 링크: ${affiliateUrl}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch {
    return `🛒 ${productName}\n\n💸 ${price.toLocaleString()}원 (${discountRate}% 할인!)\n\n${reviews[0]?.content ? `💬 "${reviews[0].content.substring(0, 200)}"\n\n` : ''}🔗 구매하기: ${affiliateUrl}`;
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const {
    productName, price, discountRate, affiliateUrl,
    imageUrls, reviews, platforms, aiApiKey,
  } = await req.json();

  if (!productName || !affiliateUrl || !platforms?.length)
    return NextResponse.json({ error: '상품명, 제휴링크, 플랫폼은 필수입니다' }, { status: 400 });

  const results: { platform: string; success: boolean; content?: string; error?: string }[] = [];

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
      const content = await generatePostContent(
        productName, price || 0, discountRate || 0, affiliateUrl,
        reviews || [], platform, aiApiKey,
      );

      const { id: platformPostId } = await postToPlatformWithMedia(
        platform, conn.access_token, conn.platform_user_id || '',
        content,
        imageUrls?.slice(0, platform === 'twitter' ? 4 : 10) || [],
      );

      results.push({ platform, success: true, content });
      await supabase.from('sns_post_logs').insert({
        user_id: user.id, platform, status: 'success',
        platform_post_id: platformPostId,
        media_urls: imageUrls || [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ platform, success: false, error: message });
    }
  }

  return NextResponse.json({ results });
}
