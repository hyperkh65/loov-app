import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import { generateText } from '@/lib/auto-blog-ai';
import { getSetting } from '@/lib/get-setting';
import { cleanWatermarks } from '@/lib/ai-watermark';
import { DEFAULT_BLOG_PROMPT_TEMPLATE, applyPromptTemplate } from '@/lib/auto-blog-prompt';
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

function buildPrompt(keyword: string, newsItems: {title:string;description:string;link?:string}[], blogItems: {title:string;description:string}[], promptTemplate?: string | null): string {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const sources = newsItems.map((n, i) => `[뉴스${i+1}] ${n.title}\n${n.description}`).join('\n\n');
  const newsLinks = newsItems
    .filter(n => n.link)
    .map(n => `${n.title}||${n.link}`)
    .join('@@');
  return applyPromptTemplate(promptTemplate || DEFAULT_BLOG_PROMPT_TEMPLATE, keyword, today, sources, newsLinks);
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
    // <think>...</think> 블록 제거 (Qwen3, DeepSeek-R1 등 추론 모델)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    // 마크다운 코드블록 제거
    .replace(/```[a-z]*\n?/gi, '').replace(/```/g, '')
    // 한국어 마커 복구
    .replace(/===\s*(콘텐츠|내용|본문)\s*===/gi, '===CONTENT===')
    .replace(/===\s*제목\s*===/gi, '===TITLE===')
    .replace(/===\s*메타\s*(설명)?\s*===/gi, '===META===')
    .replace(/===\s*키워드[s]?\s*===/gi, '===KEYWORDS===')
    // 공백/줄바꿈으로 오염된 마커 복구 (=== TITLE === 등)
    .replace(/={3,}\s*TITLE\s*={3,}/gi, '===TITLE===')
    .replace(/={3,}\s*META\s*={3,}/gi, '===META===')
    .replace(/={3,}\s*CONTENT\s*={3,}/gi, '===CONTENT===')
    .replace(/={3,}\s*KEYWORDS?\s*={3,}/gi, '===KEYWORDS===');
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
  const cleaned = fixCorruptedMarkers(raw);

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

  // 1. 뉴스/블로그 수집 + 커스텀 프롬프트 로드 병렬
  const [[newsItems, blogItems], userSettingsResult] = await Promise.all([
    Promise.all([searchNaver('news', keyword), searchNaver('blog', keyword)]),
    supabase.from('bossai_auto_settings').select('prompt_template').eq('user_id', userId).maybeSingle(),
  ]);
  const customPromptTemplate: string | null = (userSettingsResult.data as {prompt_template?: string | null} | null)?.prompt_template || null;

  // 2. AI 글 생성 + 소스 이미지 스크래핑 병렬 처리
  const prompt = buildPrompt(keyword, newsItems, blogItems, customPromptTemplate);
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
    const preview = rawOutput.slice(0, 300).replace(/\n/g, ' ');
    return NextResponse.json({ error: `AI 출력 파싱 실패 (===TITLE=== 또는 ===CONTENT=== 마커 없음). 다시 시도해주세요. [응답 앞부분: ${preview}]` }, { status: 500 });
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
