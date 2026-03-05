import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Platform } from '@/lib/sns/platforms';

const CHAR_LIMIT: Record<string, number> = {
  twitter: 240, threads: 480, facebook: 1000, instagram: 1800, linkedin: 2000,
};

const PLATFORM_STYLE: Record<string, string> = {
  threads: '스레드 감성: 짧고 임팩트 있는 문장, 줄바꿈으로 리듬감, 친근한 반말체',
  twitter: '트위터 스타일: 간결하고 임팩트, 해시태그 2~3개',
  instagram: '인스타그램 스타일: 이모지 풍부하게, 감성적 문장, 해시태그 10개 이내',
  facebook: '페이스북 스타일: 자연스러운 일상 공유 톤, 정보 포함',
  linkedin: '링크드인 스타일: 가치 중심, 약간 전문적 톤',
};

async function generateHookContent(
  productName: string,
  price: number,
  discountRate: number,
  firstReview: string,
  platform: string,
  aiApiKey?: string,
): Promise<string> {
  const limit = CHAR_LIMIT[platform] || 500;
  const style = PLATFORM_STYLE[platform] || '자연스러운 SNS 스타일';

  const prompt = `실제 구매 후기를 바탕으로 후킹 홍보글을 작성해주세요.

플랫폼: ${platform}
상품명: ${productName}
가격: ${price.toLocaleString()}원${discountRate > 0 ? ` (${discountRate}% 할인)` : ''}
실제 구매 후기: "${firstReview || '만족스러운 구매였습니다'}"

요구사항:
- ${style}
- 첫 문장이 강한 후킹 포인트여야 함 (공감, 궁금증 유발, 놀라움 중 하나)
- 후기를 자연스럽게 녹여서 신뢰감 형성 (광고스럽지 않게)
- 이모지 적극 활용
- 가격 정보 포함
- 구매링크는 댓글에 달 예정이니 본문에 절대 포함하지 마세요
- ${limit}자 이내로만 작성, 앞뒤 설명 없이 본문만 출력`;

  const apiKey = aiApiKey || process.env.GEMINI_API_KEY;
  const fallback = firstReview
    ? `"${firstReview.substring(0, 80)}"\n\n👆 이 후기 보고 바로 질렀습니다 😮\n\n🛒 ${productName}\n💸 ${price.toLocaleString()}원${discountRate > 0 ? ` (${discountRate}% 할인!)` : ''}\n\n구매링크는 댓글에 👇`
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

  const { productName, price, discountRate, firstReview, platforms, aiApiKey } = await req.json();

  if (!productName || !platforms?.length)
    return NextResponse.json({ error: '상품명과 플랫폼은 필수입니다' }, { status: 400 });

  const contents: Record<string, string> = {};
  for (const platform of platforms as Platform[]) {
    contents[platform] = await generateHookContent(
      productName, price || 0, discountRate || 0, firstReview || '', platform, aiApiKey,
    );
  }

  return NextResponse.json({ contents });
}
