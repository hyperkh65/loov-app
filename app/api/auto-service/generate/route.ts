import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import { generateText } from '@/lib/auto-blog-ai';
import { getSetting } from '@/lib/get-setting';
import { cleanWatermarks, ANTI_WATERMARK_PROMPT } from '@/lib/ai-watermark';
import { consumeJobToken } from '@/lib/internal-job-auth';

export const maxDuration = 300;

// 수집된 기사에서 og:image 스크래핑
async function scrapeArticleImages(
  items: { link: string; title: string }[],
  limit = 6,
): Promise<{ url: string; title: string }[]> {
  const results: { url: string; title: string }[] = [];
  const toScrape = items.slice(0, limit);

  await Promise.allSettled(toScrape.map(async (item) => {
    try {
      const res = await fetch(item.link, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return;
      const html = await res.text();

      // og:image 우선 추출
      const ogMatch =
        html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      if (ogMatch?.[1]?.startsWith('http')) {
        results.push({ url: ogMatch[1], title: item.title });
        return;
      }

      // 첫 번째 큰 이미지 (icon/logo/button 제외)
      const imgMatches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi)];
      const filtered = imgMatches
        .map(m => m[1])
        .filter(u => !/(icon|logo|button|banner|sprite|pixel|blank|tracking)/i.test(u));
      if (filtered[0]) results.push({ url: filtered[0], title: item.title });
    } catch { /* skip */ }
  }));

  return results;
}

async function searchNaver(type: 'news' | 'blog', query: string) {
  const [clientId, clientSecret] = await Promise.all([getSetting('NAVER_CLIENT_ID'), getSetting('NAVER_CLIENT_SECRET')]);
  if (!clientId || !clientSecret) return [];
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(query)}&display=10&sort=date`,
      { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((item: { title: string; description: string; link: string }) => ({
      title: item.title.replace(/<[^>]+>/g, ''),
      description: item.description.replace(/<[^>]+>/g, ''),
      link: item.link,
    }));
  } catch { return []; }
}

function buildPrompt(keyword: string, newsItems: {title:string;description:string}[], blogItems: {title:string;description:string}[]): string {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const sources = [
    ...newsItems.map((n, i) => `[뉴스${i+1}] ${n.title}\n${n.description}`),
    ...blogItems.map((b, i) => `[블로그${i+1}] ${b.title}\n${b.description}`),
  ].join('\n\n');

  return `당신은 대한민국 최고의 저널리스트이자 SEO 전문 블로그 작가입니다.

[언어 규칙 - 절대 준수] 반드시 한국어로만 작성. 중국어(漢字) · 일본어(ひらがな · カタカナ) · 러시아어(Кириллица) 등 외국어 문자 절대 금지. 한국어 동의어가 있는 영어 단어 절대 사용 금지: marketing→마케팅, system→시스템, design→디자인, update→업데이트, feedback→피드백, platform→플랫폼, service→서비스, brand→브랜드, trend→트렌드, review→리뷰, digital→디지털, global→글로벌, online→온라인, channel→채널, quality→품질, experience→경험, customer→고객, solution→솔루션, network→네트워크, traffic→트래픽, algorithm→알고리즘, share→공유, escalation→에스컬레이션, broadcasting→방송, humanitarian→인도주의, universal→다양한, Israel→이스라엘, Palestinian→팔레스타인. 고유 브랜드명(iPhone, Google, YouTube 등)만 예외. ===TITLE===, ===META===, ===CONTENT===, ===KEYWORDS=== 마커는 영문 그대로 유지. 위반 시 응답 무효.

[링크 금지 규칙 - 절대 준수] <a href> 태그 및 모든 URL 링크 절대 생성 금지. "더 알아보기", "공식 홈페이지", "바로가기" 버튼/링크 생성 절대 금지. 외부 사이트로 연결되는 어떤 링크도 본문에 삽입하지 말 것. 위반 시 응답 무효.

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

【참고자료 활용 원칙】
- 제공된 뉴스/블로그 자료의 구체적 내용(날짜, 인물명, 수치, 사건 경위)을 글에 반드시 반영
- 자료에 없는 내용을 억지로 지어내지 말 것
- 자료가 사건/사고라면 안전, 원인, 피해, 대응 관점으로 서술
- 자료가 제품/서비스라면 실사용 관점으로 서술

【문체 원칙】
- 친근하고 읽기 쉬운 구어체 혼용, 딱딱한 공문체 금지
- 독자가 "오, 이거 몰랐네!" 하고 무릎 칠 만한 사실 포함
- 공감 유발 표현, 구체적 사례, 생생한 묘사 활용
- 각 단락 최소 4문장, 충분한 내용 서술

【분량 원칙】
- 순수 텍스트(HTML 태그 제외) 최소 4000자 이상 필수 (미달 시 재작성)
- H2 섹션 6개, 각 섹션 단락 3개 이상
- 각 단락은 반드시 5문장 이상 (짧은 문장 금지, 한 문장 최소 30자 이상)
- 각 H2 첫 번째 단락은 7-8문장으로 충분히 풀어쓸 것

포커스 키워드: "${keyword}"
오늘 날짜: ${today}

══════════════════════════════
■ 수집된 참고자료 (반드시 분석 후 활용)
══════════════════════════════

${sources || '(참고자료 없음 - 키워드 기반 전문 지식으로 작성)'}

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
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 첫 문장에 핵심 사실 먼저. 참고자료 내용 직접 반영. 반드시 7-8문장으로 충분히 서술. 구체적 수치/사례 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 배경과 원인을 깊이 파고들어 5-6문장. 전문가 시각이나 비교 관점 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 이것이 독자에게 미치는 실질적 영향이나 시사점 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

<h2 id="section2" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>2. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 첫 문장에 핵심 사실 먼저. 참고자료 내용 직접 반영. 반드시 7-8문장으로 충분히 서술. 구체적 수치/사례 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 배경과 원인을 깊이 파고들어 5-6문장. 전문가 시각이나 비교 관점 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 이것이 독자에게 미치는 실질적 영향이나 시사점 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

<h2 id="section3" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>3. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 첫 문장에 핵심 사실 먼저. 참고자료 내용 직접 반영. 반드시 7-8문장으로 충분히 서술. 구체적 수치/사례 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 배경과 원인을 깊이 파고들어 5-6문장. 전문가 시각이나 비교 관점 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 이것이 독자에게 미치는 실질적 영향이나 시사점 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

<h2 id="section4" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>4. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 첫 문장에 핵심 사실 먼저. 참고자료 내용 직접 반영. 반드시 7-8문장으로 충분히 서술. 구체적 수치/사례 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 배경과 원인을 깊이 파고들어 5-6문장. 전문가 시각이나 비교 관점 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 이것이 독자에게 미치는 실질적 영향이나 시사점 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

<h2 id="section5" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>5. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 첫 문장에 핵심 사실 먼저. 참고자료 내용 직접 반영. 반드시 7-8문장으로 충분히 서술. 구체적 수치/사례 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 배경과 원인을 깊이 파고들어 5-6문장. 전문가 시각이나 비교 관점 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 이것이 독자에게 미치는 실질적 영향이나 시사점 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

<h2 id="section6" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>6. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 첫 문장에 핵심 사실 먼저. 참고자료 내용 직접 반영. 반드시 7-8문장으로 충분히 서술. 구체적 수치/사례 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 배경과 원인을 깊이 파고들어 5-6문장. 전문가 시각이나 비교 관점 포함]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점 + 향후 전망: 앞으로 어떻게 될지, 독자가 어떻게 대응해야 할지 5-6문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

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
===KEYWORDS===
[관련 키워드 10개 쉼표 구분]

⚠️ 최종 주의사항:
- 모든 [] 대괄호 지시문은 실제 내용으로 반드시 교체
- 참고자료의 실제 내용을 기반으로 작성 (지어내기 금지)
- 소제목은 키워드 성격에 맞게 AI가 직접 결정
- HTML 태그 외 마크다운, 설명문, 대괄호 최종 출력에 절대 포함 금지`;
}

async function searchInlineImages(query: string, count = 3): Promise<{ displayUrls: string[]; thumbUrl: string | undefined }> {
  // 1순위: 네이버 이미지 검색 (한글 키워드 최적화)
  // displayUrls: item.link (원본, 브라우저 로드용)
  // thumbUrl: item.thumbnail (CDN URL search.pstatic.net, 서버 fetch 가능 → 대표이미지 배경용)
  const [naverClientId, naverClientSecret] = await Promise.all([getSetting('NAVER_CLIENT_ID'), getSetting('NAVER_CLIENT_SECRET')]);
  if (naverClientId && naverClientSecret) {
    try {
      const res = await fetch(
        `https://openapi.naver.com/v1/search/image.json?query=${encodeURIComponent(query)}&display=${count + 3}&sort=sim`,
        { headers: { 'X-Naver-Client-Id': naverClientId, 'X-Naver-Client-Secret': naverClientSecret } }
      );
      if (res.ok) {
        const data = await res.json();
        const items = (data.items || []).filter((item: { link: string }) => item.link?.startsWith('http'));
        if (items.length > 0) {
          return {
            displayUrls: items.slice(0, count).map((item: { link: string }) => item.link),
            thumbUrl: items[0].thumbnail as string | undefined,
          };
        }
      }
    } catch { /* fallthrough */ }
  }

  // 2순위: Google Custom Search
  const [googleKey, googleCx] = await Promise.all([
    getSetting('GOOGLE_SEARCH_API_KEY'),
    getSetting('GOOGLE_SEARCH_CX'),
  ]);
  if (googleKey && googleCx) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${encodeURIComponent(query)}&searchType=image&num=${Math.min(count, 10)}&safe=active`
      );
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        if (items.length > 0) {
          const urls = items.slice(0, count).map((item: { link: string }) => item.link);
          return { displayUrls: urls, thumbUrl: urls[0] };
        }
      }
    } catch { /* fallthrough */ }
  }

  // 3순위: Pixabay (한글 검색만, 폴백 없음)
  const pixabayKey = await getSetting('PIXABAY_API_KEY');
  if (pixabayKey) {
    try {
      const res = await fetch(
        `https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${count + 3}&safesearch=true&min_width=600`
      );
      if (res.ok) {
        const data = await res.json();
        const hits = data.hits || [];
        if (hits.length > 0) {
          const urls = hits.slice(0, count).map((h: { webformatURL: string }) => h.webformatURL);
          return { displayUrls: urls, thumbUrl: urls[0] };
        }
      }
    } catch { /* skip */ }
  }
  return { displayUrls: [], thumbUrl: undefined };
}

function extractH2Title(h2Tag: string): string {
  return h2Tag.replace(/<[^>]+>/g, '').trim();
}

// h3 텍스트를 실제 기사 제목으로 교체
function injectTitleIntoH3(content: string, title: string): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // h3 안의 가장 안쪽 텍스트 노드 교체
  return content.replace(
    /(<h3[^>]*>(?:<[^>]+>)*)([^<]+)((?:<\/[^>]+>)*<\/h3>)/,
    (_, open, _text, close) => `${open}${esc(title)}${close}`
  );
}

// 대표이미지를 첫 번째 h3 바로 다음에 삽입
function insertRepresentativeImageIntoContent(content: string, imageUrl: string, title: string): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const repImg = `\n<figure style="text-align:center;margin:20px auto;">`
    + `<img src="${imageUrl}" alt="${esc(title)}" title="${esc(title)}" `
    + `style="max-width:100%;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);" loading="lazy"/>`
    + `</figure>\n`;
  return content.replace(/(<\/h3>)/, `$1${repImg}`);
}

function insertImagesIntoContent(content: string, imageUrls: string[], keyword: string): string {
  if (imageUrls.length === 0) return content;
  const imgHtml = (url: string, sectionTitle: string) => {
    const alt = sectionTitle || keyword;
    return `\n<figure style="text-align:center;margin:25px 0;">` +
      `<img src="${url}" alt="${alt}" title="${alt}" ` +
      `style="max-width:100%;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,0.15);" ` +
      `loading="lazy"/>` +
      `<figcaption style="font-size:12px;color:#888;margin-top:6px;">${alt}</figcaption>` +
      `</figure>\n`;
  };

  // 모든 H2 섹션 후에 이미지 삽입 (홀수 번째), H2 제목 텍스트 캡처
  let imgIdx = 0;
  let h2Count = 0;
  return content.replace(/(<h2[^>]*>[\s\S]*?<\/h2>)/gi, (match) => {
    h2Count++;
    if (h2Count % 2 === 1 && imgIdx < imageUrls.length) {
      const sectionTitle = extractH2Title(match);
      return match + imgHtml(imageUrls[imgIdx++], sectionTitle);
    }
    return match;
  });
}

function fixCorruptedMarkers(text: string): string {
  return text
    .replace(/===\s*(콘텐츠|내용|본문)\s*===/gi, '===CONTENT===')
    .replace(/===\s*제목\s*===/gi, '===TITLE===')
    .replace(/===\s*메타\s*===/gi, '===META===')
    .replace(/===\s*키워드s?\s*===/gi, '===KEYWORDS===');
}

function parseAiOutput(raw: string) {
  // 마크다운 코드블록 제거
  const cleaned = fixCorruptedMarkers(raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, ''));

  const extract = (tag: string) => {
    const re = new RegExp(`===${tag}===\\s*([\\s\\S]*?)(?=====[A-Za-z]|$)`, 'i');
    const match = cleaned.match(re);
    return match ? match[1].trim() : '';
  };

  // 제목: 첫 줄만 취하고 60자 초과 시 자름
  const rawTitle = extract('TITLE');
  const title = (rawTitle.split('\n').find(l => l.trim()) || rawTitle).trim().slice(0, 60);

  // 메타설명: 첫 줄만
  const meta_description = (extract('META').split('\n').find(l => l.trim()) || '').trim().slice(0, 160);

  // 콘텐츠: ===KEYWORDS=== 이후 잔류 텍스트 제거
  let content = extract('CONTENT');
  content = content.replace(/===KEYWORDS===[\s\S]*/i, '').trim();
  // AI 할루시네이션 링크 제거: <a href="...">텍스트</a> → 텍스트만 남김
  content = content.replace(/<a\s[^>]*>/gi, '').replace(/<\/a>/gi, '');

  const keywordsRaw = extract('KEYWORDS');
  const keywords = keywordsRaw.split(',').map(k => k.trim()).filter(Boolean);

  return { title, meta_description, content, keywords };
}

export async function POST(req: NextRequest) {
  // 본문을 먼저 읽음 (auth 방식에 무관하게 필요)
  const body = await req.json() as {
    keyword: string; ai_model?: string;
    clientOllamaKey?: string; clientOpenrouterKey?: string;
    clientGlobalAIKey?: string; clientGlobalAIModel?: string;
    article_id?: string; _job_token?: string;
  };

  // BOT_SECRET 우회 (clawdbot 연동)
  const botSecret = process.env.BOT_SECRET || process.env.CRON_SECRET;
  const isBot = !!(botSecret && req.headers.get('authorization') === `Bearer ${botSecret}`);

  // 내부 백그라운드 잡 인증 (jobs/route.ts에서 발급한 1회용 토큰)
  const jobUserId = body._job_token ? consumeJobToken(body._job_token) : null;
  const isInternalJob = !!jobUserId;

  let userId: string;
  if (isInternalJob) {
    userId = jobUserId!;
  } else if (isBot) {
    userId = process.env.OWNER_USER_ID!;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
    userId = user.id;
  }
  const supabase = (isBot || isInternalJob) ? createAdminClient() : await createClient();

  const { keyword, ai_model = 'qwen3', clientOllamaKey, clientOpenrouterKey, clientGlobalAIKey, clientGlobalAIModel, article_id } = body;
  if (!keyword?.trim()) return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 });

  // 1. 뉴스/블로그 수집
  const [newsItems, blogItems] = await Promise.all([
    searchNaver('news', keyword),
    searchNaver('blog', keyword),
  ]);

  // 2. AI 글 생성 + 소스 이미지 스크래핑 병렬 처리
  const prompt = buildPrompt(keyword, newsItems, blogItems);
  const allSourceItems = [...newsItems, ...blogItems];

  let rawOutput: string;
  let scrapedImages: { url: string; title: string }[] = [];
  try {
    [rawOutput, scrapedImages] = await Promise.all([
      generateText(prompt, ai_model, clientOllamaKey, clientOpenrouterKey, clientGlobalAIKey, clientGlobalAIModel),
      scrapeArticleImages(allSourceItems),
    ]);
  } catch (err) {
    return NextResponse.json({ error: `AI 생성 실패: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  // 워터마크 자동 제거
  rawOutput = cleanWatermarks(rawOutput);

  const { title, meta_description, content: rawContent, keywords } = parseAiOutput(rawOutput);
  if (!title || !rawContent) {
    return NextResponse.json({ error: 'AI 출력 파싱 실패. 다시 시도해주세요.' }, { status: 500 });
  }

  // 3. 이미지 검색 + 본문 삽입
  const { displayUrls: inlineImages, thumbUrl: bgImageUrl } = await searchInlineImages(keyword, 3);
  let content = insertImagesIntoContent(rawContent, inlineImages, keyword);
  // h3 부제목을 실제 기사 제목으로 교체
  content = injectTitleIntoH3(content, title);

  // 4. SVG 썸네일 생성
  let imageUrl: string | null = null;
  let thumbnailError: string | undefined;
  try {
    imageUrl = await generateAndUploadThumbnail(title, keyword, 'blue', bgImageUrl);
  } catch (err) {
    thumbnailError = err instanceof Error ? err.message : String(err);
    console.error('[generate] 썸네일 생성 실패:', thumbnailError);
  }
  // 대표이미지를 본문 h3 다음에 삽입
  if (imageUrl) content = insertRepresentativeImageIntoContent(content, imageUrl, title);

  // 5. 글자 수 계산
  const wordCount = content.replace(/<[^>]+>/g, '').length;

  // 6. DB 저장
  const articleData = {
    user_id: userId,
    keyword,
    focus_keyword: keyword,
    title,
    meta_description,
    content,
    representative_image_url: imageUrl,
    ai_model,
    status: 'draft',
    sources: [
      ...newsItems.map((n: {title:string;description:string;link:string}) => ({ type: 'news', ...n })),
      ...blogItems.map((b: {title:string;description:string;link:string}) => ({ type: 'blog', ...b })),
      ...scrapedImages.map(img => ({ type: 'collected_image', title: img.title, link: img.url })),
    ],
    word_count: wordCount,
    updated_at: new Date().toISOString(),
  };

  let data, error;
  if (article_id) {
    // 백그라운드 잡: 기존 placeholder 행 업데이트
    ({ data, error } = await supabase
      .from('bossai_auto_articles')
      .update(articleData)
      .eq('id', article_id)
      .select()
      .single());
  } else {
    ({ data, error } = await supabase
      .from('bossai_auto_articles')
      .insert(articleData)
      .select()
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data, keywords, word_count: wordCount, thumbnail_error: thumbnailError });
}
