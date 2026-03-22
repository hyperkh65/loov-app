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

  return `당신은 대한민국 최고의 SEO 블로그 전문 작가입니다. 구글 애드센스 승인 및 수익 극대화에 최적화된 글을 작성합니다.

포커스 키워드: "${keyword}"
오늘 날짜: ${today}

참고 자료:
${sources || '(참고 자료 없음 - 전문 지식으로 풍부하게 작성)'}

## 작성 지침 (필수 준수)
- 분량: 순수 텍스트 기준 최소 3500자 이상 (HTML 태그 제외)
- 톤앤매너: 친근하고 유쾌하며 유익한 전문가 느낌 — 딱딱하지 않고 읽는 재미가 있어야 함
- 각 단락은 최소 4-5문장으로 풍부하게 작성
- 포커스 키워드는 제목, 소제목, 본문에 자연스럽게 반복 삽입
- 독자가 끝까지 읽고 싶게 만드는 흥미로운 사례, 통계, 비유 활용
- 각 H2 섹션은 6문장 이상, 충분히 깊이 있게 서술

## 출력 형식 (정확히 이 순서대로, 다른 텍스트 절대 추가 금지)

===TITLE===
${keyword}에 관한 SEO 최적화 제목 (30-60자, 키워드를 앞부분에)
===META===
${keyword}를 포함한 메타 설명 (120-160자, 클릭을 유도하는 문장)
===CONTENT===
<p data-ke-size="size16"><span style="background-color: #fafafa; color: #333333; text-align: start;">${keyword} - ${today}, 지금 이 순간 많은 사람들이 궁금해하는 바로 그 주제입니다. [2문장의 흥미로운 도입부를 작성하세요]</span></p>
<p data-ke-size="size16">[배경과 맥락을 설명하는 3-4문장 단락. 왜 이 주제가 중요한지, 최신 트렌드와 연결]</p>
<p data-ke-size="size16">[이 글에서 무엇을 배울 수 있는지 안내하는 단락. 독자의 기대감을 높이는 3문장]</p>
<div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; font-style: italic; margin-bottom: 25px; font-size: 15px;"><b>${keyword}란?</b> [핵심 개념 정의 및 이 글의 핵심 내용을 2-3문장으로 요약]</div>
<h3 style="margin-bottom: 15px;" data-ke-size="size23"><b><span style="background-color: #fafafa; color: #333333; text-align: start;">${keyword} 완벽 가이드: 알아두면 인생이 바뀌는 핵심 정보</span></b></h3>

<h2 id="section1" style="font-size: 22px; color: white; background: linear-gradient(to right, #1a73e8, #004d99); margin: 30px 0 15px; border-radius: 10px; padding: 10px 25px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>1. ${keyword}란 무엇인가? 기초부터 탄탄하게</b></h2>
<p style="margin-bottom: 15px;" data-ke-size="size16">[이 주제의 정의와 개념을 쉽고 재미있게 설명하는 5-6문장. 어려운 용어는 비유로 풀어서 설명]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[역사적 배경이나 발전 과정을 흥미롭게 서술하는 5문장. 재미있는 사실이나 몰랐던 이야기 포함]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[일상생활과의 연결고리, 왜 지금 알아야 하는지 공감되게 설명하는 4문장]</p>
<div style="background-color: #e8f4fd; border-left: 4px solid #1a73e8; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;"><b>💡 핵심 포인트</b><br />[이 섹션에서 가장 중요한 핵심 내용 2문장]</div>

<h2 id="section2" style="font-size: 22px; color: white; background: linear-gradient(to right, #1a73e8, #004d99); margin: 30px 0 15px; border-radius: 10px; padding: 10px 25px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>2. ${keyword}의 핵심 특징과 장점</b></h2>
<p style="margin-bottom: 15px;" data-ke-size="size16">[주요 특징이나 장점을 구체적인 사례와 함께 설명하는 5-6문장. 숫자나 통계를 활용해 신뢰도 높이기]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[실제 활용 사례나 성공 사례를 흥미롭게 서술하는 5문장]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[다른 대안과 비교하거나, 이 주제만의 독특한 가치를 설명하는 4문장]</p>
<div style="background-color: #e8f4fd; border-left: 4px solid #1a73e8; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;"><b>💡 핵심 포인트</b><br />[이 섹션의 가장 중요한 포인트 2문장]</div>

<h2 id="section3" style="font-size: 22px; color: white; background: linear-gradient(to right, #1a73e8, #004d99); margin: 30px 0 15px; border-radius: 10px; padding: 10px 25px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>3. ${keyword} 제대로 활용하는 실전 방법</b></h2>
<p style="margin-bottom: 15px;" data-ke-size="size16">[실제로 어떻게 사용하거나 접근하는지 단계별로 쉽게 설명하는 5-6문장. 초보자도 따라할 수 있게 친절하게]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[흔히 하는 실수나 주의사항을 유머러스하게 설명하는 5문장]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[전문가만 아는 꿀팁이나 노하우를 공개하는 4-5문장]</p>
<div style="background-color: #e8f4fd; border-left: 4px solid #1a73e8; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;"><b>💡 핵심 포인트</b><br />[실전에서 바로 써먹을 수 있는 핵심 팁 2문장]</div>

<h2 id="section4" style="font-size: 22px; color: white; background: linear-gradient(to right, #1a73e8, #004d99); margin: 30px 0 15px; border-radius: 10px; padding: 10px 25px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>4. ${keyword} 관련 최신 트렌드와 미래 전망</b></h2>
<p style="margin-bottom: 15px;" data-ke-size="size16">[최신 동향과 변화를 흥미롭게 설명하는 5-6문장. 2024-2025년 트렌드, 새로운 방향성]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[앞으로의 전망과 예측을 전문가 시각으로 분석하는 5문장]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[트렌드에 뒤처지지 않으려면 지금 해야 할 것들을 구체적으로 제시하는 4문장]</p>
<div style="background-color: #e8f4fd; border-left: 4px solid #1a73e8; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;"><b>💡 핵심 포인트</b><br />[미래를 위해 지금 당장 체크해야 할 핵심 포인트 2문장]</div>

<h2 id="section5" style="font-size: 22px; color: white; background: linear-gradient(to right, #1a73e8, #004d99); margin: 30px 0 15px; border-radius: 10px; padding: 10px 25px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>5. ${keyword} 전문가가 알려주는 성공 비결</b></h2>
<p style="margin-bottom: 15px;" data-ke-size="size16">[성공한 사람들의 공통점이나 검증된 방법론을 스토리텔링으로 풀어내는 5-6문장]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[실패를 피하는 방법과 올바른 접근법을 유쾌하게 설명하는 5문장]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[처음 시작하는 사람을 위한 단계별 로드맵 제시 4-5문장]</p>
<div style="background-color: #e8f4fd; border-left: 4px solid #1a73e8; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;"><b>💡 핵심 포인트</b><br />[성공을 위한 가장 중요한 마인드셋이나 행동 원칙 2문장]</div>

<h2 id="section6" style="font-size: 22px; color: white; background: linear-gradient(to right, #1a73e8, #004d99); margin: 30px 0 15px; border-radius: 10px; padding: 10px 25px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" data-ke-size="size26"><b>6. ${keyword} 총정리 — 오늘부터 바로 시작하세요</b></h2>
<p style="margin-bottom: 15px;" data-ke-size="size16">[지금까지 배운 내용을 깔끔하게 정리하고 실행 동기를 부여하는 5-6문장]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[독자가 취해야 할 다음 액션 스텝을 구체적으로 제시하는 4-5문장]</p>
<p style="margin-bottom: 15px;" data-ke-size="size16">[마무리 메시지 — 독자를 응원하고 댓글이나 공유를 유도하는 3-4문장]</p>
<div style="background-color: #e8f4fd; border-left: 4px solid #1a73e8; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;"><b>💡 핵심 포인트</b><br />[이 글 전체의 핵심 메시지를 한 번 더 강조하는 2문장]</div>

<div class="single-summary-card" style="border: 2px solid #ccc; padding: 20px; border-radius: 8px; max-width: 800px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto;">
<div class="card-header" style="display: flex; align-items: center; border-bottom: 2px solid #1a73e8; padding-bottom: 10px; margin-bottom: 10px;"><span style="font-size: 24px; color: #1a73e8; margin-right: 10px;" class="card-header-icon">💡</span>
<h3 style="font-size: 20px; color: #1a73e8; margin: 0;" data-ke-size="size23">핵심 요약</h3>
</div>
<div class="card-content" style="font-size: 16px; line-height: 1.5; color: #333;">
<div class="section" style="margin-bottom: 10px;"><b>첫 번째 핵심:</b> <span style="background-color: #fffde7; padding: 2px 5px; border-radius: 3px;">[섹션1-2에서 다룬 가장 중요한 핵심 내용 1문장]</span></div>
<div class="section" style="margin-bottom: 10px;"><b>두 번째 핵심:</b> <span style="background-color: #fffde7; padding: 2px 5px; border-radius: 3px;">[섹션3에서 다룬 실전 방법의 핵심 1문장]</span></div>
<div class="section" style="margin-bottom: 10px;"><b>세 번째 핵심:</b> <span style="background-color: #fffde7; padding: 2px 5px; border-radius: 3px;">[섹션4-5에서 다룬 트렌드와 성공 비결 핵심 1문장]</span></div>
<div class="section" style="margin-bottom: 10px;"><b>네 번째 핵심:</b> <span style="background-color: #fffde7; padding: 2px 5px; border-radius: 3px;">[지금 당장 실천할 수 있는 가장 중요한 행동 1문장]</span></div>
</div>
<div class="card-footer" style="font-size: 14px; color: #777; border-top: 1px dashed #ddd; padding-top: 10px; margin-top: 10px; text-align: center;">[독자를 응원하는 따뜻한 마무리 한 문장]</div>
</div>

<h2 id="faq" style="font-size: 22px; color: #1a73e8; margin: 30px 0 14px; padding-bottom: 8px; border-bottom: 2px solid #dcdcdc;" data-ke-size="size26"><b>자주 묻는 질문</b></h2>
<div style="margin: 22px 0 0;">
<div style="margin: 0 0 18px; padding: 14px; background-color: #f9f9f9; border: 1px solid #eeeeee; border-radius: 8px;">
<div style="font-weight: bold; margin: 0 0 6px; color: #1a73e8;">Q1. [${keyword}에 대해 가장 많이 묻는 질문 1]</div>
<div style="color: #555;">[명확하고 친절한 답변 2-3문장]</div>
</div>
<div style="margin: 0 0 18px; padding: 14px; background-color: #f9f9f9; border: 1px solid #eeeeee; border-radius: 8px;">
<div style="font-weight: bold; margin: 0 0 6px; color: #1a73e8;">Q2. [자주 묻는 질문 2]</div>
<div style="color: #555;">[명확하고 친절한 답변 2-3문장]</div>
</div>
<div style="margin: 0 0 18px; padding: 14px; background-color: #f9f9f9; border: 1px solid #eeeeee; border-radius: 8px;">
<div style="font-weight: bold; margin: 0 0 6px; color: #1a73e8;">Q3. [자주 묻는 질문 3]</div>
<div style="color: #555;">[명확하고 친절한 답변 2-3문장]</div>
</div>
<div style="margin: 0 0 18px; padding: 14px; background-color: #f9f9f9; border: 1px solid #eeeeee; border-radius: 8px;">
<div style="font-weight: bold; margin: 0 0 6px; color: #1a73e8;">Q4. [자주 묻는 질문 4]</div>
<div style="color: #555;">[명확하고 친절한 답변 2-3문장]</div>
</div>
<div style="margin: 0 0 18px; padding: 14px; background-color: #f9f9f9; border: 1px solid #eeeeee; border-radius: 8px;">
<div style="font-weight: bold; margin: 0 0 6px; color: #1a73e8;">Q5. [자주 묻는 질문 5]</div>
<div style="color: #555;">[명확하고 친절한 답변 2-3문장]</div>
</div>
<div style="margin: 0 0 18px; padding: 14px; background-color: #f9f9f9; border: 1px solid #eeeeee; border-radius: 8px;">
<div style="font-weight: bold; margin: 0 0 6px; color: #1a73e8;">Q6. [자주 묻는 질문 6]</div>
<div style="color: #555;">[명확하고 친절한 답변 2-3문장]</div>
</div>
</div>

<p data-ke-size="size16"><span style="background-color: #fafafa; color: #333333; text-align: start;">[관련 키워드 10개를 쉼표로 나열]</span></p>
===KEYWORDS===
[관련 키워드 10개를 쉼표로 구분하여 나열]

주의사항: 위의 대괄호 [] 안의 지시문은 모두 실제 내용으로 교체하세요. 대괄호나 지시문이 최종 출력에 남아있으면 안 됩니다. HTML 태그와 실제 내용만 출력하세요.`;
}

async function searchInlineImages(query: string, count = 3): Promise<string[]> {
  // 1순위: Google Custom Search
  const googleKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx = process.env.GOOGLE_SEARCH_CX;
  if (googleKey && googleCx) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${encodeURIComponent(query)}&searchType=image&num=${Math.min(count, 10)}&safe=active&imgSize=large`
      );
      if (res.ok) {
        const data = await res.json();
        const urls = (data.items || []).slice(0, count).map((item: { link: string }) => item.link);
        if (urls.length > 0) return urls;
      }
    } catch { /* fallthrough */ }
  }
  // 2순위: Pixabay
  const pixabayKey = process.env.PIXABAY_API_KEY;
  if (pixabayKey) {
    try {
      const res = await fetch(
        `https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${count + 5}&safesearch=true&min_width=600`
      );
      if (res.ok) {
        const data = await res.json();
        const hits = data.hits || [];
        if (hits.length > 0) return hits.slice(0, count).map((h: { webformatURL: string }) => h.webformatURL);
      }
      const fallbackRes = await fetch(
        `https://pixabay.com/api/?key=${pixabayKey}&q=nature+background&image_type=photo&per_page=${count + 5}&safesearch=true&min_width=600`
      );
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        return (data.hits || []).slice(0, count).map((h: { webformatURL: string }) => h.webformatURL);
      }
    } catch { /* skip */ }
  }
  return [];
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

    // Google/Pixabay 이미지 검색 + 본문 삽입
    const inlineImages = await searchInlineImages(keyword, 3);
    const content = insertImagesIntoContent(rawContent, inlineImages, keyword);

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
