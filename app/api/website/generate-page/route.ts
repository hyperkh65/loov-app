import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { blockType, companyInfo, apiKey, provider = 'gemini' } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'AI 설정에서 API 키를 먼저 등록해주세요.' }, { status: 400 });
    }

    const prompt = `다음 회사 정보를 기반으로 홈페이지 "${blockType}" 섹션의 콘텐츠를 생성해주세요.

회사 정보:
- 회사명: ${companyInfo.companyName || '회사명'}
- 슬로건: ${companyInfo.slogan || ''}
- 업종/설명: ${companyInfo.description || '1인 기업'}
- 서비스: ${companyInfo.services || ''}

섹션 유형: ${blockType}

다음 JSON 형식으로만 응답해주세요 (설명 없이):
${blockType === 'hero' ? `{
  "headline": "메인 헤드라인 (20자 이내)",
  "subheadline": "서브 헤드라인 (50자 이내)",
  "cta": "CTA 버튼 텍스트 (10자 이내)"
}` : blockType === 'about' ? `{
  "title": "섹션 제목",
  "body": "회사 소개 본문 (200자 이내)"
}` : blockType === 'services' ? `{
  "title": "서비스 섹션 제목",
  "items": [
    {"icon": "이모지", "title": "서비스명", "desc": "서비스 설명 (50자 이내)"},
    {"icon": "이모지", "title": "서비스명", "desc": "서비스 설명 (50자 이내)"},
    {"icon": "이모지", "title": "서비스명", "desc": "서비스 설명 (50자 이내)"}
  ]
}` : `{
  "headline": "제목",
  "body": "본문",
  "btnText": "버튼 텍스트"
}`}`;

    let text = '';

    if (provider === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      text = data.content?.[0]?.text || '';
    } else if (provider === 'gpt4o' || provider === 'gpt4' || provider === 'gpt35') {
      const model = provider === 'gpt4o' ? 'gpt-4o' : provider === 'gpt4' ? 'gpt-4-turbo' : 'gpt-3.5-turbo';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 500 }),
      });
      const data = await res.json();
      text = data.choices?.[0]?.message?.content || '';
    } else {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await geminiModel.generateContent(prompt);
      text = result.response.text();
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI 응답 파싱 실패');

    const content = JSON.parse(match[0]);
    if (content.items) content.items = JSON.stringify(content.items);

    return NextResponse.json({ content });
  } catch (error) {
    console.error('Generate page error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
