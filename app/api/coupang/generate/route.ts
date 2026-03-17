import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import type { Platform } from '@/lib/sns/platforms';

const CHAR_LIMIT: Record<string, number> = {
  twitter: 240, threads: 480, facebook: 1000, instagram: 1800, linkedin: 2000,
};

const PLATFORM_STYLE: Record<string, string> = {
  threads: '짧고 강렬한 문장. 줄바꿈으로 호흡. 반말 구어체.',
  twitter: '한 방에 꽂히는 한 줄. 해시태그 2~3개.',
  instagram: '감성적 일상 구어체. 이모지 풍부. 해시태그 10개 이내.',
  facebook: '지인한테 말하듯 자연스럽게. 정보 포함.',
  linkedin: '가치 중심. 약간 전문적 톤.',
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

  const systemPrompt = `너는 SNS에 일상적인 글을 올리는 평범한 사람이야.
절대 금지:
- "후기", "리뷰", "홍보", "제품", "광고", "추천드립니다" 같은 단어
- 따옴표("") 사용
- "구매했습니다", "사용해봤습니다" 같은 딱딱한 표현
- AI가 쓴 티 나는 문장

글쓰기 규칙:
- ${style}
- 진짜 내가 쓴 것처럼 자연스럽고 구어체로
- 첫 문장에서 바로 공감이나 궁금증을 유발
- 가격 정보는 자연스럽게 녹여서
- 이모지 적극 활용해서 읽기 편하게
- 구매링크는 댓글에 따로 달 거니까 본문에 절대 넣지 마
- ${limit}자 이내. 글만 출력. 설명 없이.`;

  const userPrompt = `상품: ${productName}
가격: ${price.toLocaleString()}원
실제 구매자 경험: ${reviewText || '써보니까 진짜 좋았음'}

위 정보를 바탕으로 ${platform}에 올릴 글 써줘.`;

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

  // fallback
  return `${productName}\n\n${price.toLocaleString()}원인데 완전 득템 💸\n\n링크는 댓글에 👇`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { productName, price, firstReview, platforms } = await req.json();

  if (!productName || !platforms?.length)
    return NextResponse.json({ error: '상품명과 플랫폼은 필수입니다' }, { status: 400 });

  // notion_connections에서 OpenAI 키 가져오기
  const { data: conn } = await supabase
    .from('notion_connections')
    .select('openai_api_key')
    .eq('user_id', user.id)
    .single();

  const openaiKey = conn?.openai_api_key?.trim() || process.env.OPENAI_API_KEY || '';
  if (!openaiKey) return NextResponse.json({ error: 'OpenAI API 키가 없습니다. WordPress 설정에서 입력하세요.' }, { status: 400 });

  const contents: Record<string, string> = {};
  for (const platform of platforms as Platform[]) {
    contents[platform] = await generateHookContent(
      productName, price || 0, firstReview || '', platform, openaiKey,
    );
  }

  return NextResponse.json({ contents });
}
