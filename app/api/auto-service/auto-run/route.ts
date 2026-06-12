import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import { generateText } from '@/lib/auto-blog-ai';

export const maxDuration = 300;

// Vercel Cron 또는 수동 트리거로 호출됨
// Authorization: Bearer <CRON_SECRET>

// 동일 인스턴스 내 동시 생성 방지 (같은 userId:keyword 중복 실행 차단)
const _generatingLocks = new Set<string>();

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

async function getTrendingKeywords(): Promise<string[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
    const res = await fetch(`${baseUrl}/api/keyword/advanced?action=trending`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.keywords || []).slice(0, 20).map((k: string | { keyword?: string; text?: string }) =>
      typeof k === 'string' ? k : (k.keyword || k.text || '')
    ).filter(Boolean);
  } catch { return []; }
}


function buildPrompt(keyword: string, news: {title:string;description:string}[], blogs: {title:string;description:string}[]): string {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const sources = [
    ...news.map((n, i) => `[뉴스${i+1}] ${n.title}\n${n.description}`),
    ...blogs.map((b, i) => `[블로그${i+1}] ${b.title}\n${b.description}`),
  ].join('\n\n');

  return `당신은 대한민국 최고의 저널리스트이자 SEO 전문 블로그 작가입니다.
수집된 최신 뉴스와 블로그 자료를 철저히 분석하여, 그 내용에 기반한 정확하고 흥미로운 블로그 글을 작성합니다.

[언어 규칙 - 절대 준수] 반드시 한국어로만 작성. 중국어·일본어·러시아어 등 외국어 문자 절대 금지. 한국어 동의어가 있는 영어 단어 절대 사용 금지: marketing→마케팅, system→시스템, design→디자인, update→업데이트, feedback→피드백, platform→플랫폼, service→서비스, brand→브랜드, trend→트렌드, review→리뷰, digital→디지털, global→글로벌, online→온라인, channel→채널, quality→품질, experience→경험, customer→고객, solution→솔루션, network→네트워크, traffic→트래픽, algorithm→알고리즘, share→공유, escalation→에스컬레이션, broadcasting→방송, humanitarian→인도주의, universal→다양한, Israel→이스라엘, Palestinian→팔레스타인. 고유 브랜드명(iPhone, Google, YouTube 등)만 예외. ===TITLE===, ===META===, ===CONTENT===, ===KEYWORDS=== 마커는 반드시 영문 그대로 유지.

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
  // 1순위: 네이버 이미지 검색
  // displayUrls: item.link (원본, 브라우저 로드용)
  // thumbUrl: item.thumbnail (CDN URL, 서버 fetch 가능 → 대표이미지 배경용)
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

function injectTitleIntoH3(content: string, title: string): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return content.replace(
    /(<h3[^>]*>(?:<[^>]+>)*)([^<]+)((?:<\/[^>]+>)*<\/h3>)/,
    (_, open, _text, close) => `${open}${esc(title)}${close}`
  );
}

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
  const cleaned = fixCorruptedMarkers(raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, ''));
  const extract = (tag: string) => {
    const re = new RegExp(`===${tag}===\\s*([\\s\\S]*?)(?=====[A-Za-z]|$)`, 'i');
    const m = cleaned.match(re);
    return m ? m[1].trim() : '';
  };
  const rawTitle = extract('TITLE');
  const title = (rawTitle.split('\n').find(l => l.trim()) || rawTitle).trim().slice(0, 60);
  const meta_description = (extract('META').split('\n').find(l => l.trim()) || '').trim().slice(0, 160);
  let content = extract('CONTENT');
  content = content.replace(/===KEYWORDS===[\s\S]*/i, '').trim();
  return { title, meta_description, content };
}

async function generateArticleForUser(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  keyword: string,
  aiModel: string,
  clientOllamaKey?: string,
  clientOpenrouterKey?: string,
  clientGlobalAIKey?: string,
  clientGlobalAIModel?: string,
): Promise<{ ok: boolean; reason?: string; articleId?: string }> {
  // 동일 인스턴스 내 중복 실행 차단
  const lockKey = `${userId}:${keyword}`;
  if (_generatingLocks.has(lockKey)) return { ok: false, reason: '이미 생성 중 (동시 실행 방지)' };

  // 최근 7일 내 같은 키워드 글 있으면 스킵 (generating 포함)
  const { data: existing } = await supabase
    .from('bossai_auto_articles')
    .select('id')
    .eq('user_id', userId)
    .eq('keyword', keyword)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (existing && existing.length > 0) return { ok: false, reason: `중복 키워드 (7일 이내 생성됨)` };

  // 선점: 생성 전 플레이스홀더 INSERT → 다른 동시 요청이 위 중복 체크에서 걸림
  _generatingLocks.add(lockKey);
  const { data: placeholder, error: placeholderErr } = await supabase
    .from('bossai_auto_articles')
    .insert({
      user_id: userId,
      keyword,
      focus_keyword: keyword,
      title: `⏳ 생성 중... (${keyword})`,
      status: 'generating',
      content: '',
      ai_model: aiModel,
    })
    .select('id')
    .single();

  if (placeholderErr || !placeholder) {
    _generatingLocks.delete(lockKey);
    return { ok: false, reason: 'DB 선점 실패' };
  }

  try {
    const [news, blogs] = await Promise.all([
      searchNaver('news', keyword),
      searchNaver('blog', keyword),
    ]);

    const prompt = buildPrompt(keyword, news, blogs);
    const allSourceItems = [...news, ...blogs];

    let rawOutput: string;
    let scrapedImages: { url: string; title: string }[] = [];
    [rawOutput, scrapedImages] = await Promise.all([
      generateText(prompt, aiModel, clientOllamaKey, clientOpenrouterKey, clientGlobalAIKey, clientGlobalAIModel),
      scrapeArticleImages(allSourceItems),
    ]);

    const { title, meta_description, content: rawContent } = parseAiOutput(rawOutput);
    if (!title || !rawContent) throw new Error('AI 출력 파싱 실패');

    const { displayUrls: inlineImages, thumbUrl: bgImageUrl } = await searchInlineImages(keyword, 3);
    let content = insertImagesIntoContent(rawContent, inlineImages, keyword);
    content = injectTitleIntoH3(content, title);
    let imageUrl: string | null = null;
    try {
      imageUrl = await generateAndUploadThumbnail(title, keyword, 'blue', bgImageUrl);
    } catch (thumbErr) {
      console.error(`[auto-run] 썸네일 실패 (${keyword}):`, thumbErr instanceof Error ? thumbErr.message : thumbErr);
    }
    if (imageUrl) content = insertRepresentativeImageIntoContent(content, imageUrl, title);
    const wordCount = content.replace(/<[^>]+>/g, '').length;

    await supabase.from('bossai_auto_articles').update({
      title,
      meta_description,
      content,
      representative_image_url: imageUrl,
      status: 'draft',
      sources: [
        ...news.map((n: {title:string;description:string;link:string}) => ({ type: 'news', ...n })),
        ...blogs.map((b: {title:string;description:string;link:string}) => ({ type: 'blog', ...b })),
        ...scrapedImages.map(img => ({ type: 'collected_image', title: img.title, link: img.url })),
      ],
      word_count: wordCount,
    }).eq('id', placeholder.id);

    return { ok: true, articleId: placeholder.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auto-run] ${keyword} 생성 실패:`, msg);
    await supabase.from('bossai_auto_articles').update({
      status: 'failed',
      title: `❌ 생성 실패 (${keyword})`,
      meta_description: msg.slice(0, 300),
    }).eq('id', placeholder.id);
    return { ok: false, reason: msg };
  } finally {
    _generatingLocks.delete(lockKey);
  }
}

export async function GET(req: NextRequest) {
  // Vercel Cron 보안 검증
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 자동실행 활성화된 모든 사용자 조회
  const { data: settings, error: settingsErr } = await supabase
    .from('bossai_auto_settings')
    .select('user_id, ai_model, max_per_run, custom_keywords, use_gpt, use_openrouter, naver_auto_publish')
    .eq('enabled', true);

  if (settingsErr || !settings?.length) {
    return NextResponse.json({ message: '자동실행 활성화된 사용자 없음', count: 0 });
  }

  // 트렌딩 키워드 한 번만 조회 (전체 공유)
  const trendKeywords = await getTrendingKeywords();

  const summary: { userId: string; generated: number; keywords: string[] }[] = [];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
  const cronSecret = process.env.CRON_SECRET;

  for (const setting of settings) {
    const { user_id, ai_model, max_per_run, custom_keywords, use_gpt, use_openrouter, naver_auto_publish } = setting;

    // 사용자 커스텀 키워드 우선, 없으면 트렌딩 키워드 사용
    const keywordsToUse = (custom_keywords?.length > 0 ? custom_keywords : trendKeywords).slice(0, max_per_run * 2);

    let generated = 0;
    const usedKeywords: string[] = [];

    for (const keyword of keywordsToUse) {
      if (generated >= max_per_run) break;
      const effectiveModel = use_gpt ? 'openai' : use_openrouter ? 'openrouter' : (ai_model || 'qwen3');
      const result = await generateArticleForUser(supabase, user_id, keyword, effectiveModel);
      if (result.ok) {
        generated++;
        usedKeywords.push(keyword);

        // 네이버 자동 발행
        if (naver_auto_publish && result.articleId && cronSecret) {
          try {
            const { data: article } = await supabase
              .from('bossai_auto_articles')
              .select('title, content, focus_keyword')
              .eq('id', result.articleId)
              .single();
            if (article) {
              const pubRes = await fetch(`${appUrl}/api/naver/publish-internal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
                body: JSON.stringify({
                  user_id,
                  title: article.title,
                  content: article.content,
                  tags: article.focus_keyword ? [article.focus_keyword] : [],
                }),
              });
              if (pubRes.ok) {
                const pubData = await pubRes.json();
                await supabase.from('bossai_auto_articles').update({
                  status: 'published',
                  blog_platforms: ['naver'],
                  published_urls: { naver: pubData.url || '' },
                  published_at: new Date().toISOString(),
                }).eq('id', result.articleId);
              }
            }
          } catch (pubErr) {
            console.error(`[auto-run] 네이버 발행 실패 (${keyword}):`, pubErr instanceof Error ? pubErr.message : pubErr);
          }
        }
      }
    }

    // 실행 결과 업데이트
    await supabase.from('bossai_auto_settings').update({
      last_run_at: new Date().toISOString(),
      last_run_status: generated > 0 ? 'success' : 'skipped',
      last_run_count: generated,
    }).eq('user_id', user_id);

    summary.push({ userId: user_id, generated, keywords: usedKeywords });
  }

  const totalGenerated = summary.reduce((s, u) => s + u.generated, 0);
  console.log(`[auto-run] 완료: ${settings.length}명 처리, 총 ${totalGenerated}개 생성`);

  return NextResponse.json({ ok: true, users: settings.length, total_generated: totalGenerated, summary });
}

// 키워드 품질 검증: 너무 짧거나 잘리거나 의미없는 키워드 제거
function isQualityKeyword(kw: string): boolean {
  const t = kw.trim();
  if (t.length < 3) return false;                      // 너무 짧음
  if (/^\d+$/.test(t)) return false;                   // 순수 숫자
  if (/[ㄱ-ㅎㅏ-ㅣ]$/.test(t)) return false;         // 자음/모음으로 끝남 (잘린 한글)
  if (/^[a-zA-Z]{1,2}$/.test(t)) return false;        // 알파벳 1-2자
  if (/^[가-힣]{1,2}$/.test(t)) return false;         // 한글 1-2자
  if (/(.)\1{3,}/.test(t)) return false;               // 같은 글자 4번 이상 반복
  return true;
}

// 수동 트리거 — SSE 스트리밍으로 실시간 진행 상황 전달
export async function POST(req: NextRequest) {
  const supabase = await (await import('@/lib/supabase-server')).createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { keywords: customKws, ai_model = 'qwen3', max = 3, clientOllamaKey, clientOpenrouterKey, clientGlobalAIKey, clientGlobalAIModel, naver_auto_publish: naverAutoPub } = await req.json();
  const adminSupabase = createAdminClient();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
      };

      try {
        send({ type: 'start' });

        const rawKeywords = customKws?.length > 0 ? customKws : await getTrendingKeywords();
        const keywordsToUse = rawKeywords.filter(isQualityKeyword).slice(0, max * 3);
        send({ type: 'keywords', keywords: keywordsToUse.slice(0, max) });

        let generated = 0;
        const usedKeywords: string[] = [];
        const errors: { keyword: string; reason: string }[] = [];

        for (const keyword of keywordsToUse) {
          if (generated >= max) break;
          send({ type: 'progress', keyword, status: 'generating' });

          const result = await generateArticleForUser(adminSupabase, user!.id, keyword, ai_model, clientOllamaKey, clientOpenrouterKey, clientGlobalAIKey, clientGlobalAIModel);
          if (result.ok) {
            generated++;
            usedKeywords.push(keyword);
            send({ type: 'progress', keyword, status: 'done', generated });

            // 네이버 자동 발행
            if (naverAutoPub && result.articleId && process.env.CRON_SECRET) {
              try {
                const { data: article } = await adminSupabase
                  .from('bossai_auto_articles')
                  .select('title, content, focus_keyword')
                  .eq('id', result.articleId)
                  .single();
                if (article) {
                  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://loov.co.kr';
                  const pubRes = await fetch(`${baseUrl}/api/naver/publish-internal`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
                    body: JSON.stringify({
                      user_id: user!.id,
                      title: article.title,
                      content: article.content,
                      tags: article.focus_keyword ? [article.focus_keyword] : [],
                    }),
                  });
                  if (pubRes.ok) {
                    const pubData = await pubRes.json();
                    await adminSupabase.from('bossai_auto_articles').update({
                      status: 'published',
                      blog_platforms: ['naver'],
                      published_urls: { naver: pubData.url || '' },
                      published_at: new Date().toISOString(),
                    }).eq('id', result.articleId);
                    send({ type: 'naver_published', keyword, url: pubData.url });
                  } else {
                    const errData = await pubRes.json().catch(() => ({}));
                    send({ type: 'naver_error', keyword, reason: errData.error || '발행 실패' });
                  }
                }
              } catch (pubErr) {
                send({ type: 'naver_error', keyword, reason: pubErr instanceof Error ? pubErr.message : String(pubErr) });
              }
            }
          } else if (result.reason && !result.reason.includes('중복')) {
            errors.push({ keyword, reason: result.reason });
            send({ type: 'progress', keyword, status: 'error', reason: result.reason });
          }
        }

        await adminSupabase.from('bossai_auto_settings').upsert({
          user_id: user!.id,
          last_run_at: new Date().toISOString(),
          last_run_status: generated > 0 ? 'success' : (errors.length > 0 ? 'error' : 'skipped'),
          last_run_count: generated,
        }, { onConflict: 'user_id' });

        send({ type: 'done', generated, keywords: usedKeywords, errors });
      } catch (err) {
        send({ type: 'error', reason: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no', // nginx 버퍼링 비활성화
    },
  });
}
