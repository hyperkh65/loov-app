import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const CATEGORIES = ['트렌드', '전략', '마케팅', '재무', '도구', '사례'];

async function generateWithAI(apiKey: string, provider: string): Promise<Array<{ title: string; summary: string; content: string; category: string; tags: string[] }>> {
  const today = new Date().toLocaleDateString('ko-KR');
  const prompt = `오늘(${today}) 1인 기업가와 소상공인을 위한 AI 비즈니스 인사이트 5개를 생성해주세요.

각 인사이트는 다음 JSON 형식으로 작성해주세요:
[
  {
    "title": "인사이트 제목 (20자 이내)",
    "summary": "핵심 요약 (100자 이내)",
    "content": "상세 내용 (300자 이내)",
    "category": "${CATEGORIES.join('|')} 중 하나",
    "tags": ["태그1", "태그2", "태그3"]
  }
]

최신 AI 트렌드, 실용적인 비즈니스 전략, 실제 사례를 포함해주세요.
JSON 배열만 반환해주세요.`;

  let text = '';

  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    text = data.content?.[0]?.text || '';
  } else if (provider === 'gpt4o' || provider === 'gpt4' || provider === 'gpt35') {
    const model = provider === 'gpt4o' ? 'gpt-4o' : provider === 'gpt4' ? 'gpt-4-turbo' : 'gpt-3.5-turbo';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
      }),
    });
    const data = await res.json();
    text = data.choices?.[0]?.message?.content || '';
  } else {
    // Gemini
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await geminiModel.generateContent(prompt);
    text = result.response.text();
  }

  // JSON 파싱
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI 응답에서 JSON을 파싱할 수 없습니다');
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { apiKey, provider = 'gemini' } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 필요합니다' }, { status: 400 });
    }

    const insights = await generateWithAI(apiKey, provider);

    // DB에 저장
    const { data, error } = await supabase
      .from('bossai_insights')
      .insert(insights.map((ins) => ({
        title: ins.title,
        summary: ins.summary,
        content: ins.content,
        category: ins.category,
        tags: ins.tags,
        source: 'ai',
        is_public: true,
      })))
      .select();

    if (error) throw error;

    return NextResponse.json({ insights: data, count: data?.length });
  } catch (error) {
    console.error('Insight generate error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
