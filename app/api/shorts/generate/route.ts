import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';

const SCENE_COUNTS: Record<number, number> = { 15: 4, 30: 6, 60: 10 };

const TONE_DESC: Record<string, string> = {
  info:    '친근하고 명쾌하게 정보 전달. 짧고 임팩트 있게.',
  fun:     '유머와 재미 위주. 가볍고 밝게, 반전 있으면 좋음.',
  emotion: '감동·공감 위주. 따뜻하고 진솔하게.',
  edu:     '교육·튜토리얼. 단계별 설명, 쉬운 말로.',
};

function buildPrompt(topic: string, duration: number, tone: string): string {
  const scenes = SCENE_COUNTS[duration] ?? 6;
  const toneDesc = TONE_DESC[tone] ?? TONE_DESC.info;
  const secPerScene = Math.floor(duration / scenes);

  return `유튜브 숏폼 스크립트를 만들어줘.

주제: ${topic}
길이: ${duration}초 (장면 ${scenes}개, 장면당 약 ${secPerScene}초)
톤: ${toneDesc}

규칙:
- 나레이션은 자연스러운 구어체 한국어 (AI 느낌 절대 금지)
- 자막은 핵심 단어만 10자 이내로
- image_query는 Pixabay 검색용 영어 1~3단어
- duration은 각 장면 초(숫자)
- 훅(첫 장면)이 강렬해야 함

다음 JSON만 출력 (설명 없이):
{
  "title": "영상 제목 (30자 이내)",
  "scenes": [
    {
      "id": 1,
      "duration": ${secPerScene},
      "narration": "나레이션 텍스트",
      "subtitle": "자막 (10자 이내)",
      "image_query": "english keywords",
      "image_url": ""
    }
  ]
}`;
}

async function callAI(prompt: string, apiKey: string, provider: string): Promise<string> {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    });
    const d = await res.json();
    return d.content?.[0]?.text ?? '';
  }
  if (provider === 'gpt4o' || provider === 'gpt4' || provider === 'gpt35') {
    const model = provider === 'gpt4o' ? 'gpt-4o-mini' : 'gpt-3.5-turbo';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 2000 }),
    });
    const d = await res.json();
    return d.choices?.[0]?.message?.content ?? '';
  }
  // Gemini Flash (기본 - 가장 저렴)
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await geminiModel.generateContent(prompt);
  return result.response.text();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

    const body = await req.json() as {
      topic: string; duration: number; tone: string;
      provider?: string; apiKey?: string;
    };

    const provider = body.provider ?? 'gemini';
    const apiKey = body.apiKey || await getSetting(
      provider === 'claude' ? 'CLAUDE_API_KEY' :
      (provider.startsWith('gpt') ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY')
    );
    if (!apiKey) return NextResponse.json({ error: 'API 키가 없습니다. 설정에서 등록해주세요.' }, { status: 400 });

    const prompt = buildPrompt(body.topic, body.duration, body.tone);
    const raw = await callAI(prompt, apiKey, provider);

    // JSON 파싱
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: '스크립트 생성 실패. 다시 시도해주세요.' }, { status: 500 });

    const parsed = JSON.parse(jsonMatch[0]) as {
      title: string;
      scenes: { id: number; duration: number; narration: string; subtitle: string; image_query: string; image_url: string }[];
    };

    return NextResponse.json(parsed);
  } catch (e) {
    console.error('shorts/generate:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
