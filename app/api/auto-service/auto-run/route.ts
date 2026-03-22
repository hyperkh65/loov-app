import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import { generateText } from '@/lib/auto-blog-ai';

export const maxDuration = 300;

// Vercel Cron 또는 수동 트리거로 호출됨
// Authorization: Bearer <CRON_SECRET>

async function searchNaver(type: 'news' | 'blog', query: string) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(query)}&display=5&sort=date`,
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

  return `당신은 SEO 최적화 블로그 글 전문 작성가입니다. 구글 애드센스 수익 최적화에 맞게 글을 작성하세요.

포커스 키워드: "${keyword}"
오늘 날짜: ${today}

참고 자료:
${sources || '(참고 자료 없음)'}

아래 형식으로 정확히 출력하세요:

===TITLE===
(SEO 제목: 포커스 키워드를 앞부분에 포함, 30-60자)
===META===
(메타 설명: 포커스 키워드 포함, 120-160자)
===CONTENT===
(아래 HTML 형식으로 3000자 이상)
===KEYWORDS===
(관련 키워드 10개, 쉼표로 구분)

HTML 형식:
<p data-ke-size="size16"><span style="background-color: #fafafa; color: #333333; text-align: start;">[제목] [날짜], [도입부 2문장]</span></p>
<p data-ke-size="size16">[도입 2단락]</p>
<div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; font-style: italic; margin-bottom: 25px; font-size: 15px;"><b>[제목]</b> [요약]</div>
<h3 style="margin-bottom: 15px;" data-ke-size="size23"><b><span style="background-color: #fafafa; color: #333333;">[제목]</span></b></h3>
(H2 섹션 5-6개, 각 섹션 형식:)
<h2 id="sectionN" style="font-size: 22px; color: white; background: linear-gradient(to right, #1a73e8, #004d99); margin: 30px 0 15px; border-radius: 10px; padding: 10px 25px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>N. [섹션 제목]</b></h2>
<p style="margin-bottom: 15px;" data-ke-size="size16">[내용]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[내용]</p>
<div style="background-color: #e8f4fd; border-left: 4px solid #1a73e8; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;"><b>💡 핵심 포인트</b><br />[핵심]</div>
(핵심요약카드, FAQ 6개, 키워드 나열 포함)
<h2 id="faq" style="font-size: 22px; color: #1a73e8; margin: 30px 0 14px; padding-bottom: 8px; border-bottom: 2px solid #dcdcdc;" data-ke-size="size26"><b>자주 묻는 질문</b></h2>
<p data-ke-size="size16"><span style="background-color: #fafafa; color: #333333;">[키워드1], [키워드2], ...</span></p>`;
}

async function searchPixabayImages(query: string, count = 3): Promise<string[]> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&lang=ko&image_type=photo&per_page=${count + 3}&safesearch=true&min_width=600`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits || []).slice(0, count).map((h: { webformatURL: string }) => h.webformatURL);
  } catch { return []; }
}

function insertImagesIntoContent(content: string, imageUrls: string[], keyword: string): string {
  if (imageUrls.length === 0) return content;
  const imgHtml = (url: string) =>
    `\n<div style="text-align:center;margin:25px 0;">`+
    `<img src="${url}" alt="${keyword}" `+
    `style="max-width:100%;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,0.15);"/>`+
    `<p style="font-size:12px;color:#888;margin-top:6px;">ⓒ Pixabay 무료 이미지</p>`+
    `</div>\n`;
  let imgIdx = 0;
  let h2Count = 0;
  return content.replace(/<\/h2>/gi, (match) => {
    h2Count++;
    if (h2Count % 2 === 1 && imgIdx < imageUrls.length) {
      return match + imgHtml(imageUrls[imgIdx++]);
    }
    return match;
  });
}

function parseAiOutput(raw: string) {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
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
): Promise<boolean> {
  // 최근 7일 내 같은 키워드 글 있으면 스킵
  const { data: existing } = await supabase
    .from('bossai_auto_articles')
    .select('id')
    .eq('user_id', userId)
    .eq('keyword', keyword)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (existing && existing.length > 0) return false;

  try {
    const [news, blogs] = await Promise.all([
      searchNaver('news', keyword),
      searchNaver('blog', keyword),
    ]);

    const prompt = buildPrompt(keyword, news, blogs);
    const rawOutput = await generateText(prompt, aiModel, clientOllamaKey, clientOpenrouterKey);
    const { title, meta_description, content: rawContent } = parseAiOutput(rawOutput);

    if (!title || !rawContent) return false;

    // Pixabay 이미지 검색 + 본문 삽입
    const pixabayImages = await searchPixabayImages(keyword, 3);
    const content = insertImagesIntoContent(rawContent, pixabayImages, keyword);

    const imageUrl = await generateAndUploadThumbnail(title, keyword);
    const wordCount = content.replace(/<[^>]+>/g, '').length;

    await supabase.from('bossai_auto_articles').insert({
      user_id: userId,
      keyword,
      focus_keyword: keyword,
      title,
      meta_description,
      content,
      representative_image_url: imageUrl,
      ai_model: aiModel,
      status: 'draft',
      sources: [
        ...news.map((n: {title:string;description:string;link:string}) => ({ type: 'news', ...n })),
        ...blogs.map((b: {title:string;description:string;link:string}) => ({ type: 'blog', ...b })),
      ],
      word_count: wordCount,
    });

    return true;
  } catch (err) {
    console.error(`[auto-run] ${keyword} 생성 실패:`, err);
    return false;
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
    .select('user_id, ai_model, max_per_run, custom_keywords')
    .eq('enabled', true);

  if (settingsErr || !settings?.length) {
    return NextResponse.json({ message: '자동실행 활성화된 사용자 없음', count: 0 });
  }

  // 트렌딩 키워드 한 번만 조회 (전체 공유)
  const trendKeywords = await getTrendingKeywords();

  const summary: { userId: string; generated: number; keywords: string[] }[] = [];

  for (const setting of settings) {
    const { user_id, ai_model, max_per_run, custom_keywords } = setting;

    // 사용자 커스텀 키워드 우선, 없으면 트렌딩 키워드 사용
    const keywordsToUse = (custom_keywords?.length > 0 ? custom_keywords : trendKeywords).slice(0, max_per_run * 2);

    let generated = 0;
    const usedKeywords: string[] = [];

    for (const keyword of keywordsToUse) {
      if (generated >= max_per_run) break;
      const ok = await generateArticleForUser(supabase, user_id, keyword, ai_model || 'qwen3');
      if (ok) {
        generated++;
        usedKeywords.push(keyword);
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

// 수동 트리거 (대시보드에서 즉시 실행)
export async function POST(req: NextRequest) {
  const supabase = await (await import('@/lib/supabase-server')).createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { keywords: customKws, ai_model = 'qwen3', max = 3, clientOllamaKey, clientOpenrouterKey } = await req.json();
  const adminSupabase = createAdminClient();

  const trendKeywords = customKws?.length > 0 ? customKws : await getTrendingKeywords();
  const keywordsToUse = trendKeywords.slice(0, max * 2);

  let generated = 0;
  const usedKeywords: string[] = [];

  for (const keyword of keywordsToUse) {
    if (generated >= max) break;
    const ok = await generateArticleForUser(adminSupabase, user.id, keyword, ai_model, clientOllamaKey, clientOpenrouterKey);
    if (ok) {
      generated++;
      usedKeywords.push(keyword);
    }
  }

  // 설정 업데이트
  await adminSupabase.from('bossai_auto_settings').upsert({
    user_id: user.id,
    last_run_at: new Date().toISOString(),
    last_run_status: 'success',
    last_run_count: generated,
  }, { onConflict: 'user_id' });

  return NextResponse.json({ ok: true, generated, keywords: usedKeywords });
}
