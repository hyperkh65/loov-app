/**
 * GPT-4o로 SEO 제목, 카테고리, 태그, 해시태그, SNS 후킹 요약 자동 생성
 * POST { title, content }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, content } = await req.json() as { title: string; content: string };

  const { data: conn } = await supabase
    .from('notion_connections')
    .select('openai_api_key')
    .eq('user_id', user.id)
    .single();

  const apiKey = conn?.openai_api_key?.trim() || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OpenAI API 키 없음. 노션 설정에서 입력하거나 환경변수를 확인하세요.' },
      { status: 400 },
    );
  }

  const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2000);

  const prompt = `블로그 글을 분석해서 JSON으로만 답변해. 한국어.

제목: ${title}
내용 요약: ${plainText}

JSON 형식 (다른 텍스트 없이):
{
  "seoTitle": "SEO 최적화 제목 (50자 이내, 검색 노출에 유리하게)",
  "thumbnailTitle": "대표이미지에 들어갈 짧고 임팩트 있는 제목 (20자 이내, 줄바꿈 가능)",
  "categories": ["카테고리1", "카테고리2"],
  "tags": ["태그1", "태그2", "태그3", "태그4", "태그5"],
  "hashtags": "#태그1 #태그2 #태그3 #태그4 #태그5 #태그6 #태그7 #태그8 #태그9 #태그10",
  "snsHook": "SNS 후킹 요약본 (스레드/인스타 스타일, 3-4줄, 이모지 포함, 핵심 정보 전달, 블로그 링크 클릭 유도, URL은 포함하지 말것)"
}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `OpenAI 오류 (${res.status}): ${errText.slice(0, 100)}` }, { status: 500 });
    }

    const data = await res.json();
    const result = JSON.parse(data.choices[0].message.content);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
