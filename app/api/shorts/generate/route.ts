import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

// 길이 → 장면 수
const SCENE_MAP: Record<number, number> = { 15: 3, 30: 5, 60: 9, 120: 16, 180: 22 };
const CHARS_PER_SEC = 5.2; // 한국어 자연 발화 속도

const TONE_DESC: Record<string, string> = {
  info:    '친근하고 따뜻한 정보 전달 톤. "어? 이거 진짜야?" 반응 유발. 구체적 예시·수치 활용.',
  fun:     '유쾌하고 밝은 밈/유머 톤. 가벼운 반전과 과장 표현 적극 사용. 시청자가 웃으며 공유하고 싶게.',
  emotion: '감동·공감·진솔함. "내 얘기다"라고 느낄 수 있게. 감정을 담은 표현으로 마음을 움직이게.',
  edu:     '친절한 선생님 톤. 어려운 개념을 쉽게 설명. "첫째..., 둘째..." 구조로 이해하기 쉽게.',
  story:   '스토리텔러 톤. 기승전결 있는 짧은 이야기. 다음 장면이 궁금하게.',
  trend:   '유행·이슈에 빠르게 반응하는 MZ 감성. 신조어 적절히 사용. 함께 반응하는 느낌.',
};

const PLATFORM_TIPS: Record<string, string> = {
  youtube:  '첫 3초에 이 영상을 봐야 하는 이유 명확히. 마지막은 구독·좋아요 유도.',
  naver:    '검색 키워드 자연스럽게 포함. 실용적이고 친근하게. 정보 신뢰도 강조.',
  instagram:'감성적이고 비주얼 강한 표현. 저장하고 싶게. 해시태그 친화적 마무리.',
  tiktok:   '처음 1초부터 바로 본론. 빠른 전개. 댓글 유도하는 질문으로 마무리.',
};

function buildPrompt(
  topic: string, duration: number, tone: string, platform: string,
  character?: { enabled: boolean; name: string; emoji: string; personality: string }
): string {
  const numScenes = SCENE_MAP[duration] ?? 9;
  const toneDesc = TONE_DESC[tone] ?? TONE_DESC.info;
  const platformTip = PLATFORM_TIPS[platform] ?? PLATFORM_TIPS.youtube;

  // 장면별 초 배분 (훅 짧게, 중간 길게, 마무리 중간)
  const sceneDurations: number[] = [];
  for (let i = 0; i < numScenes; i++) {
    if (i === 0) sceneDurations.push(Math.max(4, Math.round(duration * 0.12)));
    else if (i === numScenes - 1) sceneDurations.push(Math.max(4, Math.round(duration * 0.10)));
    else sceneDurations.push(Math.max(5, Math.round((duration - sceneDurations[0] - Math.round(duration * 0.10)) / (numScenes - 2))));
  }
  const total = sceneDurations.reduce((a, b) => a + b, 0);
  if (total !== duration) sceneDurations[Math.floor(numScenes / 2)] += (duration - total);

  const characterBlock = character?.enabled ? `
[캐릭터 설정]
이름: ${character.name} (${character.emoji}) / 성격: ${character.personality}
- 나레이션은 이 캐릭터가 시청자에게 직접 말하는 1인칭 구어체로 작성
- 중간 장면 1~2개에서 캐릭터가 등장해 설명하는 구성 포함
- 캐릭터 등장 장면은 "character_appears": true 추가
` : '';

  const lengthGuide = sceneDurations.map((sec, i) =>
    `   장면 ${i+1} (${sec}초): ${Math.round(sec * CHARS_PER_SEC)}~${Math.round(sec * 6.5)}글자`
  ).join('\n');

  const sceneTemplate = sceneDurations.map((sec, i) =>
    `{"id":${i+1},"duration":${sec},"narration":"(${Math.round(sec*CHARS_PER_SEC)}글자이상 구어체)","subtitle":"12자이내","image_query":"english keywords","dalle_prompt":"vertical cinematic scene, no text","image_url":"","image_source":"pixabay"${character?.enabled && (i===1||i===Math.floor(numScenes/2))?',"character_appears":true':''}}`
  ).join(',\n    ');

  return `당신은 한국 최고의 숏폼 영상 작가입니다. 시청자가 끝까지 보게 만드는 생생하고 자연스러운 스크립트를 씁니다.

[주제]
${topic}

[제작 조건]
- 플랫폼: ${platform} / ${platformTip}
- 영상 길이: ${duration}초 / 총 ${numScenes}장면
- 톤: ${toneDesc}
${characterBlock}

[핵심 규칙]
1. 나레이션 = 실제 사람이 친구에게 말하는 구어체 (문어체·딱딱한 표현 절대 금지)
   ✅ "야, 이거 진짜 몰랐지? 나도 최근에 알았는데 완전 충격이었어."
   ✅ "솔직히 말할게. 나도 처음엔 이게 이렇게 중요한 줄 몰랐거든."
   ❌ "오늘은 ~에 대해 알아보겠습니다." (절대 금지)
   ❌ "안녕하세요 여러분, 오늘은~" (절대 금지)

2. 나레이션 글자 수 반드시 준수:
${lengthGuide}

3. 첫 장면: 질문·반전·공감 중 하나로 강렬 오프닝 (시청자가 멈추게)
4. 중간: 구체적 정보·감정·스토리를 자연스럽게 연결 (끊기지 않게)
5. 마지막: 핵심 메시지 + 행동 유도 자연스럽게 녹이기
6. subtitle: 12자 이내 임팩트 단어/문구 (그 장면의 핵심)
7. image_query: Pixabay/Pexels 영어 2~3단어 (분위기·상황)
8. dalle_prompt: 세로형 배경 영어 묘사 (no text, no people, cinematic quality)

JSON만 출력 (설명 없이):
{
  "title": "SEO 최적화 제목 40자이내",
  "description": "영상설명 2~3줄 + 해시태그 5개",
  "hook": "썸네일 강렬 문구",
  "scenes": [
    ${sceneTemplate}
  ]
}`;
}

async function callAI(prompt: string, apiKey: string, provider: string): Promise<string> {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const d = await res.json();
    return d.content?.[0]?.text ?? '';
  }
  if (provider === 'gpt4o' || provider === 'gpt4' || provider === 'gpt35') {
    const model = provider === 'gpt4o' ? 'gpt-4o-mini' : 'gpt-3.5-turbo';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
    });
    const d = await res.json();
    return d.choices?.[0]?.message?.content ?? '';
  }
  // Gemini Flash (기본)
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4000 },
  });
  const result = await geminiModel.generateContent(prompt);
  return result.response.text();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const body = await req.json() as {
      topic: string; duration: number; tone: string; platform: string;
      provider?: string; apiKey?: string;
      character?: { enabled: boolean; name: string; emoji: string; personality: string };
    };

    const provider = body.provider ?? 'gemini';
    const apiKey = body.apiKey || await getSetting(
      provider === 'claude' ? 'CLAUDE_API_KEY' :
      provider.startsWith('gpt') ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'
    );
    if (!apiKey) return NextResponse.json({ error: 'AI API 키가 없습니다. 설정 > API 키에서 등록하세요.' }, { status: 400 });

    const prompt = buildPrompt(body.topic, body.duration ?? 60, body.tone ?? 'info', body.platform ?? 'youtube', body.character);
    const raw = await callAI(prompt, apiKey, provider);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: '스크립트 생성 실패. 다시 시도해주세요.' }, { status: 500 });

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (e) {
    console.error('shorts/generate:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
