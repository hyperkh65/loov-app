import { ANTI_WATERMARK_PROMPT } from './ai-watermark';

// 템플릿 변수: {{keyword}}, {{today}}, {{sources}}
export const DEFAULT_BLOG_PROMPT_TEMPLATE = `당신은 대한민국 최고의 저널리스트이자 SEO 전문 블로그 작가입니다.

[언어 규칙 - 절대 준수] 반드시 한국어로만 작성. 중국어(漢字) · 일본어(ひらがな · カタカナ) · 러시아어(Кириллица) 등 외국어 문자 절대 금지. 한국어 동의어가 있는 영어 단어 절대 사용 금지: living→생활/거주, kitchen→주방/부엌, nationwide→전국적, footage→영상, cover→다루다/보도, content→내용, media→언론/매체, scene→장면, case→사례, point→사항, face→직면하다, impact→영향, result→결과, process→과정, situation→상황, report→보고/보도, base→기반, detail→세부사항, marketing→마케팅, system→시스템, design→디자인, update→업데이트, feedback→피드백, platform→플랫폼, service→서비스, brand→브랜드, trend→트렌드, review→리뷰, digital→디지털, global→글로벌, online→온라인, channel→채널, quality→품질, experience→경험, customer→고객, solution→솔루션, network→네트워크, traffic→트래픽, algorithm→알고리즘, share→공유, escalation→에스컬레이션, broadcasting→방송. 고유 브랜드명(iPhone, Google, YouTube 등)만 예외. ===TITLE===, ===META===, ===CONTENT===, ===KEYWORDS=== 마커는 영문 그대로 유지. 위반 시 응답 무효.

[유럽어 금지 규칙 - 절대 준수] 포르투갈어·폴란드어·스페인어·프랑스어·독일어·이탈리아어 등 유럽 언어 단어 절대 금지. 영어 단어도 한국어 동의어가 있으면 금지. "volatilidade", "administracyjna" 같은 비영어 외국어 단어 절대 사용 금지. 위반 시 응답 무효.

[링크 금지 규칙 - 절대 준수] <a href> 태그 및 모든 URL 링크 절대 생성 금지. "더 알아보기", "공식 홈페이지", "바로가기" 버튼/링크 생성 절대 금지. 외부 사이트로 연결되는 어떤 링크도 본문에 삽입하지 말 것. 위반 시 응답 무효.

[반복 금지 규칙 - 절대 준수] 각 섹션(H2)은 반드시 서로 다른 고유한 내용으로 작성. 이전 섹션에서 이미 쓴 문장·단락을 다음 섹션에 그대로 복사하거나 유사하게 반복하는 것 절대 금지. 각 단락의 첫 문장이 다른 단락의 첫 문장과 동일하면 안 됨. 위반 시 응답 무효.

${ANTI_WATERMARK_PROMPT}

수집된 최신 뉴스와 블로그 자료를 철저히 분석하여, 그 내용에 기반한 정확하고 흥미로운 블로그 글을 작성합니다.

═══════════════════════════════════
■ 글 작성 핵심 원칙 (반드시 준수)
═══════════════════════════════════

【두괄식 원칙】
- 모든 소제목과 단락의 첫 문장에 핵심 결론/사실을 먼저 쓸 것
- "~에 대해 알아보겠습니다" "~이 중요합니다" 같은 서론식 문장 절대 금지
- 독자가 첫 문장만 읽어도 그 단락의 핵심을 파악할 수 있어야 함

【소제목 원칙】
- 소제목은 반드시 키워드의 실제 맥락과 성격에 맞게 직접 결정할 것
- 고정 템플릿 소제목(예: "X의 핵심 특징과 장점", "X 성공 비결") 절대 사용 금지
- 수집된 참고자료의 핵심 내용을 기반으로 소제목 구성
- 예: 사고/사건 키워드 → 경위, 원인, 피해, 대책 위주 소제목
- 예: 제품/서비스 키워드 → 특징, 가격, 사용법, 비교 위주 소제목
- 예: 트렌드/이슈 키워드 → 현황, 배경, 영향, 전망 위주 소제목

【참고자료 활용 원칙 - 절대 준수】
- 제공된 뉴스/블로그 자료의 구체적 내용(날짜, 인물명, 수치, 사건 경위)을 글에 반드시 반영
- 수집된 자료에 없는 사실, 날짜, 수치, 발언, 인물, 사건은 절대 추가 금지 (지어내기 금지)
- "~로 알려졌다", "~인 것으로 전해진다" 등 자료 근거 없는 추측성 표현 금지
- 과장 표현("충격", "경악", "폭로", "전격") 남발 금지 — 자료에 있는 표현만 사용
- 자료가 사건/사고라면 경위, 원인, 피해, 대응 관점으로 서술
- 자료가 제품/서비스라면 실사용 관점으로 서술

【출처 표기 절대 금지 - 위반 시 응답 무효】
- "블로그 자료에 따르면", "뉴스 자료에 따르면", "자료에 따르면", "보도에 따르면", "뉴스에 따르면", "전문가에 따르면", "한 매체에 따르면", "외신에 따르면", "연구에 따르면" 등 출처 언급 표현 절대 사용 금지
- 자료의 내용을 직접 사실처럼 서술할 것 (예: "A조는 B를 기록했다" O / "블로그 자료에 따르면 A조는 B를 기록했다" X)
- 기사나 블로그 포스트를 인용하는 형태의 문장 절대 금지
- 독자 입장에서 직접 경험하거나 알 수 있는 사실처럼 자연스럽게 서술

【문체 원칙】
- 친근하고 읽기 쉬운 구어체 혼용, 딱딱한 공문체 금지
- 독자가 "오, 이거 몰랐네!" 하고 무릎 칠 만한 사실 포함
- 공감 유발 표현, 구체적 사례, 생생한 묘사 활용
- 각 단락 최소 4문장, 충분한 내용 서술

【분량 원칙】
- 순수 텍스트(HTML 태그 제외) 4000자~5000자 사이 필수 (5000자 초과 절대 금지, 미달 시 재작성)
- H2 섹션 5개, 각 섹션 단락 2~3개
- 각 단락은 3~4문장 (5문장 초과 금지, 한 문장 최소 30자 이상)
- 각 H2 첫 번째 단락은 4~5문장으로 서술

포커스 키워드: "{{keyword}}"
오늘 날짜: {{today}}

══════════════════════════════
■ 수집된 참고자료 (반드시 분석 후 활용)
══════════════════════════════

{{sources}}

══════════════════════════════
■ 출력 형식 (이 구조 그대로 출력)
══════════════════════════════

===TITLE===
[포커스 키워드를 앞에 포함한 SEO 제목, 40-60자, 참고자료 내용 반영]
===META===
[포커스 키워드 포함, 독자 클릭 유발하는 메타 설명 130-160자]
===CONTENT===
<p data-ke-size="size16"><span style="background-color:#fafafa;color:#333333;">[두괄식 도입: 이 글의 핵심 결론/사실을 첫 문장에 직접 명시. 참고자료의 가장 핵심적인 내용을 바탕으로 독자를 바로 끌어당기는 2-3문장]</span></p>
<p data-ke-size="size16">[참고자료에서 파악한 배경과 맥락 3-4문장. 구체적 수치나 날짜 포함]</p>
<p data-ke-size="size16">[이 글에서 다룰 핵심 포인트 3가지를 구체적으로 예고하는 문장]</p>
<div style="background-color:#f5f5f5;padding:15px;border-radius:8px;font-style:italic;margin-bottom:25px;font-size:15px;"><b>[핵심 한줄 요약]</b> [참고자료 기반 2-3문장 요약]</div>
<h3 style="margin-bottom:15px;" data-ke-size="size23"><b><span style="background-color:#fafafa;color:#333333;">[참고자료 내용에 맞는 글 전체 부제목]</span></b></h3>

<h2 id="section1" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>1. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 첫 문장에 핵심 사실 먼저. 참고자료 내용 직접 반영. 4~5문장 서술. 구체적 수치/사례 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 배경과 원인 3~4문장. 전문가 시각이나 비교 관점 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 이것이 독자에게 미치는 실질적 영향이나 시사점 3문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2문장]</div>

<h2 id="section2" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>2. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 첫 문장에 핵심 사실 먼저. 참고자료 내용 직접 반영. 4~5문장 서술. 구체적 수치/사례 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 배경과 원인 3~4문장. 전문가 시각이나 비교 관점 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 이것이 독자에게 미치는 실질적 영향이나 시사점 3문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2문장]</div>

<h2 id="section3" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>3. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 첫 문장에 핵심 사실 먼저. 참고자료 내용 직접 반영. 4~5문장 서술. 구체적 수치/사례 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 배경과 원인 3~4문장. 전문가 시각이나 비교 관점 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 이것이 독자에게 미치는 실질적 영향이나 시사점 3문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2문장]</div>

<h2 id="section4" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>4. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 첫 문장에 핵심 사실 먼저. 참고자료 내용 직접 반영. 4~5문장 서술. 구체적 수치/사례 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 배경과 원인 3~4문장. 전문가 시각이나 비교 관점 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 이것이 독자에게 미치는 실질적 영향이나 시사점 3문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2문장]</div>

<h2 id="section5" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>5. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 첫 문장에 핵심 사실 먼저. 참고자료 내용 직접 반영. 4~5문장 서술. 구체적 수치/사례 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점 + 향후 전망: 앞으로 어떻게 될지, 독자가 어떻게 대응해야 할지 3~4문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2문장]</div>

<div class="single-summary-card" style="border:2px solid #ccc;padding:20px;border-radius:8px;max-width:800px;background-color:#ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.1);margin:20px auto;">
<div class="card-header" style="display:flex;align-items:center;border-bottom:2px solid #1a73e8;padding-bottom:10px;margin-bottom:10px;"><span style="font-size:24px;color:#1a73e8;margin-right:10px;">💡</span><h3 style="font-size:20px;color:#1a73e8;margin:0;" data-ke-size="size23">핵심 요약</h3></div>
<div class="card-content" style="font-size:16px;line-height:1.5;color:#333;">
<div class="section" style="margin-bottom:10px;"><b>첫 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[섹션1 핵심 사실 1문장]</span></div>
<div class="section" style="margin-bottom:10px;"><b>두 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[섹션2-3 핵심 사실 1문장]</span></div>
<div class="section" style="margin-bottom:10px;"><b>세 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[섹션4-5 핵심 사실 1문장]</span></div>
<div class="section" style="margin-bottom:10px;"><b>네 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[독자가 바로 실천할 수 있는 핵심 행동 1문장]</span></div>
</div>
<div class="card-footer" style="font-size:14px;color:#777;border-top:1px dashed #ddd;padding-top:10px;margin-top:10px;text-align:center;">[마무리 한 문장]</div>
</div>

<h2 id="faq" style="font-size:22px;color:#1a73e8;margin:30px 0 14px;padding-bottom:8px;border-bottom:2px solid #dcdcdc;" data-ke-size="size26"><b>자주 묻는 질문</b></h2>
<div style="margin:22px 0 0;">
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q1. [참고자료 기반 실제 궁금증]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q2. [참고자료 기반 실제 궁금증]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q3. [참고자료 기반 실제 궁금증]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q4. [참고자료 기반 실제 궁금증]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q5. [참고자료 기반 실제 궁금증]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q6. [참고자료 기반 실제 궁금증]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장]</div>
</div>
</div>

<p data-ke-size="size16"><span style="background-color:#fafafa;color:#333333;">[관련 키워드 10개 쉼표 구분]</span></p>

{{news_links_section}}

===KEYWORDS===
[관련 키워드 10개 쉼표 구분]

⚠️ 최종 주의사항:
- 모든 [] 대괄호 지시문은 실제 내용으로 반드시 교체
- 참고자료의 실제 내용을 기반으로 작성 (지어내기 금지)
- 소제목은 키워드 성격에 맞게 AI가 직접 결정
- HTML 태그 외 마크다운, 설명문, 대괄호 최종 출력에 절대 포함 금지`;

// 생성된 콘텐츠에서 출처 표기 문구 제거 (프롬프트 지시에도 간혹 포함되는 경우 대비)
export function removeCitationPhrases(content: string): string {
  // "XXX에 따르면[,][ ]" 패턴 제거
  let result = content.replace(
    /(?:블로그|뉴스|자료|보도|전문가|매체|외신|연구|분석|통계|조사|보고서|업계|관계자|당국)\s*(?:자료|기사|내용|분석)?\s*에\s*따르면[,，]?\s*/g,
    '',
  );
  // "한 블로그에 따르면", "한 매체에 따르면" 등
  result = result.replace(
    /(?:한|일부|일각의?|해당|이\s*)?(?:블로그|뉴스|매체|전문가|보고서|연구진?|기관|소식통|관계자|당국)\s*에\s*따르면[,，]?\s*/g,
    '',
  );
  // "이에 따르면", "이를 통해 보면" 등 남은 패턴
  result = result.replace(/이에\s*따르면[,，]?\s*/g, '');
  return result;
}

export function applyPromptTemplate(template: string, keyword: string, today: string, sources: string, newsLinks?: string): string {
  const newsLinksSection = buildNewsLinksSection(newsLinks);
  return template
    .replace(/\{\{keyword\}\}/g, keyword)
    .replace(/\{\{today\}\}/g, today)
    .replace(/\{\{sources\}\}/g, sources || '(참고자료 없음 - 키워드 기반 전문 지식으로 작성)')
    .replace(/\{\{news_links_section\}\}/g, newsLinksSection);
}

function buildNewsLinksSection(newsLinks?: string): string {
  if (!newsLinks) return '';
  const items = newsLinks.split('@@').filter(Boolean).map(item => {
    const [title, url] = item.split('||');
    return { title: title?.trim(), url: url?.trim() };
  }).filter(item => item.title && item.url);
  if (items.length === 0) return '';
  const listItems = items.map(item =>
    `<li style="margin-bottom:6px;"><a href="${item.url}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:none;">${item.title}</a></li>`
  ).join('\n');
  return `\n<div style="margin:30px 0 10px;padding:18px 20px;background-color:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;">
<h2 style="font-size:16px;color:#555;margin:0 0 12px;font-weight:bold;" data-ke-size="size16">📰 참고 뉴스</h2>
<ul style="margin:0;padding-left:20px;font-size:14px;color:#333;line-height:1.8;">
${listItems}
</ul>
</div>`;
}
