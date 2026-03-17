import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import type { Platform } from '@/lib/sns/platforms';

const CHAR_LIMIT: Record<string, number> = {
  twitter: 240, threads: 480, facebook: 1000, instagram: 1800, linkedin: 2000,
};

const PLATFORM_STYLE: Record<string, string> = {
  threads: '줄바꿈으로 리듬감. 2~4줄 짧은 문장. 이모지 1~2개 포인트만.',
  twitter: '한 방에 꽂히는 한 줄 + 해시태그 2~3개. 군더더기 없이.',
  instagram: '감각적 구어체. 이모지 풍부. 해시태그 8~10개.',
  facebook: '친한 친구에게 카톡으로 알려주듯. 자연스럽게.',
  linkedin: '가치 중심 추천. 전문적이지만 딱딱하지 않게.',
};

async function generateHookContent(
  productName: string,
  price: number,
  reviewText: string,
  platform: string,
  openaiKey: string,
): Promise<string> {
  const limit = CHAR_LIMIT[platform] || 500;
  const style = PLATFORM_STYLE[platform] || '자연스러운 SNS 구어체';

  const systemPrompt = `너는 온라인 MD야. 상품을 누구보다 잘 알고, 실제 사용한 사람의 경험에서 가장 핵심적인 한 줄을 뽑아내는 능력이 있어.

절대 쓰면 안 되는 단어:
- 후기, 리뷰, 상품평, 홍보, 광고, 추천드립니다, 구매했습니다, 사용해봤습니다
- "좋은 제품입니다", "만족스럽습니다" 같은 공허한 말

글쓰기 원칙:
- 첫 줄이 전부야. 읽자마자 "어? 나 이거 필요한데?" 또는 "헐 진짜?" 하게 만들어
- 실제 경험에서 나온 구체적 포인트를 첫 줄로 (막연한 표현 금지)
- "솔직히", "진짜로", "이거 왜 진작에", "이 가격에 이게?" 같은 톤
- 가격은 자연스럽게 — 놀라운 가성비 느낌으로
- 사고 싶어지는 이유 하나만 명확하게
- 링크는 댓글에 달 거니까 본문에 절대 넣지 마
- ${style}
- ${limit}자 이내. 글만 출력.`;

  const userPrompt = `상품: ${productName}
가격: ${price.toLocaleString()}원
실제 구매자 경험 (여기서 핵심만 뽑아내):
"${(reviewText || '완전 만족').slice(0, 400)}"

${platform}용 글 써줘.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.9,
      }),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (text) return text;
  } catch { /* fallback */ }

  return reviewText
    ? `${reviewText.slice(0, 60).trim()}...\n\n${productName}\n${price.toLocaleString()}원\n\n👇댓글`
    : `${productName}\n${price.toLocaleString()}원\n\n링크 댓글에 👇`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { productName, price, firstReview, platforms } = await req.json();

  if (!productName || !platforms?.length)
    return NextResponse.json({ error: '상품명과 플랫폼은 필수입니다' }, { status: 400 });

  const openaiKey = await getSetting('OPENAI_API_KEY');
  if (!openaiKey) return NextResponse.json({ error: 'OpenAI API 키가 없습니다. 설정 페이지에서 입력하세요.' }, { status: 400 });

  const contents: Record<string, string> = {};
  for (const platform of platforms as Platform[]) {
    contents[platform] = await generateHookContent(
      productName, price || 0, firstReview || '', platform, openaiKey,
    );
  }

  return NextResponse.json({ contents });
}
