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
      { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret }, signal: AbortSignal.timeout(8000) }
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
          const urls = hits.slice(0, count).map((h: { webformatURL: string; previewURL?: string }) => {
            // previewURL is a stable CDN URL (cdn.pixabay.com); derive 640px version from it
            // webformatURL uses pixabay.com/get/ signed URLs that expire
            const preview = h.previewURL || '';
            return preview ? preview.replace(/_\d+\./, '_640.') : h.webformatURL;
          });
          return { displayUrls: urls, thumbUrl: urls[0] };
        }
      }
    } catch { /* skip */ }
  }
  return { displayUrls: [], thumbUrl: undefined };
}

// ── 프롬프트 빌더 ──────────────────────────────────────────────────────────
export function buildBlogPrompt(
  keyword: string,
  newsItems: {title:string;description:string}[],
  blogItems: {title:string;description:string}[],
  sourceArticle?: { title: string; content: string },
): string {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const sources = [
    ...newsItems.slice(0, 5).map((n, i) => `[뉴스${i+1}] ${n.title} — ${n.description}`),
    ...blogItems.slice(0, 5).map((b, i) => `[블로그${i+1}] ${b.title} — ${b.description}`),
  ].join('\n');

  const intro = sourceArticle
    ? `한국어 SEO 블로그 작가입니다. 아래 원문 기사를 리라이팅해 "${keyword}" 블로그 글을 작성하세요.`
    : `한국어 SEO 블로그 작가입니다. 아래 규칙대로 "${keyword}" 블로그 글을 작성하세요.`;
  const sourceBlock = sourceArticle
    ? `\n원문 기사(리라이팅 대상 — 표절 금지, 사실·정보는 유지하되 문장은 완전히 새롭게 재구성):\n제목: ${sourceArticle.title}\n${sourceArticle.content.slice(0, 3000) || '(본문 없음 — 제목 기반으로 작성)'}\n`
    : '';

  return `${intro}

오늘 날짜: ${today}
${sourceBlock}참고자료(다른 기사·블로그 — 맥락 보강용):
${sources || '(없음 — 전문 지식으로 작성)'}

[규칙]
1. 한국어만 사용. 한국어 동의어가 있는 영어 단어 절대 금지 (content→콘텐츠, marketing→마케팅, system→시스템, design→디자인, update→업데이트, feedback→피드백, platform→플랫폼, service→서비스, brand→브랜드, data→데이터, trend→트렌드, user→사용자, review→리뷰, digital→디지털, global→글로벌 등). 고유 브랜드명(iPhone, Google 등)만 예외.
2. 존재하지 않는 회사·보고서·연구 절대 지어내지 말 것
3. 각 본문 단락은 반드시 6문장 이상 (짧은 단락 금지)
4. 첫 문장에 핵심 결론부터 (서론식 "~에 대해 알아봅니다" 금지)
5. 친근한 구어체, 독자가 무릎 칠 구체적 사례 포함

[출력 형식 — 이 마커 그대로 사용, HTML 태그 없이 순수 텍스트]

===TITLE===
(키워드 포함 SEO 제목 40-60자)

===META===
(메타 설명 130-160자)

===INTRO===
(도입부. 핵심 결론 먼저 → 배경 → 이 글에서 다룰 내용. 6문장 이상)

===S1===소제목
(단락1: 6문장 이상)
(단락2: 6문장 이상)
핵심: (이 섹션 핵심 1-2문장)

===S2===소제목
(단락1: 6문장 이상)
(단락2: 6문장 이상)
핵심: (이 섹션 핵심 1-2문장)

===S3===소제목
(단락1: 6문장 이상)
(단락2: 6문장 이상)
핵심: (이 섹션 핵심 1-2문장)

===S4===소제목
(단락1: 6문장 이상)
(단락2: 6문장 이상)
핵심: (이 섹션 핵심 1-2문장)

===S5===소제목
(단락1: 6문장 이상)
(단락2: 6문장 이상)
핵심: (이 섹션 핵심 1-2문장)

===S6===소제목
(단락1: 6문장 이상)
(단락2: 전망과 독자 행동 6문장 이상)
핵심: (이 섹션 핵심 1-2문장)

===FAQ===
Q: (질문1)
A: (답변 2-3문장)

Q: (질문2)
A: (답변 2-3문장)

Q: (질문3)
A: (답변 2-3문장)

Q: (질문4)
A: (답변 2-3문장)

===KEYWORDS===
(관련 키워드 10개 쉼표 구분)`;
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
  const repImg = `<figure style="text-align:center;margin:0 auto 28px;">`
    + `<img src="${imageUrl}" alt="${esc(title)}" title="${esc(title)}" `
    + `style="max-width:100%;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);" loading="lazy"/>`
    + `</figure>\n`;
  // 맨 앞에 삽입 (첫 번째 H2 이전)
  const firstH2 = content.search(/<h2/i);
  if (firstH2 > 0) return content.slice(0, firstH2) + repImg + content.slice(firstH2);
  return repImg + content;
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
  // H2 소제목마다 이미지 삽입 (이미지 있는 만큼)
  return content.replace(/(<h2[^>]*>[\s\S]*?<\/h2>)/gi, (match) => {
    if (imgIdx < imageUrls.length) {
      const sectionTitle = extractH2Title(match);
      return match + imgHtml(imageUrls[imgIdx++], sectionTitle);
    }
    return match;
  });
}

export function parseAiOutput(raw: string) {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();

  const extract = (tag: string) => {
    const re = new RegExp(`===${tag}===\\s*([\\s\\S]*?)(?=====[A-Za-z0-9]|$)`, 'i');
    const m = cleaned.match(re);
    return m ? m[1].trim() : '';
  };

  const rawTitle = extract('TITLE');
  const title = (rawTitle.split('\n').find(l => l.trim()) || rawTitle)
    .replace(/\*+/g, '').replace(/^#+\s*/, '').trim().slice(0, 60);
  const meta_description = (extract('META').split('\n').find(l => l.trim()) || '').trim().slice(0, 160);
  const keywordsRaw = extract('KEYWORDS');
  const keywords = keywordsRaw.split(',').map(k => k.trim()).filter(Boolean);

  // 새 포맷(===S1===~===FAQ===) 감지
  const hasNewFormat = /===S[1-6]===/i.test(cleaned);

  let content = '';
  if (hasNewFormat) {
    content = buildHtmlFromSections(cleaned, title);
  } else {
    // 구 포맷(===CONTENT===) 호환
    const rawC = extract('CONTENT').replace(/===KEYWORDS===[\s\S]*/i, '').trim();
    if (/<[a-z][\s\S]*>/i.test(rawC)) {
      // HTML 있음 — 인라인 ** 만 변환
      content = rawC.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    } else {
      // 순수 마크다운 — 전체 변환
      content = markdownToHtml(rawC);
    }
  }

  return { title, meta_description, content, keywords };
}

// ── 마크다운 → HTML 인라인 변환 ─────────────────────────────────────────────
function mdInline(s: string): string {
  // HTML 엔티티 이스케이프 후 마크다운 인라인 변환
  let r = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  r = r.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');
  r = r.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  r = r.replace(/\*([^*]+?)\*/g, '<i>$1</i>');
  r = r.replace(/`([^`]+?)`/g, '<code>$1</code>');
  return r;
}

// ── 마크다운 블록 → HTML 변환 (===CONTENT=== 구 포맷 폴백용) ────────────────
export function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inUl = false;

  const closeUl = () => { if (inUl) { out.push('</ul>'); inUl = false; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) { closeUl(); out.push(''); continue; }

    if (/^#{4,}\s/.test(line)) {
      closeUl();
      out.push(`<h4>${mdInline(line.replace(/^#{4,}\s/, ''))}</h4>`);
    } else if (/^###\s/.test(line)) {
      closeUl();
      out.push(`<h3 style="margin-bottom:15px;" data-ke-size="size23"><b>${mdInline(line.replace(/^###\s/, ''))}</b></h3>`);
    } else if (/^##\s/.test(line)) {
      closeUl();
      out.push(`<h2 style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;" data-ke-size="size26"><b>${mdInline(line.replace(/^##\s/, ''))}</b></h2>`);
    } else if (/^#\s/.test(line)) {
      closeUl();
      out.push(`<h2 style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;" data-ke-size="size26"><b>${mdInline(line.replace(/^#\s/, ''))}</b></h2>`);
    } else if (/^[-*]\s/.test(line)) {
      if (!inUl) { out.push('<ul style="margin:10px 0 10px 20px;">'); inUl = true; }
      out.push(`<li style="margin-bottom:6px;">${mdInline(line.replace(/^[-*]\s/, ''))}</li>`);
    } else {
      closeUl();
      out.push(`<p style="margin-bottom:15px;" data-ke-size="size16">${mdInline(line)}</p>`);
    }
  }
  closeUl();
  return out.join('\n');
}

// ── 섹션 텍스트 → HTML 조립 (Ollama 순수텍스트 출력을 구조화된 HTML로 변환) ──
function buildHtmlFromSections(raw: string, title: string): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const wrap = (text: string) =>
    `<p style="margin-bottom:15px;" data-ke-size="size16">${mdInline(text.trim())}</p>`;

  const h2 = (num: number, heading: string) => {
    const clean = heading.replace(/\*+/g, '').replace(/`/g, '').trim();
    return `<h2 id="section${num}" style="font-size:22px;color:white;background:linear-gradient(to right,#1a73e8,#004d99);margin:30px 0 15px;border-radius:10px;padding:10px 25px;font-weight:bold;box-shadow:0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>${num}. ${esc(clean)}</b></h2>`;
  };

  const infoBox = (text: string) =>
    `<div style="background-color:#e8f4fd;border-left:4px solid #1a73e8;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;"><b>💡 핵심 포인트</b><br/>${mdInline(text)}</div>`;

  const parts: string[] = [];

  // 도입부
  const introRaw = (() => {
    const m = raw.match(/===INTRO===\s*([\s\S]*?)(?=====[A-Z])/i);
    return m ? m[1].trim() : '';
  })();
  if (introRaw) {
    const introParagraphs = introRaw.split(/\n{2,}/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean);
    for (const p of introParagraphs) parts.push(wrap(p));
    parts.push(`<h3 style="margin-bottom:15px;" data-ke-size="size23"><b><span style="background-color:#fafafa;color:#333333;">${esc(title)}</span></b></h3>`);
  }

  // S1~S6 섹션
  for (let i = 1; i <= 6; i++) {
    const m = raw.match(new RegExp(`===S${i}===([^\\n]*)\n([\\s\\S]*?)(?====[A-Z]|$)`, 'i'));
    if (!m) continue;
    const heading = m[1].trim();
    const body = m[2].trim();

    parts.push(h2(i, heading));

    // 핵심: 줄 분리
    const coreMatch = body.match(/핵심:\s*(.+)/i);
    const coreText = coreMatch ? coreMatch[1].trim() : '';
    const bodyWithoutCore = body.replace(/핵심:\s*.+/i, '').trim();

    // 빈 줄 기준으로 단락 분리
    const paragraphs = bodyWithoutCore.split(/\n{2,}/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean);
    for (const p of paragraphs) {
      parts.push(wrap(p));
    }

    if (coreText) parts.push(infoBox(coreText));
  }

  // FAQ
  const faqRaw = (() => {
    const m = raw.match(/===FAQ===\s*([\s\S]*?)(?=====[A-Z]|$)/i);
    return m ? m[1].trim() : '';
  })();
  if (faqRaw) {
    parts.push(`<h2 id="faq" style="font-size:22px;color:#1a73e8;margin:30px 0 14px;padding-bottom:8px;border-bottom:2px solid #dcdcdc;" data-ke-size="size26"><b>자주 묻는 질문</b></h2>`);
    parts.push(`<div style="margin:22px 0 0;">`);
    const qaBlocks = faqRaw.split(/\n(?=Q:)/i).filter(Boolean);
    for (const block of qaBlocks) {
      const qm = block.match(/Q:\s*(.+)/i);
      const am = block.match(/A:\s*([\s\S]+)/i);
      if (qm && am) {
        parts.push(`<div style="margin:0 0 18px;padding:14px;background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;"><div style="font-weight:bold;margin:0 0 6px;color:#1a73e8;">${mdInline(qm[1].trim())}</div><div style="color:#555;">${mdInline(am[1].trim())}</div></div>`);
      }
    }
    parts.push(`</div>`);
  }

  return parts.join('\n');
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
