import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSetting } from '@/lib/get-setting';

interface CoupangProduct {
  productName: string;
  productPrice: number;
  productUrl: string;
  productImage?: string;
}

async function callGPT(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
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
    keyword: string;
    contentType: 'product' | 'info';
    productInfo?: string;
    coupangProducts?: CoupangProduct[];
    notionContent?: string;
    featuredImage?: string;
  };

  const { keyword, contentType, productInfo, coupangProducts, notionContent, featuredImage } = body;
  if (!keyword) return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });

  // 대표 이미지 HTML
  const imageHtml = featuredImage
    ? `<div style="text-align:center;margin:0 0 2em"><img src="${featuredImage}" alt="${keyword}" style="max-width:100%;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15)"></div>\n`
    : '';

  // 쿠팡 상품 컨텍스트
  let productContext = productInfo ? `\n상품 추가 정보: ${productInfo}` : '';
  if (coupangProducts?.length) {
    productContext += '\n\n쿠팡 파트너스 상품 목록:\n';
    productContext += coupangProducts.map(p =>
      `- 상품명: ${p.productName} | 가격: ${p.productPrice.toLocaleString()}원 | 링크: ${p.productUrl}`
    ).join('\n');
    productContext += '\n\n각 상품 링크는 반드시 HTML에서 <a href="링크" target="_blank" rel="noopener noreferrer" style="color:#e53e3e;font-weight:bold;text-decoration:underline">상품명</a> 형식으로 삽입.';
  }

  // 노션 컨텍스트
  const notionContext = notionContent
    ? `\n\n[참고 자료 - 아래 내용을 바탕으로 확장하여 블로그 글 작성]\n${notionContent.slice(0, 3000)}`
    : '';

  const jsonRule = `\n반드시 아래 JSON만 출력 (마크다운/코드블록 없이):\n{"title":"SEO제목(60자이내)","content":"HTML본문","metaDescription":"메타설명150자이내","labels":["태그1","태그2","태그3"]}`;

  const productPrompt = `너는 쿠팡 파트너스 수익형 블로그 전문 마케터야. "${keyword}"에 대한 수익성 높은 구매 유도 글을 써줘.${productContext}

작성 규칙:
- 제목: "추천", "순위", "비교", "가성비" 키워드 활용한 클릭유도형 SEO 제목
- 본문: 최소 1500자, HTML 형식(h2/h3/p/ul/a 사용)
- 구성: 도입(공감) → 상품 소개(장점+사용상황) → 가격/스펙 비교 → 구매 CTA
- 쿠팡 상품 링크를 자연스럽게 2-3곳 삽입
- "광고", "홍보", "리뷰", "후기", "추천드립니다" 사용 금지
- 마지막: "지금 바로 확인하기" 스타일 CTA + 링크${jsonRule}`;

  const infoPrompt = `너는 검색 최적화 전문 블로거야. "${keyword}"에 대한 깊이 있는 지식 정보 글을 써줘.${notionContext}

작성 규칙:
- 제목: 검색 의도를 반영한 SEO 제목 (60자 이내)
- 본문: 최소 2000자, HTML 형식
- 구성: 목차 → h2 섹션 4-6개 → h3 소섹션 → 결론 요약
- 전문적이지만 읽기 쉬운 문체
- 독자가 바로 활용 가능한 실용적 정보 포함${jsonRule}`;

  const prompt = contentType === 'product' ? productPrompt : infoPrompt;

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
      content: imageHtml + (parsed.content || ''),
      metaDescription: parsed.metaDescription || '',
      labels: Array.isArray(parsed.labels) ? parsed.labels : [],
    });
  } catch (err) {
    console.error('Blogger generate error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
