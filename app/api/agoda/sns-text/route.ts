import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function callGPT(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI 오류: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGemini(prompt: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(prompt);
  let text = result.response.text();
  text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  return text;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    title: string;
    cityName: string;
    hotels?: { hotelName: string; reviewScore: number; dailyRate: number; discountPercentage: number }[];
    blogUrl?: string;
    travelStyle?: string;
  };

  const { title, cityName, hotels = [], blogUrl = '', travelStyle = '커플' } = body;
  if (!title) return NextResponse.json({ error: '제목이 필요합니다' }, { status: 400 });

  const hotelSummary = hotels.slice(0, 3).map(h =>
    `${h.hotelName} (리뷰 ${h.reviewScore}/10, 1박 ${Math.round(h.dailyRate).toLocaleString('ko-KR')}원${h.discountPercentage > 0 ? ` -${Math.round(h.discountPercentage)}%` : ''})`
  ).join(', ');

  const prompt = `너는 SNS 마케팅 전문가야. 여행 호텔 블로그 포스트를 각 SNS 플랫폼에 맞는 후킹성 멘트로 작성해줘.

블로그 제목: ${title}
여행지: ${cityName}
여행 스타일: ${travelStyle}
호텔 정보: ${hotelSummary || cityName + ' 추천 호텔들'}
블로그 링크: ${blogUrl || '링크 삽입 예정'}

각 플랫폼 특성에 맞게 작성:
- instagram: 감성적이고 이모지 풍부하게, 해시태그 10-15개 포함, 200자 내외
- twitter: 임팩트 있게 짧게, 핵심만, 이모지 2-3개, 280자 이내, 해시태그 3개
- facebook: 친근하고 상세하게, 이모지 적당히, 300자 내외, 해시태그 5개
- threads: 인스타그램보다 덜 형식적, 대화체, 이모지 3-5개, 200자 내외

반드시 아래 JSON만 출력 (마크다운 없이):
{"instagram":"...","twitter":"...","facebook":"...","threads":"..."}`;

  try {
    const openaiKey = await getSetting('OPENAI_API_KEY');
    let text = '';
    if (openaiKey) {
      text = await callGPT(prompt, openaiKey);
    } else {
      text = await callGemini(prompt);
    }

    let parsed: { instagram: string; twitter: string; facebook: string; threads: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return NextResponse.json({ error: 'AI 응답 파싱 실패' }, { status: 500 });
      parsed = JSON.parse(m[0]);
    }

    return NextResponse.json({
      instagram: parsed.instagram || '',
      twitter: parsed.twitter || '',
      facebook: parsed.facebook || '',
      threads: parsed.threads || '',
    });
  } catch (err) {
    console.error('SNS text generate error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
