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
    blogUrls?: string[];   // 발행된 블로그 URL 목록 (blogger, wordpress 등)
    travelStyle?: string;
  };

  const { title, cityName, hotels = [], blogUrls = [], travelStyle = '커플' } = body;
  if (!title) return NextResponse.json({ error: '제목이 필요합니다' }, { status: 400 });

  const hotelSummary = hotels.slice(0, 3).map(h =>
    `${h.hotelName} (리뷰 ${h.reviewScore}/10, 1박 ${Math.round(h.dailyRate).toLocaleString('ko-KR')}원${h.discountPercentage > 0 ? ` -${Math.round(h.discountPercentage)}%` : ''})`
  ).join(', ');

  // 블로그 URL 정보
  const urlNote = blogUrls.length > 0
    ? `발행된 블로그 URL: ${blogUrls.join(', ')}`
    : '블로그 URL: (발행 후 추가 예정)';
  const primaryUrl = blogUrls[0] || '';

  const prompt = `너는 SNS 마케팅 전문가야. 여행 호텔 블로그 포스트를 각 SNS 플랫폼에 맞는 후킹성 멘트로 작성해줘.

블로그 제목: ${title}
여행지: ${cityName}
여행 스타일: ${travelStyle}
호텔 정보: ${hotelSummary || cityName + ' 추천 호텔들'}
${urlNote}

[플랫폼별 작성 규칙]
- instagram: 감성적이고 이모지 풍부하게, 해시태그 10-15개 포함, 200자 내외. URL은 "🔗 링크 : ${primaryUrl || '프로필링크 참조'}" 형태로 해시태그 앞에 추가
- twitter: 임팩트 있고 짧게, 이모지 2-3개, 240자 이내. 본문 마지막에 URL 직접 포함 (${primaryUrl || '링크'})
- facebook: 친근하고 상세하게, 이모지 적당히, 250자 내외. 본문 중간 자연스럽게 "👉 자세히 보기: ${primaryUrl || '링크'}" 포함
- threads: 후킹성 텍스트만 200자 내외, URL 없이 (URL은 별도 댓글로 추가됨). 이모지 3-5개, 대화체

반드시 아래 JSON만 출력 (마크다운 없이):
{"instagram":"...","twitter":"...","facebook":"...","threads":"...","threadsUrl":"${primaryUrl}"}`;

  try {
    const openaiKey = await getSetting('OPENAI_API_KEY');
    let text = '';
    if (openaiKey) {
      text = await callGPT(prompt, openaiKey);
    } else {
      text = await callGemini(prompt);
    }

    let parsed: { instagram: string; twitter: string; facebook: string; threads: string; threadsUrl?: string };
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
      threadsUrl: primaryUrl,
    });
  } catch (err) {
    console.error('SNS text generate error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
