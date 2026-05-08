import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { callAI } from '@/lib/ai-call';
import type { Platform } from '@/lib/sns/platforms';

export const maxDuration = 90;

const CHAR_LIMIT: Record<string, number> = {
  twitter: 240, threads: 500, facebook: 1200, instagram: 2000, linkedin: 2000,
};

const PLATFORM_STYLE: Record<string, string> = {
  threads: `• 2~4줄짜리 짧은 문장으로 리듬감 있게
• 이모지는 문장 앞이나 끝에 1~2개만 (과하면 춘스러워)
• 핵심 혜택 한 줄 + 가격 놀라움 + 행동 유도로 마무리`,
  twitter: `• 딸 한 방에 꼽히는 한 문장 (한 줄 후킹)
• 해시태그 2~3개로 마무리
• 글자 수 240자 이내, 군더기 없이`,
  instagram: `• 첫 줄로 바로 훅 - "이거 실화?" 같은 반응 유발
• 이모지 3~5개 자연스럽게 섯어서
• 본문 7~10줄, 마지막에 해시태그 10개 이상
• 해시태그는 별도 줄로 분리`,
  facebook: `• 친한 지인에게 카톡 보내듯 자연스럽게
• "나 이거 써봤는데" 느낌의 1인칭 추천 톤
• 3~5문장, 이모지 1~2개, 부담 없이`,
};

// 외국어 혼용 감지: CJK한자, 일본어 가나, 키릴(러시아), 아랍, 한글에 붙은 라틴
function hasForeignChars(text: string): boolean {
  // CJK·일본어·키릴·아랍 문자
  if (/[一-鿿぀-ヿЀ-ӿ؀-ۿ]/.test(text)) return true;
  // 한글 바로 옆에 라틴 알파벳이 붙은 경우 (예: 상쾌함ineties, iscount되니까)
  if (/[가-힣][A-Za-z]|[A-Za-z][가-힣]/.test(text)) return true;
  return false;
}

function cleanForeignChars(text: string): string {
  return text
    // CJK 한자, 일본어 가나, 키릴, 아랍 제거
    .replace(/[一-鿿぀-ヿЀ-ӿ؀-ۿ豈-﫿]/g, '')
    // 한글 뒤에 붙은 라틴 파편 제거 (예: 상쾌함ineties → 상쾌함)
    .replace(/([가-힣]+)[A-Za-z]+/g, '$1')
    // 한글 앞에 붙은 라틴 파편 제거 (예: iscount되니까 → 되니까)
    .replace(/[A-Za-z]+([가-힣]+)/g, '$1')
    .replace(/  +/g, ' ')
    .trim();
}

async function generateContent(
  productName: string,
  price: number,
  discountRate: number | undefined,
  categoryName: string | undefined,
  platform: string,
  provider?: string,
  firstReview?: string,
): Promise<string> {
  const limit = CHAR_LIMIT[platform] || 500;
  const style = PLATFORM_STYLE[platform] || '자연스럽고 구어체, 3~5문장';

  const systemPrompt = `너는 대한민국 최고의 SNS 쇼핑 콘텐츠 크리에이터야.
쿠팡 제휴 마케팅 글을 쓰는데, 진짜 써봤 사람처럼 자연스럽고 설득력 있게 써야 해.

**반드시 순수한 한국어로만 작성할 것. 중국어, 일본어, 러시아어 등 외국어 절대 금지.**

[절대 금지]
- 한자(漢字), 일본어 히라가나/가타카나, 러시아어 키릴 문자 등 외국어 문자 혼용
- "추천드립니다", "구매했습니다", "사용해봤습니다" 같은 광고 티나는 말
- "좋은 제품", "만족스러운", "혜택" 같은 공허한 형용사
- 링크나 URL을 본문에 넣기 (댓글에 달 거니까)
- 판매자/홍보 느낌나는 어투

[잘 써야 할 것]
- 첫 문장: "이 가격에 이게 가능해?", "진짜 몰랐는데", "왜 진작 안 삿지" 같은 반응 유도
- 상품의 핵심 가치를 구체적으로 (막연한 표현 X)
- 가격/할인율을 자연스럽게 녹여서 가성비 강조
- 사고 싶어지는 이유 하나를 명확하게
- ${style}
- 반드시 ${limit}자 이내로, 한국어 글만 출력 (설명 없이)`;

  const discount = discountRate && discountRate > 0 ? ` (${discountRate}% 할인 중)` : '';
  const category = categoryName ? `카테고리: ${categoryName}` : '';
  const review = firstReview?.trim() ? `실제 구매자 리뷰: "${firstReview.trim()}"` : '';

  const userPrompt = `상품명: ${productName}
가격: ${price.toLocaleString()}원${discount}
${category}
${review}
플랫폼: ${platform}

위 상품에 대한 ${platform}용 SNS 홍보 글을 써줘.`;

  const result = await callAI({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    provider: provider || undefined,
    maxTokens: 700,
    temperature: 0.9,
    useFallback: true,
  });

  if (!result.text) throw new Error('AI가 빈 응답을 반환했습니다');

  // 외국어 혼용 감지 시 다른 provider로 재시도
  if (hasForeignChars(result.text)) {
    const RETRY_PROVIDERS = ['gemini', 'claude', 'openrouter', 'gpt4o'];
    for (const fp of RETRY_PROVIDERS) {
      if (fp === result.provider) continue;
      try {
        const retry = await callAI({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt + '\n\n(IMPORTANT: Write ONLY in Korean. No Chinese, Japanese, Russian, or any other foreign characters.)' },
          ],
          provider: fp,
          maxTokens: 700,
          temperature: 0.7,
          useFallback: false,
        });
        if (retry.text && !hasForeignChars(retry.text)) return retry.text;
      } catch { continue; }
    }
    // 전부 실패하면 외국어 문자 제거 후 반환
    return cleanForeignChars(result.text);
  }

  return result.text;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { productName, price, discountRate, categoryName, platforms, provider, firstReview } = await req.json();

  if (!productName || !platforms?.length)
    return NextResponse.json({ error: '상품명과 플랫폼은 필수입니다' }, { status: 400 });

  const contents: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const platform of platforms as Platform[]) {
    try {
      contents[platform] = await generateContent(
        productName, price || 0, discountRate, categoryName, platform, provider, firstReview,
      );
    } catch (err: unknown) {
      errors[platform] = err instanceof Error ? err.message : String(err);
    }
  }

  if (Object.keys(contents).length === 0) {
    const firstError = Object.values(errors)[0] || 'AI 생성 실패';
    return NextResponse.json({ error: `AI 글 생성 실패: ${firstError}` }, { status: 500 });
  }

  return NextResponse.json({ contents, errors: Object.keys(errors).length ? errors : undefined });
}
