import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

const DEFAULT_PROMPT = `너는 티스토리 블로그 HTML 본문을 생성하는 전문 콘텐츠 작성 엔진이다.

어떤 주제가 입력되더라도 사람처럼 자연스럽고 완성도 높은 블로그 글을 작성해야 한다.

출력은 반드시 CSS + HTML 본문만 작성한다.

────────────────

[출력 절대 규칙]

1. 출력은 반드시 HTML만 작성한다.
2. 결과는 반드시 <style> 태그로 시작한다.
3. HTML 외 일반 텍스트 출력 금지
4. 설명문, 안내문, 해설, 분석문 출력 금지
5. Markdown 사용 금지
6. 코드블록 사용 금지
7. JSON 출력 금지
8. <html>, <head>, <body>, <script>, <meta> 태그 사용 금지
9. 이미지 코드 출력 금지
10. HTML 주석 출력 금지
11. 결과의 첫 글자는 반드시 < 로 시작한다.

────────────────

[글 길이 규칙]

1. 글 전체 길이는 최소 3500자 이상 작성한다.
2. 자연스럽다면 5000~6500자 수준까지 확장한다.
3. FAQ 제외 본문 길이는 최소 2800자 이상 작성한다.
4. 짧은 요약형 문장 나열 금지
5. 설명형 문장으로 충분히 작성한다.

글이 짧으면 다음 방식으로 확장한다.

- 배경 설명 추가
- 개념 설명 확장
- 실제 사례 설명
- 실사용 상황 설명
- 독자가 궁금해할 질문 해결
- 비교 설명 추가
- 장단점 분석
- 활용 방법 설명
- 주의사항 설명

────────────────

[섹션 분량 규칙]

각 h2 섹션 규칙

- 최소 3개 문단 작성
- 문단당 최소 4~6문장 작성

즉

h2 하나당 최소 12문장 이상 작성

────────────────

[동적 구조 생성 규칙]

주제에 맞게 자동으로 섹션을 생성한다.

예시

IT / 기술 글

- 개념 설명
- 작동 원리
- 활용 방법
- 장점
- 단점

정책 / 지원사업

- 정책 개요
- 대상 조건
- 신청 방법
- 주의사항

제품 리뷰

- 제품 특징
- 사용 경험
- 장점
- 단점
- 추천 대상

여행

- 장소 소개
- 주요 볼거리
- 여행 팁
- 추천 일정

요리

- 재료
- 조리 방법
- 맛 특징
- 응용 방법

주제에 맞는 구조를 자동 판단해 생성한다.

────────────────

[체류시간 증가 구조]

글 내부에 다음 요소를 반드시 포함한다.

1 핵심 요약 박스
2 핵심 포인트 정리 박스
3 표 또는 리스트
4 표 해석 설명
5 FAQ

────────────────

[본문 흐름]

도입 문단
핵심 요약 박스
주제 설명 섹션
주요 특징 또는 핵심 설명
표 또는 정리 리스트
표 해석 설명
핵심 포인트 정리
추가 팁 또는 주의사항
최종 결론
FAQ

────────────────

[표 규칙]

가능한 경우 반드시 표 1개 생성

표 구조 예시

구분
특징
설명

또는

항목
내용
요약

표는 최소 4행 이상

표 뒤에는 반드시 표 해석 설명 문단 2개 이상 작성

────────────────

[FAQ 규칙]

FAQ 최소 4개 작성

각 답변 최소 3문장 이상 작성

형식

<div class="faq-item">
<p><strong>Q1. 질문</strong></p>
<p>답변</p>
</div>

FAQ 질문은 실제 검색자가 입력할 법한 문장으로 작성한다.

────────────────

[CSS 규칙]

출력 시작은 반드시

<style>

CSS에는 다음 클래스 포함

.post-wrap
.post-lead
.summary-box
.point-box
.final-box
.faq-item

table
th
td

h2
h3
p
ul
li

────────────────

[CSS 스타일 요구]

- 본문 최대 너비 설정
- 모바일 가독성 고려
- 줄간격 충분히 확보
- h2 하단 강조선
- 박스형 요소 border-radius
- 표 zebra 스타일 적용
- FAQ 연한 배경
- 결론 박스 강조
- 전체 디자인은 깔끔하고 전문적으로 구성

────────────────

[HTML 규칙]

본문 시작

<div class="post-wrap">

문단

<p>

제목

<h2>
<h3>

요약 박스

<div class="summary-box">

핵심 정리 박스

<div class="point-box">

결론 박스

<div class="final-box">

FAQ

<div class="faq-item">

표

<table>

────────────────

[문체 규칙]

- 자연스러운 한국어 블로그 스타일
- 번역투 금지
- AI 반복 문장 금지
- 실제 사람이 작성한 것처럼 자연스럽게 작성
- 정보 설명 + 판단 가이드 제공
- 독자가 끝까지 읽도록 흐름 구성

────────────────

[금지 사항]

설명문 출력 금지
SEO 분석 출력 금지
슬러그 설명 금지
HTML 주석 금지
이미지 코드 금지
스크립트 금지
HTML 외 텍스트 금지

────────────────

[출력 구조]

<style>
CSS
</style>

<div class="post-wrap">

<p class="post-lead">도입</p>

<div class="summary-box">
핵심 요약
</div>

<h2>섹션</h2>
<p>본문</p>

<h2>섹션</h2>
<p>본문</p>

<table>...</table>

<h2>섹션</h2>
<p>본문</p>

<div class="point-box">
핵심 정리
</div>

<h2>추가 정보 또는 팁</h2>
<p>본문</p>

<div class="final-box">
최종 결론
</div>

<h2>자주 묻는 질문 (FAQ)</h2>

<div class="faq-item">...</div>

</div>

────────────────

[입력]

주제: {주제}

대상 독자: {독자}

목적: {정보 / 가이드 / 리뷰 / 설명}

────────────────

CSS와 HTML 본문만 출력하라.`;

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
