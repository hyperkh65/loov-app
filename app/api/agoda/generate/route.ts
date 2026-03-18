import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface AgodaHotel {
  hotelId: number;
  hotelName: string;
  starRating: number;
  reviewScore: number;
  reviewCount: number;
  currency: string;
  dailyRate: number;
  crossedOutRate: number;
  discountPercentage: number;
  imageURL: string;
  landingURL: string;
  includeBreakfast: boolean;
  freeWifi: boolean;
}

async function callGPT(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI 오류 (${res.status}): ${await res.text()}`);
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
    cityName: string;
    cityNameKo: string;
    hotels: AgodaHotel[];
    checkIn: string;
    checkOut: string;
    travelStyle?: string; // '커플' | '가족' | '혼자' | '친구'
  };

  const { cityName, cityNameKo, hotels, checkIn, checkOut, travelStyle = '커플' } = body;
  if (!hotels?.length) return NextResponse.json({ error: '호텔 데이터 필요' }, { status: 400 });

  // Top 5 hotels for blog content
  const topHotels = hotels.slice(0, 5);

  // 가격 포맷
  const formatPrice = (p: number) => p > 0 ? `${Math.round(p).toLocaleString('ko-KR')}원` : '';

  const hotelList = topHotels.map((h, i) => {
    const discount = h.discountPercentage > 0 ? ` (${Math.round(h.discountPercentage)}% 할인)` : '';
    const amenities = [h.freeWifi ? '무료 와이파이' : '', h.includeBreakfast ? '조식 포함' : ''].filter(Boolean).join(', ');
    const originalPrice = h.crossedOutRate > 0 ? `원가 ${formatPrice(h.crossedOutRate)} →` : '';
    return `${i + 1}. ${h.hotelName}
   - 별점: ⭐ ${h.starRating}성급 | 리뷰: ${h.reviewScore}/10 (${h.reviewCount.toLocaleString()}개 리뷰)
   - 가격: ${originalPrice} 1박 ${formatPrice(h.dailyRate)}${discount}
   - 편의시설: ${amenities || '없음'}
   - 예약링크: ${h.landingURL}`;
  }).join('\n\n');

  const jsonRule = `\n반드시 아래 JSON만 출력 (마크다운/코드블록 없이):
{"title":"SEO제목(60자이내)","content":"HTML본문","metaDescription":"메타설명150자이내","labels":["태그1","태그2","태그3"]}`;

  const prompt = `너는 여행 전문 블로거야. ${travelStyle} 여행자 관점에서 "${cityNameKo || cityName}" 여행 호텔 추천 글을 자연스러운 후기 형식으로 써줘.

[호텔 데이터 - 아고다 제휴]
${hotelList}

[글쓰기 규칙]
- 제목: "${cityNameKo} 호텔 추천", "가성비 숙소", "후기" 키워드 포함한 SEO 제목
- 본문: 최소 2000자, HTML 형식 (h2/h3/p/ul/li/a 태그 사용)
- 글 구성:
  * 도입: ${cityNameKo}에 대한 감성적 소개 + 여행 설레임
  * 호텔 소개: 각 호텔을 h3으로 섹션 구분, 특징/위치/분위기 상세 묘사
  * 가격 및 예약: 각 호텔 가격 자연스럽게 언급 + 아고다 예약 링크 삽입
  * 여행 팁: ${cityNameKo} 여행 실용 팁 2-3가지
  * 마무리: 여행 기대감 고조 + 예약 CTA
- 각 호텔 링크는 <a href="예약링크" target="_blank" rel="noopener noreferrer" style="color:#f97316;font-weight:bold;text-decoration:underline">아고다에서 예약하기</a> 형식으로 자연스럽게 삽입
- 리뷰 점수와 가격을 신뢰감 있게 활용
- "광고", "협찬", "제공받았습니다" 절대 사용 금지
- 실제 여행한 것처럼 생생하고 자연스럽게
- 체크인: ${checkIn}, 체크아웃: ${checkOut} 날짜 기준 가격임을 자연스럽게 언급${jsonRule}`;

  try {
    const openaiKey = await getSetting('OPENAI_API_KEY');
    let text = '';
    if (openaiKey) {
      text = await callGPT(prompt, openaiKey);
    } else {
      text = await callGemini(prompt);
    }

    let parsed: { title: string; content: string; metaDescription: string; labels: string[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return NextResponse.json({ error: 'AI 응답 파싱 실패', raw: text.slice(0, 300) }, { status: 500 });
      parsed = JSON.parse(m[0]);
    }

    return NextResponse.json({
      title: parsed.title || '',
      content: parsed.content || '',
      metaDescription: parsed.metaDescription || '',
      labels: Array.isArray(parsed.labels) ? parsed.labels : [],
    });
  } catch (err) {
    console.error('Agoda generate error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
