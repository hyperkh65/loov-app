import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

// 길이 → 장면 수 (6~9초/장면)
const SCENE_MAP: Record<number, number> = {
  15: 3, 30: 5, 60: 8, 120: 15, 180: 20,
};

const TONE_DESC: Record<string, string> = {
  info:    '친근하고 명쾌한 정보 전달. 짧고 임팩트 있게. "어? 이거 몰랐지?" 느낌.',
  fun:     '유머·밈·반전 위주. 가볍고 밝게. 예상 못한 반전으로 끝내면 좋음.',
  emotion: '감동·공감·진솔함. 따뜻하게. 시청자가 "내 얘기다"라고 느끼게.',
  edu:     '단계별 교육. 쉬운 말로 설명. "1단계... 2단계..." 구조가 효과적.',
  story:   '스토리텔링. 기승전결이 있는 짧은 이야기. 몰입감 있게.',
  trend:   '최신 트렌드·이슈 반응. 빠르고 핫한 톤. 시청자와 함께 반응하는 느낌.',
};

const PLATFORM_TIPS: Record<string, string> = {
  youtube:  '첫 3초 훅이 핵심. 자막 필수. 마지막에 "구독"·"좋아요" 유도.',
  naver:    '네이버 클립 특성상 검색 최적화 키워드 포함. 친근하고 실용적.',
  instagram:'감성·비주얼 위주. 트렌디한 톤. 저장·공유 유도로 끝내기.',
  tiktok:   '처음부터 빠른 전개. 음악 연동 고려. MZ세대 감성.',
};

function buildPrompt(topic: string, duration: number, tone: string, platform: string): string {
  const numScenes = SCENE_MAP[duration] ?? 8;
  const secPerScene = Math.round(duration / numScenes);
  const toneDesc = TONE_DESC[tone] ?? TONE_DESC.info;
  const platformTip = PLATFORM_TIPS[platform] ?? PLATFORM_TIPS.youtube;

  return `유튜브 숏폼 스크립트 작성 전문가로서, 아래 조건에 맞는 스크립트를 만들어줘.

주제: ${topic}
플랫폼: ${platform} (${platformTip})
길이: ${duration}초 (총 ${numScenes}장면, 장면당 약 ${secPerScene}초)
톤·스타일: ${toneDesc}

절대 규칙:
1. 나레이션은 자연스러운 구어체 한국어 (AI 느낌, 딱딱한 문어체 금지)
2. 첫 장면 나레이션은 3초 안에 시청자를 잡는 강력한 훅
3. 자막(subtitle)은 핵심 단어만 15자 이내 (임팩트 있게)
4. image_query는 Pixabay·Pexels 검색용 영어 2~3단어
5. dalle_prompt는 DALL-E 이미지 생성용 (세로형, 배경 이미지, 텍스트 없음)
6. 나레이션 길이는 각 duration에 맞게 (1초 ≈ 3~4글자)

다음 JSON만 출력 (다른 텍스트 없이):
{
  "title": "영상 제목 (SEO 최적화, 40자 이내)",
  "description": "영상 설명 (2-3줄, 해시태그 3개 포함)",
  "hook": "썸네일용 한 줄 문구",
  "scenes": [
    {
      "id": 1,
      "duration": ${secPerScene},
      "narration": "나레이션 텍스트",
      "subtitle": "자막",
      "image_query": "english search keywords",
      "dalle_prompt": "cinematic vertical background: [영어로 구체적 묘사], no text, photorealistic",
      "image_url": "",
      "image_source": "pixabay"
    }
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
    };

    const provider = body.provider ?? 'gemini';
    const apiKey = body.apiKey || await getSetting(
      provider === 'claude' ? 'CLAUDE_API_KEY' :
      provider.startsWith('gpt') ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'
    );
    if (!apiKey) return NextResponse.json({ error: 'AI API 키가 없습니다. 설정 > API 키에서 등록하세요.' }, { status: 400 });

    const prompt = buildPrompt(body.topic, body.duration ?? 30, body.tone ?? 'info', body.platform ?? 'youtube');
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
