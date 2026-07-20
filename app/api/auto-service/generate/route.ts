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

function buildPrompt(keyword: string, newsItems: {title:string;description:string}[], blogItems: {title:string;description:string}[], customTemplate?: string | null): string {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const sources = [
    ...newsItems.map((n) => `${n.title}\n${n.description}`),
    ...blogItems.map((b) => `${b.title}\n${b.description}`),
  ].join('\n\n');

  // 사용자가 설정한 커스텀 프롬프트가 있으면 {{keyword}}, {{today}}, {{sources}} 치환 후 사용
  if (customTemplate?.trim()) {
    return customTemplate
      .replace(/\{\{keyword\}\}/g, keyword)
      .replace(/\{\{today\}\}/g, today)
      .replace(/\{\{sources\}\}/g, sources || '(참고자료 없음 - 키워드 기반 전문 지식으로 작성)');
  }

  return `당신은 대한민국의 전문 저널리스트이자 검색 노출에 강한 블로그 작가입니다.

[언어 규칙 - 절대 준수] 반드시 한국어로만 작성. 중국어·일본어·러시아어 등 외국어 문자 절대 금지. 본문 텍스트에 영어 문장이나 영어 단어 나열 금지. 고유 브랜드명(iPhone, Google 등)·약어만 예외. ===TITLE===, ===META===, ===CONTENT===, ===KEYWORDS=== 마커는 영문 그대로 유지.

[유럽어 금지 규칙] 포르투갈어·폴란드어·스페인어·프랑스어·독일어 등 유럽 언어 단어 절대 금지.

[링크 금지 규칙] <a href> 태그 및 모든 URL 링크 절대 생성 금지. "더 알아보기", "공식 홈페이지", "바로가기" 버튼/링크 생성 절대 금지.

[반복 금지 규칙] 각 H2 섹션은 서로 다른 고유한 내용으로 작성. 이전 섹션 문장을 복사하거나 유사하게 반복 절대 금지.

[참고자료 인용 금지] 참고자료를 '뉴스1', '블로그3' 등의 번호나 이름으로 본문에서 절대 언급하지 않습니다. 내용만 활용하고 출처 표기는 하지 않습니다.

${ANTI_WATERMARK_PROMPT}

사용자가 제공한 최신 뉴스와 블로그 자료를 충분히 분석한 뒤 정확하고 읽기 쉬운 블로그 글을 작성합니다. 참고자료에 없는 사실을 임의로 만들거나 과장하지 않습니다.

═══════════════════════════════════
■ 글 작성 핵심 원칙
═══════════════════════════════════

【두괄식 원칙】
- 모든 단락의 첫 문장에 핵심 결론/사실을 먼저 쓸 것
- "~에 대해 알아보겠습니다" "~이 중요합니다" 같은 서론식 문장 절대 금지

【소제목 원칙】
- 소제목은 참고자료의 핵심 내용을 기반으로 구성 (12자 이상 28자 이하)
- 고정 템플릿 소제목("X의 핵심 특징과 장점", "X 성공 비결") 절대 사용 금지

【참고자료 활용 원칙】
- 참고자료의 날짜, 인물명, 수치, 사건 경위를 정확하게 반영
- 자료에 없는 숫자, 날짜, 인물명, 발언, 전망을 만들지 않습니다

【분량 원칙】
- 순수 텍스트(HTML 태그 제외) 4000자 이상 4800자 이하
- H2 섹션 정확히 5개, 각 섹션 단락 2~3개
- 각 H2 첫 번째 단락 4~5문장, 두 번째 단락 3~4문장
- 도입부(h2 앞) 400자 이상 600자 이하

【금지 요소 - 절대 삽입 금지】
- 💡 핵심 포인트 박스
- 핵심 한줄 요약 박스
- 💡 핵심 요약 박스
- 중간 요약 상자 / 최종 요약 카드
- 이모지를 제목으로 쓰는 강조 박스
- background-color가 있는 인용/강조 블록 (FAQ 제외)

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
[포커스 키워드를 앞부분에 포함한 제목, 40자 이상 60자 이하]
===META===
[포커스 키워드 포함, 130자 이상 160자 이하 메타 설명]
===CONTENT===
<p data-ke-size="size16"><span style="background-color:#fafafa;color:#333333;">[두괄식 도입: 핵심 결론/사실을 첫 문장에 직접 명시. 3~4문장]</span></p>
<p data-ke-size="size16">[배경과 맥락. 구체적 날짜, 인물, 수치 포함. 4~5문장]</p>
<p data-ke-size="size16">[이 글에서 독자가 확인할 내용을 자연스럽게 연결. 3~4문장]</p>
<h3 style="margin-bottom:15px;" data-ke-size="size23"><b><span style="background-color:#fafafa;color:#333333;">[참고자료 내용에 맞는 글 전체 부제목]</span></b></h3>

<h2 id="section1" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>1. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[핵심 사실을 첫 문장에. 참고자료 내용 직접 반영. 4~5문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[배경, 원인, 변화 과정. 앞 단락 반복 금지. 3~4문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점의 영향, 주의 사항. 3~4문장. 자료 부족 시 생략]</p>

<h2 id="section2" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>2. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[앞 섹션과 겹치지 않는 새로운 사실. 4~5문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[세부 흐름, 비교 요소, 조건. 3~4문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자가 실제로 궁금해할 영향, 주의 사항. 3~4문장. 자료 부족 시 생략]</p>

<h2 id="section3" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>3. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[주제에 맞는 핵심 사실. 4~5문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[관련 배경과 변화 과정. 3~4문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자의 실생활 영향, 실제 활용 관점. 3~4문장. 자료 부족 시 생략]</p>

<h2 id="section4" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>4. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자가 실제로 알아야 할 내용. 4~5문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[앞 섹션과 중복되지 않는 세부 조건, 주의 사항. 3~4문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자가 확인하거나 실천할 수 있는 내용. 3~4문장. 자료 부족 시 생략]</p>

<h2 id="section5" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>5. [참고자료 내용 기반 소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[현재 확인된 상황, 향후 일정, 독자가 기억할 사항. 4~5문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[공식 전망이나 향후 계획이 있으면 반영. 없으면 현재 확인 가능한 사항. 3~4문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[본문 전체를 자연스럽게 마무리. 새로운 사실 추가 금지. 3~4문장]</p>

<h2 id="faq" style="font-size:22px;color:#1a73e8;margin:30px 0 14px;padding-bottom:8px;border-bottom:2px solid #dcdcdc;" data-ke-size="size26"><b>자주 묻는 질문</b></h2>
<div style="margin:22px 0 0;">
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q1. [독자가 실제로 검색할 만한 질문]</div>
<div style="color:#555;">[참고자료에 근거한 답변 2문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q2. [독자가 실제로 검색할 만한 질문]</div>
<div style="color:#555;">[참고자료에 근거한 답변 2문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q3. [독자가 실제로 검색할 만한 질문]</div>
<div style="color:#555;">[참고자료에 근거한 답변 2문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q4. [독자가 실제로 검색할 만한 질문]</div>
<div style="color:#555;">[참고자료에 근거한 답변 2문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q5. [독자가 실제로 검색할 만한 질문]</div>
<div style="color:#555;">[참고자료에 근거한 답변 2문장]</div>
</div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;">
<div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q6. [독자가 실제로 검색할 만한 질문]</div>
<div style="color:#555;">[참고자료에 근거한 답변 2문장]</div>
</div>
</div>

===KEYWORDS===
[본문과 직접 관련된 키워드 10개를 쉼표로 구분]

⚠️ 최종 주의사항:
- 모든 [] 대괄호 지시문은 실제 내용으로 반드시 교체
- 참고자료의 실제 내용을 기반으로 작성 (지어내기 금지)
- HTML 태그 외 마크다운, 설명문, 대괄호 최종 출력에 절대 포함 금지
- 💡 핵심 포인트 박스, 핵심 요약 박스, 한줄 요약 박스를 단 하나도 삽입하지 않습니다`;
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

function removeDuplicateParagraphs(content: string): string {
  const seen = new Set<string>();
  return content.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (match, _attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    if (text.length < 20) return match; // 짧은 단락은 그대로 유지
    const key = text.slice(0, 80); // 앞 80자로 중복 판별
    if (seen.has(key)) return ''; // 중복 제거
    seen.add(key);
    return match;
  });
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
  // 중복 단락 제거: 동일한 내용의 <p> 태그가 반복되면 첫 번째만 유지
  content = removeDuplicateParagraphs(content);

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
  // 기본 모델을 qwen3.5로 변경 (qwen3보다 품질 높음)

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

  const { keyword, ai_model = 'qwen3.5', clientOllamaKey, clientOpenrouterKey, clientGlobalAIKey, clientGlobalAIModel, article_id } = body;
  if (!keyword?.trim()) return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 });

  // 1. 뉴스/블로그 수집 + 사용자 커스텀 프롬프트 조회
  const adminSupa = createAdminClient();
  const [newsItems, blogItems, settingsRow] = await Promise.all([
    searchNaver('news', keyword),
    searchNaver('blog', keyword),
    adminSupa.from('bossai_auto_settings').select('prompt_template').eq('user_id', userId).single(),
  ]);
  const customTemplate = settingsRow.data?.prompt_template as string | null | undefined;

  // 2. AI 글 생성 + 소스 이미지 스크래핑 병렬 처리
  const prompt = buildPrompt(keyword, newsItems, blogItems, customTemplate);
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
  // (deepseek 등 일부 모델이 <!DOCTYPE html> 페이지를 통째로 출력하는 경우 대응)
  if (!rawOutput.includes('===TITLE===') || !rawOutput.includes('===CONTENT===')) {
    const retryModel = (ai_model === 'kimi-k2.6' || ai_model.startsWith('kimi')) ? 'llama3.3' : 'kimi-k2.6';
    try {
      const retried = cleanWatermarks(await generateText(
        prompt, retryModel, clientOllamaKey, clientOpenrouterKey, clientGlobalAIKey, clientGlobalAIModel,
      ));
      if (retried.includes('===TITLE===') && retried.includes('===CONTENT===')) {
        rawOutput = retried;
      }
    } catch { /* 재시도 실패 → 원본으로 진행 */ }
  }

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
