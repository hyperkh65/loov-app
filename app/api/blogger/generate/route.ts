import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    keyword: string;
    contentType: 'product' | 'info';
    productInfo?: string;
  };

  const { keyword, contentType, productInfo } = body;
  if (!keyword) {
    return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
  }

  const productContext = productInfo ? `\n상품 정보: ${productInfo}` : '';

  const prompt =
    contentType === 'product'
      ? `너는 블로그 마케터야. "${keyword}" 상품에 대한 솔직한 리뷰/추천 글을 써줘.${productContext}
규칙:
- 제목: SEO에 최적화된 클릭하고 싶은 제목 (60자 이내)
- 본문: HTML 형식 (h2, h3, p, ul 사용), 1500자 이상
- 독자가 구매 결정하도록 유도 (후기/리뷰/광고 단어 금지)
- 첫 문장은 공감되는 상황 묘사로 시작
- 가격 메리트, 사용법, 주의사항 포함
- 마지막에 구매 유도 CTA

반드시 아래 JSON 형식으로만 응답 (마크다운 코드 블록 없이):
{
  "title": "SEO 최적화 제목",
  "content": "HTML 본문 전체",
  "metaDescription": "메타 설명 150자 이내",
  "labels": ["태그1", "태그2", "태그3"]
}`
      : `너는 SEO 전문가야. "${keyword}"에 대한 정보성 블로그 글을 써줘.
규칙:
- 제목: 검색 의도를 반영한 SEO 제목 (60자 이내)
- 본문: HTML 형식, 목차 포함, 2000자 이상
- h2로 주요 섹션, h3로 소섹션 구성
- 전문적이지만 읽기 쉽게
- 결론에 요약 포함

반드시 아래 JSON 형식으로만 응답 (마크다운 코드 블록 없이):
{
  "title": "SEO 최적화 제목",
  "content": "HTML 본문 전체",
  "metaDescription": "메타 설명 150자 이내",
  "labels": ["태그1", "태그2", "태그3", "태그4", "태그5"]
}`;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    let text = result.response.text();

    // ```json ... ``` 블록 제거
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed: {
      title: string;
      content: string;
      metaDescription: string;
      labels: string[];
    };

    try {
      parsed = JSON.parse(text);
    } catch {
      // JSON 파싱 실패 시 텍스트에서 추출 시도
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json({ error: 'AI 응답 파싱 실패', raw: text }, { status: 500 });
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    return NextResponse.json({
      title: parsed.title || '',
      content: parsed.content || '',
      metaDescription: parsed.metaDescription || '',
      labels: Array.isArray(parsed.labels) ? parsed.labels : [],
    });
  } catch (err) {
    console.error('Blogger generate error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
