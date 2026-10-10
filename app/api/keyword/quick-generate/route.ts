import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { generateText } from '@/lib/auto-blog-ai';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import { cleanWatermarks, ANTI_WATERMARK_PROMPT } from '@/lib/ai-watermark';

export const maxDuration = 300;

async function fetchNaverItems(type: 'news' | 'blog', query: string, clientId: string, clientSecret: string, display = 10) {
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`,
      { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { items?: Array<{ title: string; description: string; link: string; originallink?: string }> };
    return (data.items || []).map(i => ({
      title: i.title.replace(/<[^>]+>/g, ''),
      description: i.description.replace(/<[^>]+>/g, ''),
      link: i.originallink || i.link,
    }));
  } catch { return []; }
}

async function fetchDaumItems(type: 'blog' | 'web' | 'news', query: string, kakaoKey: string, size = 5) {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/search/${type}?query=${encodeURIComponent(query)}&size=${size}&sort=recency`,
      { headers: { Authorization: `KakaoAK ${kakaoKey}` }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { documents?: Array<{ title: string; contents: string; url: string }> };
    return (data.documents || []).map(d => ({
      title: d.title.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' '),
      description: d.contents.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' '),
      link: d.url,
    }));
  } catch { return []; }
}

function buildSeoPrompt(keyword: string, sources: Array<{ type: string; title: string; description: string }>, focusKeyword: string): string {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const sourcesText = sources.slice(0, 20).map((s, i) => `[${s.type}${i + 1}] ${s.title}\n${s.description}`).join('\n\n');

  return `당신은 구글 SEO 1위를 달성하는 전문 블로그 작가입니다.

${ANTI_WATERMARK_PROMPT}

오늘 날짜: ${today}
핵심 키워드: "${keyword}"
검색 노출 타겟 키워드: "${focusKeyword}"

수집된 최신 자료:
${sourcesText}

## 작성 지침
- 메인 키워드 "${keyword}"를 제목과 첫 문단에 자연스럽게 포함
- LSI 키워드(연관어)를 본문 전체에 고르게 배치
- H2/H3 소제목 구조로 스캐너빌리티 최대화
- 도입부: 독자의 pain point 명확히 언급 (3-4문장)
- 본문: 구체적 수치, 사례, 데이터 포함
- 결론: 핵심 내용 요약 + 행동 촉구(CTA)
- 최소 1500자 이상 작성
- 가독성: 짧은 문단, 번호/불릿 리스트 적극 활용
- 자연스러운 한국어로만 작성

## 출력 형식
### 제목
[SEO 최적화 제목 (50자 이내, 키워드 포함)]

### 메타설명
[150자 이내, 키워드 포함, 클릭 유도]

### 본문
[HTML 형식으로 작성. h2, h3, p, ul, li, strong 태그 사용]`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { keyword } = await req.json() as { keyword: string };
  if (!keyword?.trim()) return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 });

  const [naverClientId, naverClientSecret, kakaoKey, preferModel] = await Promise.all([
    getSetting('NAVER_CLIENT_ID'),
    getSetting('NAVER_CLIENT_SECRET'),
    getSetting('KAKAO_REST_API_KEY') || process.env.KAKAO_REST_API_KEY,
    getSetting('PREFER_AI_MODEL'),
  ]);

  const kw = keyword.trim();

  // 1. 자료 수집 (병렬)
  const [naverNews, naverBlog, daumBlog] = await Promise.all([
    naverClientId && naverClientSecret
      ? fetchNaverItems('news', kw, naverClientId, naverClientSecret, 10)
      : [],
    naverClientId && naverClientSecret
      ? fetchNaverItems('blog', kw, naverClientId, naverClientSecret, 10)
      : [],
    kakaoKey
      ? fetchDaumItems('blog', kw, kakaoKey, 5)
      : [],
  ]);

  // 2. 소스 통합
  const sources = [
    ...naverNews.map(i => ({ type: '뉴스', ...i })),
    ...naverBlog.map(i => ({ type: '네이버블로그', ...i })),
    ...daumBlog.map(i => ({ type: '다음블로그', ...i })),
  ];

  if (sources.length === 0) {
    return NextResponse.json({ error: '수집된 자료가 없습니다. Naver/Kakao API 키를 설정해주세요.' }, { status: 400 });
  }

  // 3. AI 글 생성
  const prompt = buildSeoPrompt(kw, sources, kw);
  let rawText = '';
  try {
    rawText = await generateText(prompt, preferModel || undefined);
  } catch (e) {
    return NextResponse.json({ error: `AI 생성 실패: ${e}` }, { status: 500 });
  }
  rawText = cleanWatermarks(rawText);

  // 4. 파싱
  const titleMatch = rawText.match(/###\s*제목\s*\n([^\n]+)/);
  const metaMatch = rawText.match(/###\s*메타설명\s*\n([^\n]+)/);
  const contentMatch = rawText.match(/###\s*본문\s*\n([\s\S]+?)(?=###|$)/);

  const title = titleMatch?.[1]?.trim() || kw;
  const metaDescription = metaMatch?.[1]?.trim() || '';
  const content = contentMatch?.[1]?.trim() || rawText;

  // 5. 대표이미지 생성
  const representativeImageUrl = await generateAndUploadThumbnail(title, kw, 'blue').catch(() => null);

  // 6. 대표 이미지 URL을 본문에 삽입
  const contentWithImage = representativeImageUrl
    ? `<img src="${representativeImageUrl}" alt="${title}" style="width:100%;max-width:800px;height:auto;margin-bottom:20px;" />\n\n${content}`
    : content;

  // 7. Supabase 저장
  const { data: article, error: insertError } = await supabase
    .from('bossai_auto_articles')
    .insert({
      user_id: user.id,
      keyword: kw,
      focus_keyword: kw,
      title,
      content: contentWithImage,
      meta_description: metaDescription,
      representative_image_url: representativeImageUrl,
      status: 'draft',
      blog_platforms: [],
      sns_platforms: [],
      source_count: sources.length,
      naver_news_count: naverNews.length,
      naver_blog_count: naverBlog.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError || !article) {
    return NextResponse.json({ error: insertError?.message || '저장 실패' }, { status: 500 });
  }

  return NextResponse.json({
    article_id: article.id,
    title,
    meta_description: metaDescription,
    source_count: sources.length,
    representative_image_url: representativeImageUrl,
  });
}
