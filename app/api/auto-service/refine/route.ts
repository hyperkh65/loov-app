import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { content, title } = await req.json() as { content: string; title?: string };
  if (!content) return NextResponse.json({ error: '콘텐츠 필요' }, { status: 400 });

  // HTML 태그 제거해서 순수 텍스트만 추출
  const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const prompt = `너는 한국 최고의 카피라이터이자 교열 전문가야.
아래 블로그 글을 실제 사람이 쓴 것처럼 자연스럽게 다시 써줘.

[절대 금지 — AI 티 나는 패턴]
- "또한", "더불어", "아울러", "뿐만 아니라" 등 연결어 남발
- "중요합니다", "필요합니다", "알아보겠습니다" 식의 딱딱한 어미
- "결론적으로", "정리하자면", "종합하면" 등 AI 특유 마무리
- 같은 문장 구조 반복 (예: ~합니다. ~습니다. ~됩니다. 연속)
- 한 단락에 5개 이상 비슷한 길이의 문장
- "~에 대해 알아보겠습니다", "~을 살펴보겠습니다" 형태의 서론

[반드시 적용]
- 구어체 혼용: 짧고 임팩트 있는 문장을 가끔 섞어라
- 독자에게 말 거는 느낌: "그거 알아?", "솔직히 말하면", "이건 진짜 중요한데" 같은 표현
- 문장 길이 변화: 짧은 문장과 긴 문장을 교대로
- 구체적 묘사와 비유 활용 (추상적 표현 피하기)
- 반드시 한국어로만 작성
${title ? `- 글 주제: ${title}` : ''}

[원본 글]
${plainText.slice(0, 6000)}

[출력 규칙]
- HTML 태그 없이 순수 텍스트로 출력
- 단락 구분은 빈 줄(\\n\\n)로
- 원본과 동일한 정보량 유지 (내용 삭제 금지)
- 설명/주석 없이 정제된 글만 출력`;

  try {
    const refined = await generateText(prompt, 'qwen3');
    return NextResponse.json({ refined });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
