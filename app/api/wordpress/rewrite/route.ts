import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const DEFAULT_PROMPT = `당신은 SEO 전문가 블로그 라이터입니다. 주어진 HTML 블로그 글을 SEO에 최적화된 형태로 리라이팅해주세요.

요구사항:
- 대상 키워드를 제목·소제목·본문에 자연스럽게 반복 포함
- 도입부 첫 문단에 핵심 내용 + 키워드 포함 (검색 스니펫 최적화)
- h2, h3 소제목을 키워드 중심으로 최적화
- 짧고 명확한 문장 (모바일 가독성)
- 기존 정보·사실은 100% 유지, 문장만 리라이팅
- HTML 태그 구조 그대로 유지 (h2, h3, p, ul, li, strong 등)
- 마지막에 CTA 문장 추가 (구매·방문·클릭 유도)
- 한국어로 작성

HTML 태그 외 추가 설명이나 마크다운 없이 순수 HTML만 출력하세요.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { title, content, targetKeyword } = await req.json();
  if (!content) return NextResponse.json({ error: '내용이 필요합니다' }, { status: 400 });

  // 저장된 OpenAI 키 + 프롬프트 조회
  const { data: conn } = await supabase
    .from('notion_connections')
    .select('openai_api_key, rewrite_prompt')
    .eq('user_id', user.id)
    .single();

  const apiKey = conn?.openai_api_key?.trim() || process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'OpenAI API 키가 없습니다. 노션 설정 탭에서 입력하세요.' }, { status: 400 });

  const systemPrompt = conn?.rewrite_prompt?.trim() || DEFAULT_PROMPT;

  const userMessage = [
    targetKeyword ? `대상 키워드: "${targetKeyword}"` : '',
    `제목: ${title || '(제목 없음)'}`,
    '',
    '--- 원문 HTML ---',
    content,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: `OpenAI 오류 (${res.status}): ${(err as { error?: { message?: string } }).error?.message || '알 수 없는 오류'}` }, { status: 500 });
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const rewritten = data.choices?.[0]?.message?.content?.trim() || '';

    // HTML 마크다운 펜스 제거 (GPT가 ```html로 감싸는 경우)
    const cleaned = rewritten.replace(/^```html\s*/i, '').replace(/\s*```$/, '');

    return NextResponse.json({ content: cleaned });
  } catch (e) {
    return NextResponse.json({ error: '네트워크 오류: ' + String(e) }, { status: 500 });
  }
}
