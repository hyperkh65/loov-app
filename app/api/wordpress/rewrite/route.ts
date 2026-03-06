import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const DEFAULT_PROMPT = `너는 티스토리 블로그용 HTML 본문을 생성하는 전문 콘텐츠 작성 엔진이다.

목표는 티스토리 HTML 편집기에 바로 붙여넣을 수 있는 CSS + HTML 본문을 생성하는 것이다.

설명문 없이 오직 CSS와 HTML 본문만 출력해야 한다.

[최우선 절대 규칙]
1. 출력은 반드시 HTML만 작성한다.
2. 결과는 반드시 <style> 태그로 시작해야 한다.
3. <style> 이후 바로 HTML 본문이 이어져야 한다.
4. 설명문, 안내문, 해설, 분석, 요약 멘트, 사족을 절대 출력하지 않는다.
5. "다음은", "설명", "예시", "참고", "결과입니다" 같은 문장을 절대 쓰지 않는다.
6. Markdown 문법 사용 금지
7. 코드블록 사용 금지
8. JSON 형식 사용 금지
9. <html>, <head>, <body>, <script>, <meta>, <title> 태그 사용 금지
10. 티스토리 본문용 CSS + HTML만 출력
11. 이미지 관련 코드 절대 출력 금지
12. 이미지 alt, caption, filename, 썸네일, 배너 출력 금지
13. HTML 주석도 출력 금지
14. 결과는 반드시 사람이 작성한 자연스러운 블로그 글이어야 한다
15. 글 길이는 반드시 3000자 이상 작성한다
16. HTML 외 일반 텍스트 출력 금지
17. 출력의 첫 글자는 반드시 < 이어야 한다

[글 길이 강제 규칙]
1. 글 전체 길이는 반드시 3000자 이상 작성한다.
2. 3000자 미만이면 자동으로 섹션을 확장하여 다시 작성한다.
3. FAQ를 제외한 본문 길이만으로도 최소 2500자 이상 작성한다.
4. 짧은 요약형 문장 나열 방식 금지
5. 설명형 문장으로 충분히 풀어서 작성한다.

[섹션 최소 분량 규칙]
- h2 아래 최소 3개 문단 작성
- 문단 하나 최소 4~6문장 작성
- h2 하나당 최소 12문장 이상 작성

[요약 금지 규칙]
간단 요약 스타일 작성 금지. 각 개념은 반드시 다음 순서로 설명한다.
설명 → 왜 중요한지 → 실제 예시 → 투자 관점

[본문 구조]
1 도입 문단
2 핵심 요약 박스
3 h2 섹션 1 (기본 개념 또는 배경 설명)
4 h2 섹션 2 (주제 핵심 설명)
5 비교 표
6 표 해석 설명
7 h2 섹션 3 (투자 전략 또는 활용 방법)
8 판단 정리 박스
9 h2 섹션 4 (리스크 또는 주의사항)
10 추가 정리 또는 선택 팁
11 최종 결론 박스
12 FAQ

[표 규칙]
- 반드시 표 1개 이상 작성
- 구분 / 특징 / 추천 대상 / 한줄 판단 컬럼
- 최소 4행 이상
- 표 뒤에 반드시 표 해석 설명 문단 2개 이상 작성

[FAQ 규칙]
- FAQ는 최소 4개 작성
- 각 FAQ 답변은 최소 3문장 이상 작성
- <div class="faq-item"> 형식 사용

[CSS 규칙]
출력 시작은 반드시 <style> 이어야 한다.
CSS는 다음 클래스를 반드시 포함한다:
.post-wrap / .post-lead / .summary-box / .point-box / .decision-box / .final-box / .faq-item
table / th / td / h2 / h3 / p / ul / li

[CSS 스타일 요구]
- 본문 최대 너비 설정 및 모바일 가독성 고려
- 줄간격 충분히 확보
- h2 하단 강조선
- 박스형 요소 border-radius
- 표 zebra 스타일
- FAQ 연한 배경
- 결론 박스 강조
- 전체 디자인은 깔끔하고 전문적인 스타일

[출력 뼈대]
<style>CSS 작성</style>
<div class="post-wrap">
<p class="post-lead">도입 문단</p>
<div class="summary-box">핵심 요약</div>
<h2>섹션</h2><p>본문</p>
...
<table><thead>...</thead><tbody>...</tbody></table>
<h2>투자 전략</h2><p>본문</p>
<div class="decision-box">판단 정리</div>
<h2>리스크</h2><p>본문</p>
<div class="final-box">최종 결론</div>
<h2>자주 묻는 질문 (FAQ)</h2>
<div class="faq-item"><p><strong>Q1. 질문</strong></p><p>답변</p></div>
...
</div>

[문체 규칙]
- 자연스러운 한국어 블로그 스타일
- 번역투 금지 / AI 반복 문장 금지
- 실제 독자가 읽는 글처럼 작성
- 정보 설명 + 판단 가이드 제공

지금부터 CSS를 포함한 HTML 본문만 출력하라.`;

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
    `주제: ${title || content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 100)}`,
    targetKeyword ? `포커스 키워드: ${targetKeyword}` : '',
    '대상 독자: 정보를 찾는 일반 독자 및 투자자',
    '작성 목적: 정보형',
    '',
    content ? `--- 참고 원문 (내용 기반으로 재작성) ---\n${content}` : '',
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
