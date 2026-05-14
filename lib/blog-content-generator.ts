/**
 * 블로그 콘텐츠 생성 공통 모듈
 * auto-service/generate 와 scheduler/blog-runner 에서 공유
 */
import { generateText } from '@/lib/auto-blog-ai';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import { getSetting } from '@/lib/get-setting';
import { cleanWatermarks, ANTI_WATERMARK_PROMPT } from '@/lib/ai-watermark';

// ── 이미지 스크래핑 ────────────────────────────────────────────────────────
export async function scrapeArticleImages(
  items: { link: string; title: string }[],
  limit = 6,
): Promise<{ url: string; title: string }[]> {
  const results: { url: string; title: string }[] = [];
  await Promise.allSettled(items.slice(0, limit).map(async (item) => {
    try {
      const res = await fetch(item.link, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return;
      const html = await res.text();
      const ogMatch =
        html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      if (ogMatch?.[1]?.startsWith('http')) { results.push({ url: ogMatch[1], title: item.title }); return; }
      const imgMatches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi)];
      const filtered = imgMatches.map(m => m[1]).filter(u => !/(icon|logo|button|banner|sprite|pixel|blank|tracking)/i.test(u));
      if (filtered[0]) results.push({ url: filtered[0], title: item.title });
    } catch { /* skip */ }
  }));
  return results;
}

// ── 네이버 검색 ────────────────────────────────────────────────────────────
export async function searchNaver(type: 'news' | 'blog', query: string) {
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

// ── 인라인 이미지 검색 ─────────────────────────────────────────────────────
export async function searchInlineImages(query: string, count = 3): Promise<{ displayUrls: string[]; thumbUrl: string | undefined }> {
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
  const [googleKey, googleCx] = await Promise.all([getSetting('GOOGLE_SEARCH_API_KEY'), getSetting('GOOGLE_SEARCH_CX')]);
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

// ── 프롬프트 빌더 ──────────────────────────────────────────────────────────
export function buildBlogPrompt(keyword: string, newsItems: {title:string;description:string}[], blogItems: {title:string;description:string}[]): string {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const sources = [
    ...newsItems.map((n, i) => `[뉴스${i+1}] ${n.title}\n${n.description}`),
    ...blogItems.map((b, i) => `[블로그${i+1}] ${b.title}\n${b.description}`),
  ].join('\n\n');

  return `당신은 대한민국 최고의 저널리스트이자 SEO 전문 블로그 작가입니다.

[언어 규칙 - 절대 준수] 반드시 한국어로만 작성. 중국어(漢字) · 일본어(ひらがな · カタカナ) · 러시아어(Кириллица) 등 외국어 문자 절대 금지. 위반 시 응답 무효.

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
- 고정 템플릿 소제목 절대 사용 금지
- 수집된 참고자료의 핵심 내용을 기반으로 소제목 구성

【참고자료 활용 원칙】
- 제공된 뉴스/블로그 자료의 구체적 내용(날짜, 인물명, 수치, 사건 경위)을 글에 반드시 반영
- 자료에 없는 내용을 억지로 지어내지 말 것

【문체 원칙】
- 친근하고 읽기 쉬운 구어체 혼용, 딱딱한 공문체 금지
- 독자가 "오, 이거 몰랐네!" 하고 무릎 칠 만한 사실 포함
- 공감 유발 표현, 구체적 사례, 생생한 묘사 활용
- 각 단락 최소 4문장, 충분한 내용 서술

【분량 원칙】
- 순수 텍스트(HTML 태그 제외) 최소 4000자 이상 필수
- H2 섹션 6개, 각 섹션 단락 3개 이상
- 각 단락은 반드시 5문장 이상

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
<p data-ke-size="size16"><span style="background-color:#fafafa;color:#333333;">[두괄식 도입 2-3문장]</span></p>
<p data-ke-size="size16">[배경과 맥락 3-4문장]</p>
<p data-ke-size="size16">[이 글에서 다룰 핵심 포인트 3가지 예고]</p>
<div style="background-color:#f5f5f5;padding:15px;border-radius:8px;font-style:italic;margin-bottom:25px;font-size:15px;"><b>[핵심 한줄 요약]</b> [참고자료 기반 2-3문장 요약]</div>
<h3 style="margin-bottom:15px;" data-ke-size="size23"><b><span style="background-color:#fafafa;color:#333333;">[글 전체 부제목]</span></b></h3>

<h2 id="section1" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>1. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

<h2 id="section2" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>2. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

<h2 id="section3" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>3. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

<h2 id="section4" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>4. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

<h2 id="section5" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>5. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점: 5문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

<h2 id="section6" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>6. [소제목]</b></h2>
<p style="margin-bottom:15px;" data-ke-size="size16">[두괄식: 7-8문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[심화 분석: 5-6문장]</p>
<p style="margin-bottom:15px;" data-ke-size="size16">[독자 관점 + 향후 전망: 5-6문장]</p>
<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>[이 섹션의 가장 중요한 사실 2-3문장]</div>

<div class="single-summary-card" style="border:2px solid #ccc;padding:20px;border-radius:8px;max-width:800px;background-color:#ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.1);margin:20px auto;">
<div class="card-header" style="display:flex;align-items:center;border-bottom:2px solid #1a73e8;padding-bottom:10px;margin-bottom:10px;"><span style="font-size:24px;color:#1a73e8;margin-right:10px;">💡</span><h3 style="font-size:20px;color:#1a73e8;margin:0;" data-ke-size="size23">핵심 요약</h3></div>
<div class="card-content" style="font-size:16px;line-height:1.5;color:#333;">
<div class="section" style="margin-bottom:10px;"><b>첫 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[섹션1 핵심 사실]</span></div>
<div class="section" style="margin-bottom:10px;"><b>두 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[섹션2-3 핵심 사실]</span></div>
<div class="section" style="margin-bottom:10px;"><b>세 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[섹션4-5 핵심 사실]</span></div>
<div class="section" style="margin-bottom:10px;"><b>네 번째 핵심:</b> <span style="background-color:#fffde7;padding:2px 5px;border-radius:3px;">[독자가 바로 실천할 행동]</span></div>
</div>
<div class="card-footer" style="font-size:14px;color:#777;border-top:1px dashed #ddd;padding-top:10px;margin-top:10px;text-align:center;">[마무리 한 문장]</div>
</div>

<h2 id="faq" style="font-size:22px;color:#1a73e8;margin:30px 0 14px;padding-bottom:8px;border-bottom:2px solid #dcdcdc;" data-ke-size="size26"><b>자주 묻는 질문</b></h2>
<div style="margin:22px 0 0;">
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;"><div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q1. [궁금증]</div><div style="color:#555;">[답변 2-3문장]</div></div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;"><div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q2. [궁금증]</div><div style="color:#555;">[답변 2-3문장]</div></div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;"><div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q3. [궁금증]</div><div style="color:#555;">[답변 2-3문장]</div></div>
<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;"><div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">Q4. [궁금증]</div><div style="color:#555;">[답변 2-3문장]</div></div>
</div>

===KEYWORDS===
[관련 키워드 10개 쉼표 구분]

⚠️ 최종 주의사항:
- 모든 [] 대괄호 지시문은 실제 내용으로 반드시 교체
- HTML 태그 외 마크다운, 설명문, 대괄호 최종 출력에 절대 포함 금지`;
}

// ── 콘텐츠 조립 ────────────────────────────────────────────────────────────
function extractH2Title(h2Tag: string): string {
  return h2Tag.replace(/<[^>]+>/g, '').trim();
}

export function injectTitleIntoH3(content: string, title: string): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return content.replace(
    /(<h3[^>]*>(?:<[^>]+>)*)([^<]+)((?:<\/[^>]+>)*<\/h3>)/,
    (_, open, _text, close) => `${open}${esc(title)}${close}`
  );
}

export function insertRepresentativeImageIntoContent(content: string, imageUrl: string, title: string): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const repImg = `\n<figure style="text-align:center;margin:20px auto;">`
    + `<img src="${imageUrl}" alt="${esc(title)}" title="${esc(title)}" `
    + `style="max-width:100%;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);" loading="lazy"/>`
    + `</figure>\n`;
  return content.replace(/(<\/h3>)/, `$1${repImg}`);
}

export function insertImagesIntoContent(content: string, imageUrls: string[], keyword: string): string {
  if (imageUrls.length === 0) return content;
  const imgHtml = (url: string, sectionTitle: string) => {
    const alt = sectionTitle || keyword;
    return `\n<figure style="text-align:center;margin:25px 0;">`
      + `<img src="${url}" alt="${alt}" title="${alt}" `
      + `style="max-width:100%;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,0.15);" loading="lazy"/>`
      + `<figcaption style="font-size:12px;color:#888;margin-top:6px;">${alt}</figcaption>`
      + `</figure>\n`;
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

export function parseAiOutput(raw: string) {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
  const extract = (tag: string) => {
    const re = new RegExp(`===${tag}===\\s*([\\s\\S]*?)(?=====[A-Za-z]|$)`, 'i');
    const match = cleaned.match(re);
    return match ? match[1].trim() : '';
  };
  const rawTitle = extract('TITLE');
  const title = (rawTitle.split('\n').find(l => l.trim()) || rawTitle).trim().slice(0, 60);
  const meta_description = (extract('META').split('\n').find(l => l.trim()) || '').trim().slice(0, 160);
  let content = extract('CONTENT');
  content = content.replace(/===KEYWORDS===[\s\S]*/i, '').trim();
  const keywordsRaw = extract('KEYWORDS');
  const keywords = keywordsRaw.split(',').map(k => k.trim()).filter(Boolean);
  return { title, meta_description, content, keywords };
}

// ── 메인 생성 함수 (스케줄러 + 대시보드 공용) ──────────────────────────────
export interface GeneratedBlogContent {
  title: string;
  content: string;
  meta_description: string;
  keywords: string[];
  imageUrl: string | null;
}

export async function generateBlogContent(keyword: string, aiModel = 'qwen3'): Promise<GeneratedBlogContent> {
  const [newsItems, blogItems] = await Promise.all([
    searchNaver('news', keyword),
    searchNaver('blog', keyword),
  ]);

  const prompt = buildBlogPrompt(keyword, newsItems, blogItems);
  const allSourceItems = [...newsItems, ...blogItems];

  let rawOutput: string;
  let scrapedImages: { url: string; title: string }[] = [];
  [rawOutput, scrapedImages] = await Promise.all([
    generateText(prompt, aiModel),
    scrapeArticleImages(allSourceItems),
  ]);

  rawOutput = cleanWatermarks(rawOutput);
  void scrapedImages; // used for source tracking externally if needed

  const { title, meta_description, content: rawContent, keywords } = parseAiOutput(rawOutput);
  if (!title || !rawContent) throw new Error('AI 출력 파싱 실패');

  const { displayUrls: inlineImages, thumbUrl: bgImageUrl } = await searchInlineImages(keyword, 3);
  let content = insertImagesIntoContent(rawContent, inlineImages, keyword);
  content = injectTitleIntoH3(content, title);

  let imageUrl: string | null = null;
  try {
    imageUrl = await generateAndUploadThumbnail(title, keyword, 'blue', bgImageUrl);
    if (imageUrl) content = insertRepresentativeImageIntoContent(content, imageUrl, title);
  } catch { /* thumbnail optional */ }

  return { title, content, meta_description, keywords, imageUrl };
}
