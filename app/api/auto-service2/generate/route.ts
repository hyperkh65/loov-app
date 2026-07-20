import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import { generateText } from '@/lib/auto-blog-ai';
import { getSetting } from '@/lib/get-setting';
import { cleanWatermarks, ANTI_WATERMARK_PROMPT } from '@/lib/ai-watermark';

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

[언어 규칙 - 절대 준수] 반드시 한국어로만 작성. 중국어·일본어·러시아어 등 외국어 문자 절대 금지. 한국어로 대체할 수 있는 영어 단어 사용 금지 — 고유 브랜드명(아이폰, 구글, 유튜브 등)·전문용어·고유명사만 예외. 예시: content→내용, data→자료, update→갱신, trend→흐름/동향, platform→누리집/서비스, brand→상표, digital→전산/디지털, global→세계적, online→온라인, channel→경로/채널, quality→품질, solution→해결책, network→연결망, share→공유. ===TITLE===, ===META===, ===CONTENT===, ===KEYWORDS=== 마커는 영문 그대로 유지. 위반 시 응답 무효.

${ANTI_WATERMARK_PROMPT}

═══════════════════════════════════════
■ 글 작성 핵심 원칙 (반드시 준수)
═══════════════════════════════════════

【제목 원칙 - 매우 중요】
- 제목에 콜론(:) · 대시(-) · 세미콜론(;) · 물결(~) · 따옴표 · 느낌표(!) 절대 금지
- "키워드: 설명" 또는 "키워드 - 설명" 형식 절대 금지
- 뉴스 헤드라인처럼 자연스럽게 이어지는 하나의 문장 또는 어구로 작성
- 포커스 키워드를 앞부분에 자연스럽게 녹여낼 것 (억지로 끼워 넣기 금지)
- 예시(금지): "스마트폰: 최신 기능과 구입 방법" / 예시(허용): "스마트폰 최신 기능 총정리와 구입 시 꼭 확인할 점"
- 제목에 숫자 포함 필수: "5가지", "3단계", "TOP 7" 등 자연스러운 카운팅 숫자를 반드시 넣을 것
- 제목에 연도·월·일 형태의 날짜 절대 금지: "2025년", "2026년 6월", "2025.05", "최신" 등 연도/날짜 표현 금지
- 날짜는 본문 내용 설명에는 사용 가능하지만 제목에는 절대 불가

【금지 표현 - AI 냄새 나는 표현 일체 금지】
- "~에 대해 알아보겠습니다" / "~를 살펴보겠습니다" / "~에 대해 살펴볼게요"
- "중요합니다" / "매우 중요한" / "효과적인" / "다양한 방면에서" / "주목할 만한"
- "여러분" / "함께 알아봐요" / "결론적으로" / "궁금하셨나요" / "핵심은 바로"
- "~라고 할 수 있습니다" / "~라고 볼 수 있습니다" (우회적 AI 표현)
- "이 글에서는" / "본 포스팅에서는" / "오늘은 ~에 대해"
- "이번 글에서는" / "지금부터" / "간단히 말씀드리면" / "정리해 보겠습니다"
- "많은 분들이 궁금해하시는" / "쉽게 설명하자면" / "알아보도록 하겠습니다"
- H2 소제목 6개 중 4개 이상이 "X의 Y" 패턴이면 금지 (예: "제품의 특징", "사건의 배경")
- 소제목이 "~하는 방법", "~의 모든 것", "~완벽 가이드", "~총정리" 패턴으로 반복 금지
- 숫자 없이 "여러" / "다양한" / "많은" 표현 남발 금지 — 구체적 수치로 대체할 것
- 허위 경험·취재 표현 절대 금지: "직접 경험해보니" / "실제로 써봤더니" / "제가 직접 인터뷰한" / "취재 결과" / "현장에서 확인한" / "직접 사용해본 결과" / "저도 해봤는데" / "써보니 느낀 점" — AI가 실제로 할 수 없는 행위를 한 것처럼 서술하는 표현 모두 금지

【두괄식 원칙】
- 모든 단락의 첫 문장에 핵심 결론/사실을 먼저 쓸 것
- 독자가 첫 문장만 읽어도 그 단락의 핵심을 파악할 수 있어야 함

【소제목 원칙】
- 소제목은 키워드의 실제 맥락과 성격에 맞게 직접 결정할 것
- 고정 템플릿 소제목(예: "X의 핵심 특징과 장점", "X 성공 비결") 절대 사용 금지
- 수집된 참고자료의 핵심 내용을 기반으로 소제목 구성
- H2 섹션들은 논리적 흐름으로 연결되어야 함 (각 섹션이 이전 내용을 발전시킬 것)

【품질 원칙】
- 전문성: 단순 사실 나열이 아닌 배경·원인·영향을 구체적으로 분석
- 권위: 수치·날짜·인물명·출처 기반 사실 포함 — 지어내기 금지
- 신뢰: 과장 없는 균형 잡힌 시각, 장단점 모두 서술
- 독자에게 실질적으로 유용한 정보 제공 — 검색 의도를 정확히 충족할 것
- 참고자료의 구체적 내용(날짜, 인물명, 수치, 사건 경위)을 반드시 반영

【문체 원칙】
- 객관적이고 명확한 문체, 불필요한 감탄이나 과장 표현 금지
- 읽기 쉽고 간결하게 — 불필요한 문장 늘리기 금지
- 섹션 간 자연스러운 연결: 내용으로 이어지도록 할 것
- "다음으로~", "이어서~" 같은 기계적 연결어 금지

【CTA 버튼 원칙 — 필수 3개】
- 도입부 아래, 섹션3 직후, FAQ 직전에 각 1개씩 총 3개 외부링크 버튼 반드시 삽입
- 글의 주제와 키워드에 가장 관련성 높은 외부 권위 사이트를 AI가 직접 판단해 선택
- 정부·공공기관·공인기관·주요 언론사·학술기관 등 독자가 신뢰할 수 있는 실제 존재하는 사이트를 사용
- 버튼마다 서로 다른 사이트 사용 (같은 사이트 반복 금지)
- 각 버튼 텍스트는 해당 링크 내용에 맞는 구체적 행동 유도 문구로 작성
- 3개 버튼 배경색: 첫 번째 #1a73e8, 두 번째 #6a1b9a, 세 번째 #10b981
- 존재하지 않거나 확실하지 않은 URL 사용 금지 — 실제 운영 중인 사이트만 사용

【분량 원칙】
- 순수 텍스트(HTML 태그 제외) 4500~6000자 내외를 목표로 작성
- H2 섹션 6개, 각 섹션 최소 2개 단락, 각 단락 3~5문장
- 억지로 늘리기 금지 — 중복·반복 없이 내용이 충분하면 자연스럽게 마무리

【키워드 밀도 원칙】
- 포커스 키워드 "${keyword}"를 본문 전체에 8~12회 자연스럽게 분산 배치
- H2 소제목 6개 중 최소 2개에 포커스 키워드를 자연스럽게 포함
- 같은 문장 안에 키워드 2번 이상 반복 금지 — 유의어·변형어 혼용으로 자연스럽게

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
[독자를 즉시 끌어당기는 제목. 아래 스타일 중 내용에 가장 잘 맞는 것 선택:
 ① 궁금증 유발형: "~이유가 따로 있었습니다" / "~진짜 이유 3가지" / "~몰랐던 사실"
 ② 사실 강조형: 핵심 수치나 팩트로 시작하는 임팩트 있는 헤드라인
 ③ 정보 제공형: "~총정리" / "~핵심 N가지" 형식의 명확한 정보성 제목
콜론(:)·대시(-)·세미콜론(;) 절대 금지. 포커스 키워드 자연스럽게 포함. 숫자 반드시 포함. 40-60자]
===META===
[이 글에서 다루는 핵심 정보를 간결하게 요약. 포커스 키워드 "${keyword}" 자연스럽게 포함 필수. "상세 분석입니다" / "~에 대해 알아봐요" / "확인해보세요" 같은 표현 절대 금지. 독자가 클릭하고 싶게 만드는 구체적 문장. 130-160자]
===CONTENT===
<p data-ke-size="size16"><span style="background-color:#fafafa;color:#333333;">[도입부 — 핵심 사실이나 수치로 시작하여 독자의 관심을 끌 것. 포커스 키워드와 주요 팩트(날짜·수치 포함)를 자연스럽게 연결. 총 2-3문장. "~에 대해 알아보겠습니다" 절대 금지]</span></p>
<p data-ke-size="size16">[참고자료의 핵심 배경과 맥락 2-3문장. 구체적 수치·날짜 포함]</p>
<p data-ke-size="size16">[이 글에서 다루는 핵심 내용 2-3가지 간략 예고]</p>
<div style="background-color:#f5f5f5;padding:15px;border-radius:8px;font-style:italic;margin-bottom:25px;font-size:15px;"><b>[핵심 한줄 요약]</b> [참고자료 기반 2-3문장 요약]</div>
<div style="background-color:#f8f9fa;border:1px solid #e0e0e0;border-radius:10px;padding:20px 25px;margin:25px 0;">
<p style="font-size:17px;font-weight:bold;margin:0 0 12px;color:#1a73e8;">📋 목차</p>
<ol style="margin:0;padding-left:22px;line-height:2.2;">
<li><a href="#section1" style="color:#333;text-decoration:none;">[아래 1번 H2 소제목과 동일한 텍스트]</a></li>
<li><a href="#section2" style="color:#333;text-decoration:none;">[아래 2번 H2 소제목과 동일한 텍스트]</a></li>
<li><a href="#section3" style="color:#333;text-decoration:none;">[아래 3번 H2 소제목과 동일한 텍스트]</a></li>
<li><a href="#section4" style="color:#333;text-decoration:none;">[아래 4번 H2 소제목과 동일한 텍스트]</a></li>
<li><a href="#section5" style="color:#333;text-decoration:none;">[아래 5번 H2 소제목과 동일한 텍스트]</a></li>
<li><a href="#section6" style="color:#333;text-decoration:none;">[아래 6번 H2 소제목과 동일한 텍스트]</a></li>
<li><a href="#faq" style="color:#333;text-decoration:none;">자주 묻는 질문</a></li>
</ol>
</div>
<h3 style="margin-bottom:15px;" data-ke-size="size23"><b><span style="background-color:#fafafa;color:#333333;">[이 글의 핵심 주제를 담은 한 문장 — 위 도입부와 자연스럽게 이어지는 부제목. 포커스 키워드 포함. 독자가 계속 읽고 싶게 만드는 구체적 문장]</span></b></h3>
<div style="text-align:center;margin:30px 0;"><a href="[CTA1: 글 주제/키워드와 직접 관련된 외부 권위 사이트 URL — AI가 판단해 선택]" target="_blank" style="display:inline-block;background:#1a73e8;color:#fff;padding:14px 28px;border-radius:8px;font-size:16px;font-weight:bold;text-decoration:none;">[CTA1: 해당 사이트 내용에 맞는 구체적 버튼 텍스트]</a></div>

<h2 id="section1" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>1. [참고자료 기반 소제목 — 핵심 현황/팩트]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 첫 문장에 핵심 사실. 구체적 수치/날짜/사례 포함. 배경과 원인 분석]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 내용: 독자에게 실질적으로 유용한 정보. 불필요한 문장 늘리기 금지]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 1-2문장]</div>

<h2 id="section2" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>2. [참고자료 기반 소제목 — 원인/배경/맥락]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 첫 문장에 핵심 사실. 왜 이런 상황이 발생했는지 인과관계 설명]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[역사적·구조적 배경. 독자적 분석 포함]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 1-2문장]</div>

<h2 id="section3" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>3. [참고자료 기반 소제목 — 구체적 내용/방법/사례]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 첫 문장. 독자가 바로 활용할 수 있는 구체적 내용]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[실용적 분석. 단계별이나 사례 중심 서술]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 1-2문장]</div>
<div style="text-align:center;margin:30px 0;"><a href="[CTA2: CTA1과 다른 외부 권위 사이트 URL — 글 내용의 이 시점에서 독자에게 가장 유용한 사이트]" target="_blank" style="display:inline-block;background:#6a1b9a;color:#fff;padding:14px 28px;border-radius:8px;font-size:16px;font-weight:bold;text-decoration:none;">[CTA2: 해당 사이트 내용에 맞는 구체적 버튼 텍스트]</a></div>

<h2 id="section4" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>4. [참고자료 기반 소제목 — 비교/차이/선택 기준]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 첫 문장. 비교 대상이나 선택 기준 명확히 제시]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[균형 잡힌 분석. 장단점 모두 서술]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 1-2문장]</div>

<h2 id="section5" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>5. [참고자료 기반 소제목 — 주의사항/문제점/한계]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 첫 문장. 독자가 놓치기 쉬운 리스크나 주의점]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[실제 사례 기반 분석]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 1-2문장]</div>

<h2 id="section6" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>6. [참고자료 기반 소제목 — 전망/결론/실천 방향]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식 첫 문장. 앞으로의 전망과 독자에게 필요한 정보]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[구체적 전망 분석. 독자가 실제로 참고할 수 있는 행동 지침]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 1-2문장]</div>

<div class="single-summary-card" style="border:2px solid #ccc;padding:20px;border-radius:8px;max-width:800px;background-color:#ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.1);margin:20px auto;">
<div class="card-header" style="display:flex;align-items:center;border-bottom:2px solid #1a73e8;padding-bottom:10px;margin-bottom:10px;"><span style="font-size:24px;color:#1a73e8;margin-right:10px;">💡</span><h3 style="font-size:20px;color:#1a73e8;margin:0;" data-ke-size="size23">핵심 요약</h3></div>
<div class="card-content" style="font-size:16px;line-height:1.5;color:#333;">
<div class="section" style="margin-bottom:10px;"><b>첫 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[섹션1-2 핵심 팩트 1문장]</span></div>
<div class="section" style="margin-bottom:10px;"><b>두 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[섹션3-4 실용 포인트 1문장]</span></div>
<div class="section" style="margin-bottom:10px;"><b>세 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[섹션5 주의사항 1문장]</span></div>
<div class="section" style="margin-bottom:10px;"><b>독자 행동 지침:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[독자가 지금 당장 할 수 있는 구체적 행동 1문장]</span></div>
</div>
<div class="card-footer" style="font-size:14px;color:#777;border-top:1px dashed #ddd;padding-top:10px;margin-top:10px;text-align:center;">[마무리: 독자에게 전하는 한 문장]</div>
</div>
<div style="text-align:center;margin:30px 0;"><a href="[CTA3: CTA1·CTA2와 다른 외부 권위 사이트 URL — 마무리 시점에서 독자의 다음 행동을 유도하는 사이트]" target="_blank" style="display:inline-block;background:#10b981;color:#fff;padding:14px 28px;border-radius:8px;font-size:16px;font-weight:bold;text-decoration:none;">[CTA3: 해당 사이트 내용에 맞는 구체적 버튼 텍스트]</a></div>

<h2 id="faq" style="font-size:22px;color:#1a73e8;margin:30px 0 14px;padding-bottom:8px;border-bottom:2px solid #dcdcdc;" data-ke-size="size26"><b>자주 묻는 질문</b></h2>
<div style="margin:22px 0 0;">
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">1. [정의/개요 관련 질문 — "~는 무엇인가요?" 또는 "~가 왜 이렇게 화제인가요?" 형식. 참고자료 기반]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장. 수치나 사실 포함]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">2. [원인/이유 관련 질문 — "왜 ~한 건가요?" 또는 "어떻게 ~가 됐나요?" 형식. Q1과 완전히 다른 각도]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">3. [방법/절차 관련 질문 — "어떻게 ~하면 되나요?" 또는 "뭘 확인해야 하나요?" 형식. Q1·Q2와 완전히 다른 각도]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">4. [비교/차이 관련 질문 — "~와 ~의 차이는?" 또는 "어느 쪽이 더 낫나요?" 형식. 앞 질문들과 완전히 다른 각도]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">5. [주의사항/리스크 관련 질문 — "~할 때 조심할 점은?" 또는 "단점이나 한계는?" 형식. 앞 질문들과 완전히 다른 각도]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">6. [전망/추천 관련 질문 — "앞으로 ~는 어떻게 될까요?" 또는 "결론적으로 추천한다면?" 형식. 앞 5개와 완전히 다른 각도]</div>
<div style="color:#555;">[구체적이고 정확한 답변 2-3문장]</div>
</div>
</div>

===KEYWORDS===
[10개 키워드 — 서로 다른 관점으로 선택: ①포커스 키워드 변형 2개 ②관련 개념어 2개 ③방법/실용 검색어 2개 ④비교/선택 검색어 2개 ⑤롱테일 구체 검색어 2개. 비슷한 단어 반복 절대 금지. 쉼표 구분]
===SLUG===
[포커스 키워드를 WordPress URL slug로 변환. 한국어는 그대로, 영문은 소문자+하이픈. 공백→하이픈, 특수문자 제거. 예: "강아지 사료 추천" → "강아지-사료-추천"]

⚠️ 최종 주의사항:
- 모든 [] 대괄호 지시문은 실제 내용으로 반드시 교체 (대괄호 자체도 제거)
- 참고자료의 실제 내용을 기반으로 작성 (지어내기 금지)
- 소제목은 키워드 성격에 맞게 직접 결정 (위 [소제목 힌트]는 방향만 제시)
- HTML 태그 외 마크다운, 설명문, 대괄호 최종 출력에 절대 포함 금지
- 제목에 콜론(:) 절대 금지 — 이것이 위반되면 응답 전체 무효`;
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
  const repImg = `\n<p style="text-align:center;margin:20px 0;width:100%;">`
    + `<img src="${imageUrl}" alt="${esc(title)}" title="${esc(title)}" width="100%" `
    + `style="width:100%;max-width:100%;height:auto;display:block;margin:0 auto;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);" loading="lazy"/>`
    + `</p>\n`;
  return content.replace(/(<\/h3>)/, `$1${repImg}`);
}

function insertImagesIntoContent(content: string, imageUrls: string[], keyword: string): string {
  if (imageUrls.length === 0) return content;
  const imgHtml = (url: string, sectionTitle: string) => {
    const alt = sectionTitle || keyword;
    return `\n<p style="text-align:center;margin:25px 0;width:100%;">` +
      `<img src="${url}" alt="${alt}" title="${alt}" width="100%" ` +
      `style="width:100%;max-width:100%;height:auto;display:block;margin:0 auto;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,0.15);" ` +
      `loading="lazy"/>` +
      `<span style="display:block;font-size:12px;color:#888;margin-top:6px;text-align:center;">${alt}</span>` +
      `</p>\n`;
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

  // 메타설명: 첫 줄만, 문장 경계에서 자름
  const rawMeta = (extract('META').split('\n').find(l => l.trim()) || '').trim();
  const meta_description = rawMeta.length <= 160 ? rawMeta : (() => {
    const cut = rawMeta.slice(0, 160);
    const lastEnd = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'), cut.lastIndexOf('。'));
    if (lastEnd > 80) return cut.slice(0, lastEnd + 1);
    const lastSpace = cut.lastIndexOf(' ');
    return lastSpace > 80 ? cut.slice(0, lastSpace) : cut;
  })();

  // 콘텐츠: ===KEYWORDS=== 이후 잔류 텍스트 제거
  let content = extract('CONTENT');
  content = content.replace(/===KEYWORDS===[\s\S]*/i, '').trim();

  const keywordsRaw = extract('KEYWORDS');
  const keywords = keywordsRaw.split(',').map(k => k.trim()).filter(Boolean);

  const slugRaw = (extract('SLUG').split('\n').find(l => l.trim()) || '').trim();
  const slug = slugRaw || '';

  return { title, meta_description, content, keywords, slug };
}

export async function POST(req: NextRequest) {
  // BOT_SECRET 우회 (clawdbot 연동)
  const botSecret = process.env.BOT_SECRET || process.env.CRON_SECRET;
  const isBot = !!(botSecret && req.headers.get('authorization') === `Bearer ${botSecret}`);

  let userId: string;
  if (isBot) {
    userId = process.env.OWNER_USER_ID!;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
    userId = user.id;
  }
  const supabase = isBot ? await createAdminClient() : await createClient();

  const { keyword, ai_model = 'qwen3', clientOllamaKey, clientOpenrouterKey, clientGlobalAIKey, clientGlobalAIModel } = await req.json();
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

  // 포맷 실패 감지: ===TITLE=== 마커 없으면 Ollama 다른 모델로 1회 재시도
  if (!rawOutput.includes('===TITLE===') || !rawOutput.includes('===CONTENT===')) {
    const retryModel = ai_model === 'mistral-large-3' ? 'nemotron-3-super' : 'mistral-large-3';
    try {
      const retried = cleanWatermarks(await generateText(
        prompt, retryModel, clientOllamaKey, clientOpenrouterKey, clientGlobalAIKey, clientGlobalAIModel,
      ));
      if (retried.includes('===TITLE===') && retried.includes('===CONTENT===')) {
        rawOutput = retried;
      }
    } catch { /* 재시도 실패 → 원본으로 진행 */ }
  }

  const { title, meta_description, content: rawContent, keywords, slug } = parseAiOutput(rawOutput);
  if (!title || !rawContent) {
    return NextResponse.json({ error: 'AI 출력 파싱 실패. 다시 시도해주세요.' }, { status: 500 });
  }

  // 3. 이미지 검색 + 본문 삽입
  const { displayUrls: inlineImages, thumbUrl: bgImageUrl } = await searchInlineImages(keyword, 3);
  let content = insertImagesIntoContent(rawContent, inlineImages, keyword);
  // h3 부제목은 AI가 작성한 후킹 문장 그대로 유지 (injectTitleIntoH3 제거)

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
  const { data, error } = await supabase
    .from('bossai_auto_articles')
    .insert({
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
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data, keywords, slug, word_count: wordCount, thumbnail_error: thumbnailError });
}
