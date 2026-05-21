import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, excerpt } = await req.json() as { title: string; excerpt?: string };
  if (!title?.trim()) return NextResponse.json({ error: 'title 필요' }, { status: 400 });

  const prompt = `당신은 SNS 콘텐츠 전문가입니다. 아래 블로그 글을 SNS에 공유할 때 사람들이 클릭하고 싶게 만드는 후킹 멘트를 작성하세요.

제목: ${title}
요약: ${excerpt?.slice(0, 300) || ''}

[작성 규칙]
1. 반드시 한국어로만 작성
2. 총 3~5줄, 줄당 30~60자 내외
3. 첫 줄: 강한 궁금증 유발 또는 공감을 끌어내는 문장 (숫자나 반전 포함 가능)
4. 중간: 이 글을 읽어야 하는 이유 1~2줄
5. 마지막 줄: 행동 유발 문장 ("링크에서 확인하세요" 같은 직접적 표현은 금지, 대신 자연스럽게 호기심 자극)
6. 이모지 2~3개 자연스럽게 배치
7. URL은 절대 포함 금지
8. 광고 느낌 금지 — 친근하고 솔직한 Threads 감성으로

후킹 멘트만 출력 (제목, 따옴표, 설명 없이 본문만):`;

  try {
    const hook = await generateText(prompt, 'qwen3');
    if (hook?.trim()) return NextResponse.json({ hook: hook.trim() });
    return NextResponse.json({ error: '빈 응답' }, { status: 500 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
