import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

// 길이 → 장면 수
const SCENE_MAP: Record<number, number> = { 15: 3, 30: 5, 60: 9, 120: 16, 180: 22 };
const CHARS_PER_SEC = 9.5;  // 한국어 숏폼 발화 속도 (빠른 나레이션 기준)
const CHARS_MAX_SEC = 12.0; // 최대 (매우 빠른 숏폼)

const TONE_FORMULA: Record<string, string> = {
  info: `[정보형 바이럴 공식]
• 오프닝: "99%가 모르는 사실" / "전문가들이 숨긴 진실" / "이거 알면 인생 달라짐"
• 전개: 구체적 수치·사례·비교로 신뢰감 + 충격 동시 제공
• 마무리: "이미 아는 사람들은 조용히 활용 중이야"`,

  fun: `[코믹·밈 바이럴 공식]
• 오프닝: 황당한 상황 묘사 or 공감 100% 짜증 상황으로 시작
• 전개: 반전 → 더 큰 반전 → 예상 못한 결말 구조
• 마무리: 댓글 싸움 유발하는 선택지 or 공감 요청`,

  emotion: `[감동·공감 바이럴 공식]
• 오프닝: "살면서 이런 경험 있었어?" / 공감 상황으로 마음의 문 열기
• 전개: 디테일한 감정 묘사 → "나만 이런 거 아니었구나" 안도감
• 마무리: 따뜻한 위로 or 행동 변화 유도 (저장 유도)`,

  edu: `[교육형 바이럴 공식]
• 오프닝: "학교에서 안 가르쳐 준 것" / "이거 모르면 손해"
• 전개: 1→2→3 단계 구조, 각 단계마다 "이게 핵심이야" 강조
• 마무리: 한 줄 요약 + "저장해두면 나중에 써먹을 수 있어"`,

  story: `[스토리텔링 바이럴 공식]
• 오프닝: 결말의 충격적 한 줄 먼저 공개 ("그래서 나는 결국...")
• 전개: 시간 역순 or 기승전결, 각 씬이 클리프행어로 끝나야 함
• 마무리: 반전 또는 교훈 + 시청자 경험 묻기`,

  trend: `[트렌드·이슈 바이럴 공식]
• 오프닝: 지금 당장 화제인 키워드 + "이거 봤어?" 형식
• 전개: MZ 감성 + 신조어 자연스럽게 + "우리만 아는 거" 느낌
• 마무리: "댓글에 의견 적어줘" / "링크 저장해" (참여 유도)`,
};

const PLATFORM_HOOK: Record<string, string> = {
  youtube:  '첫 3초: "이 영상 끝까지 보면 [구체적 혜택]" 명시. 마지막: 구독·좋아요를 억지로 말하지 말고 자연스럽게 스토리에 녹이기.',
  naver:    '검색 키워드(제목 주제어)를 자연스럽게 나레이션에 2회 이상 포함. "내 블로그에 더 자세히 정리해뒀어"로 마무리.',
  instagram:'감각적·감성적 표현 위주. "저장하고 나중에 써먹어" 유도. 해시태그 대신 감성 키워드로 마무리.',
  tiktok:   '첫 1초: 바로 본론. "끝까지 보면 알아"로 시청 지속 유도. "댓글에 [A] or [B] 달아줘"로 참여 폭발.',
};

function buildPrompt(
  topic: string, duration: number, tone: string, platform: string,
  character?: { enabled: boolean; name: string; emoji: string; personality: string }
): string {
  const numScenes = SCENE_MAP[duration] ?? 9;
  const formula = TONE_FORMULA[tone] ?? TONE_FORMULA.info;
  const platformHook = PLATFORM_HOOK[platform] ?? PLATFORM_HOOK.youtube;

  // 장면별 초 배분 — 훅(짧게) / 전개(골고루) / 마무리(중간)
  const sceneDurations: number[] = [];
  for (let i = 0; i < numScenes; i++) {
    if (i === 0) sceneDurations.push(Math.max(3, Math.round(duration * 0.10)));
    else if (i === numScenes - 1) sceneDurations.push(Math.max(4, Math.round(duration * 0.10)));
    else sceneDurations.push(Math.max(4, Math.round((duration - sceneDurations[0] - Math.round(duration * 0.10)) / (numScenes - 2))));
  }
  const total = sceneDurations.reduce((a, b) => a + b, 0);
  if (total !== duration) sceneDurations[Math.floor(numScenes / 2)] += (duration - total);

  const characterBlock = character?.enabled ? `
━━━━━ 캐릭터 설정 ━━━━━
이름: ${character.name} (${character.emoji}) / 성격: ${character.personality}
- 나레이션은 이 캐릭터가 직접 말하는 1인칭 친구 구어체
- 중간 장면 1~2개에 "character_appears": true 추가
━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const lengthGuide = sceneDurations.map((sec, i) => {
    const minChar = Math.round(sec * CHARS_PER_SEC);
    const maxChar = Math.round(sec * CHARS_MAX_SEC);
    const role = i === 0 ? '🔥 HOOK — 멈추게 만드는 한 방' : i === numScenes - 1 ? '🎯 PAYOFF — 기억에 남는 마무리' : `📌 전개 ${i} — 궁금증 심화 + 클리프행어`;
    return `  장면 ${i+1} [${sec}초] ${role}\n    → 나레이션: 최소 ${minChar}자 / 목표 ${Math.round(sec*10.5)}자 (침묵 0초, 빼곡히 채울 것)`;
  }).join('\n');

  const sceneTemplate = sceneDurations.map((sec, i) =>
    `{"id":${i+1},"duration":${sec},"narration":"(최소 ${Math.round(sec*CHARS_PER_SEC)}자, 빠른 구어체로 빽빽하게)","subtitle":"10자이내 핵심어","image_query":"2~3 english words","dalle_prompt":"vertical 9:16 cinematic, no text, no face"${character?.enabled && (i===1||i===Math.floor(numScenes/2))?',"character_appears":true':''}}`
  ).join(',\n    ');

  return `당신은 대한민국 최고의 숏폼 바이럴 콘텐츠 크리에이터입니다.
틱톡·유튜브 쇼츠에서 수백만 조회수를 만든 공식을 완벽히 알고 있습니다.
출력은 반드시 유효한 JSON만, 코드블록이나 설명 없이 출력합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[주제 및 소재]
${topic}

[영상 스펙]
• 플랫폼: ${platform} | ${platformHook}
• 총 길이: ${duration}초 / ${numScenes}개 장면
${characterBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[바이럴 공식 — 반드시 이 구조로]
${formula}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[나레이션 황금률]
🔴 핵심: 나레이션은 영상 내내 쉬지 않고 계속 나와야 한다. 침묵 = 시청자 이탈.
   각 씬의 duration(초) × 9.5자 이상을 반드시 채울 것. 모자라면 실패한 스크립트임.

✅ 친구에게 카톡 음성메시지 보내듯 → "야", "근데", "솔직히", "이게 뭔말이냐면", "진짜임"
✅ 빠르고 리드미컬하게 → 숨 쉬듯 이어지는 문장들, 끊김 없이
✅ 숫자/퍼센트/구체적 사례 → 신뢰 + 충격 (예: "3개월 만에 37만원", "10명 중 8명이")
✅ 각 씬 끝: 다음 씬이 보고 싶게 만드는 클리프행어 ("근데 여기서 반전이 있어", "그런데 이게 전부가 아니야")
✅ 마지막 씬: 저장·공유·댓글 자연스럽게 유도

❌ 절대 금지: 나레이션이 짧아서 씬 중간에 침묵이 생기는 것 (가장 치명적 오류)
❌ 절대 금지: "안녕하세요", "오늘은 ~에 대해 알아보겠습니다", "이상으로", "감사합니다"
❌ 절대 금지: 문어체·강의체·뉴스 앵커 톤
❌ 절대 금지: 두루뭉술한 표현 — "좋아요", "중요해요" 같은 알맹이 없는 문장

[나레이션 밀도 예시]
씬 길이 6초라면 최소 57자, 아래처럼 빽빽하게:
"야 이거 진짜야? 나도 처음엔 말도 안 된다고 했거든. 근데 직접 해보니까 완전 달라. 이게 핵심이야."
(57자 — 이 정도 밀도가 정상. 이보다 짧으면 다시 써야 함)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[장면별 나레이션 최소 글자 수 — 반드시 채워야 함, 모자라면 TTS 침묵 발생]
${lengthGuide}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JSON 형식 (이것만 출력):
{
  "title": "클릭 안 하면 손해인 제목 (숫자·감정 포함, 40자 이내)",
  "description": "SEO 설명 2~3줄 + 관련 해시태그 5개",
  "hook": "썸네일 문구 — 궁금증 폭발, 15자 이내",
  "scenes": [
    ${sceneTemplate}
  ]
}`;
}

// GPT용 시스템 프롬프트
const GPT_SYSTEM = '당신은 대한민국 최고의 숏폼 바이럴 콘텐츠 크리에이터입니다. 시청자가 첫 3초에 멈추고, 끝까지 보고, 공유하게 만드는 스크립트를 씁니다. 반드시 유효한 JSON만 출력하며, 코드블록이나 추가 설명은 절대 포함하지 않습니다.';

async function callAI(prompt: string, apiKey: string, provider: string): Promise<string> {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: GPT_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const d = await res.json();
    return d.content?.[0]?.text ?? '';
  }
  if (provider === 'gpt4o' || provider === 'gpt4' || provider === 'gpt35') {
    const model = provider === 'gpt4o' ? 'gpt-4o'
      : provider === 'gpt4' ? 'gpt-4-turbo'
      : 'gpt-3.5-turbo';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: GPT_SYSTEM },
          { role: 'user', content: prompt },
        ],
        max_tokens: 4000,
        temperature: 0.85,
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
    systemInstruction: GPT_SYSTEM,
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
