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

  const prompt = `아래 블로그 글의 제목과 요약을 보고, SNS(Threads)에 올릴 후킹 멘트를 작성해.

제목: ${title}
요약: ${excerpt?.slice(0, 400) || ''}

[스타일 가이드 — 아래 예시를 참고해서 비슷한 느낌으로]
예시1:
국물 마니아들 필독. 짠 음식 계속 먹으면 혈압만 오르는 게 아니라 뇌까지 망가질 수 있다? 🧠

매번 건강검진 때마다 듣는 "짜게 먹지 말라"는 잔소리, 그냥 혈압 좀 오르는 정도로 가볍게 넘겼다간 큰코다쳐. 최근 연구에 따르면 나트륨 과다 섭취가 단순히 혈관 문제를 넘어 뇌 염증과 면역 반응까지 직격타를 날릴 수 있다는 충격적인 사실이 밝혀졌거든.

예시2:
월급은 그대로인데 지출이 자꾸 늘어나는 이유, 사실 이거 하나 때문이었다 💸

가계부 써도 소용없고 절약한다고 생각했는데 통장은 왜 항상 텅텅 비는 걸까. 소비 심리 연구자들이 찾아낸 진짜 원인은 의지력 문제가 아니라 환경 설계의 문제였어.

[작성 규칙]
1. 반드시 한국어로만 작성
2. 첫 줄: 제목/요약의 핵심 사실을 직접 언급하며 툭 던지는 한 문장 + 이모지 1개
3. 빈 줄 하나
4. 2~3줄: 요약에 있는 실제 내용을 구어체로 풀어써 — 절대 새로운 사실 지어내지 말 것
5. URL, "확인해보세요", "지금 바로", "클릭" 같은 광고성 표현 절대 금지
6. 이모지는 첫 줄에만 1개
7. 친구한테 카톡으로 "야 이거 봐봐" 하는 느낌의 구어체

후킹 멘트만 출력 (설명, 제목 없이 본문만):`;

  try {
    const hook = await generateText(prompt, 'qwen3');
    if (hook?.trim()) return NextResponse.json({ hook: hook.trim() });
    return NextResponse.json({ error: '빈 응답' }, { status: 500 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
