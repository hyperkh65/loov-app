/**
 * 키워드 발굴 기반 자동발행 — auto-discover가 찾은 'twenties' 카테고리 황금
 * 키워드 중 하나를 골라 글을 써서 publishRewrittenArticle()로 발행한다.
 * (naver-tech-runner.ts와 같은 구조: 소재 선정 → 자료수집 → AI 작성 → 발행 → 이력 기록)
 */
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { generateText } from '@/lib/auto-blog-ai';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import { cleanWatermarks, ANTI_WATERMARK_PROMPT } from '@/lib/ai-watermark';
import { publishRewrittenArticle } from '@/lib/rewrite-publish';

const THEME_COLORS = ['blue', 'dark', 'green', 'red', 'orange', 'violet', 'teal', 'golden'] as const;

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

async function fetchDaumBlog(query: string, kakaoKey: string, size = 5) {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/search/blog?query=${encodeURIComponent(query)}&size=${size}&sort=recency`,
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

function buildTwentiesPrompt(keyword: string, sources: Array<{ type: string; title: string; description: string }>): string {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const sourcesText = sources.slice(0, 15).map((s, i) => `[${s.type}${i + 1}] ${s.title}\n${s.description}`).join('\n\n');

  return `당신은 20대 독자를 타겟으로 하는 트렌드 매거진 에디터입니다.

${ANTI_WATERMARK_PROMPT}

오늘 날짜: ${today}
핵심 키워드: "${keyword}"

수집된 최신 자료:
${sourcesText}

## 작성 지침
- 20대가 편하게 읽는 캐주얼한 구어체(반말 아닌 친근한 존댓말)로, 트렌디한 표현 사용
- 딱딱한 설명 대신 임팩트 있는 문장으로 시작, 서론에 시간 끌지 말 것
- 메인 키워드 "${keyword}"를 제목과 첫 문단에 자연스럽게 포함
- H2/H3 소제목 구조, 소제목마다 실질적인 정보/팁 포함
- 존재하지 않는 통계·인용을 지어내지 말 것
- 전체 분량 1800~2500자(공백 포함)

## 출력 형식 (반드시 준수)
### 제목
(20대가 클릭하고 싶은 제목, 35자 내외)

### 메타설명
(검색결과에 보일 요약, 80자 내외)

### 본문
(HTML 태그로 작성: h2, h3, p, ul, li, strong 사용. 첫 줄부터 본문 시작)`;
}

export interface KeywordAutoResult {
  summary: string;
  keyword?: string;
  postUrl?: string | null;
}

export async function runKeywordAuto(userId: string, sourceId: string, category = 'twenties'): Promise<KeywordAutoResult> {
  const admin = createAdminClient();

  // 안 쓴 키워드 중 점수 높은 순으로 후보 조회
  const { data: candidates } = await admin
    .from('bossai_keyword_opportunities')
    .select('keyword, score')
    .eq('user_id', userId)
    .eq('category', category)
    .gt('score', 0)
    .order('score', { ascending: false })
    .limit(20);

  if (!candidates?.length) return { summary: `${category} 카테고리에 발굴된 키워드가 없음 — auto-discover를 먼저 실행 필요` };

  const { data: used } = await admin
    .from('bossai_keyword_auto_posts')
    .select('keyword')
    .eq('category', category)
    .order('created_at', { ascending: false })
    .limit(500);
  const usedSet = new Set((used || []).map((r: { keyword: string }) => r.keyword));

  const picked = candidates.find(c => !usedSet.has(c.keyword));
  if (!picked) return { summary: `${category} 후보가 전부 이미 발행됨 — auto-discover 재실행 필요` };

  const keyword = picked.keyword;

  const [naverClientId, naverClientSecret, kakaoKey] = await Promise.all([
    getSetting('NAVER_CLIENT_ID'),
    getSetting('NAVER_CLIENT_SECRET'),
    getSetting('KAKAO_REST_API_KEY'),
  ]);

  const [naverNews, naverBlog, daumBlog] = await Promise.all([
    naverClientId && naverClientSecret ? fetchNaverItems('news', keyword, naverClientId, naverClientSecret, 8) : Promise.resolve([]),
    naverClientId && naverClientSecret ? fetchNaverItems('blog', keyword, naverClientId, naverClientSecret, 8) : Promise.resolve([]),
    kakaoKey ? fetchDaumBlog(keyword, kakaoKey, 5) : Promise.resolve([]),
  ]);

  const sources = [
    ...naverNews.map(i => ({ type: '뉴스', ...i })),
    ...naverBlog.map(i => ({ type: '네이버블로그', ...i })),
    ...daumBlog.map(i => ({ type: '다음블로그', ...i })),
  ];
  if (!sources.length) return { summary: `"${keyword}" 참고자료 없음(네이버/카카오 API 키 확인 필요) — 건너뜀`, keyword };

  const rawText = cleanWatermarks(await generateText(buildTwentiesPrompt(keyword, sources), 'qwen3'));
  const titleMatch = rawText.match(/###\s*제목\s*\n([^\n]+)/);
  const metaMatch = rawText.match(/###\s*메타설명\s*\n([^\n]+)/);
  const contentMatch = rawText.match(/###\s*본문\s*\n([\s\S]+?)(?=###|$)/);

  const title = titleMatch?.[1]?.trim() || keyword;
  const meta = metaMatch?.[1]?.trim() || '';
  const content = contentMatch?.[1]?.trim() || rawText;
  if (!content || content.length < 300) return { summary: `"${keyword}" AI 응답이 비었거나 너무 짧음 — 건너뜀`, keyword };

  // 매번 다른 배경/색으로 대표이미지 생성(blue.2days.kr에서 확인된 "매번 같은 사진" 문제 방지)
  const colorScheme = THEME_COLORS[Math.floor(Math.random() * THEME_COLORS.length)];
  const representativeImageUrl = await generateAndUploadThumbnail(title, keyword, colorScheme, undefined, 'YELLOW', undefined, 'blog').catch(() => null);

  const article = { title, content, representative_image_url: representativeImageUrl, meta };
  const result = await publishRewrittenArticle(article, userId, sourceId);

  // 발행 성공 여부와 무관하게 같은 키워드 재사용은 막는다(다음 실행에서 계속 실패만
  // 반복하는 걸 방지 — naver-tech-runner.ts와 동일한 원칙)
  await admin.from('bossai_keyword_auto_posts').insert({
    user_id: userId, source_id: sourceId, category, keyword, title,
    post_url: result.wordpressUrl || '',
  });

  return {
    summary: `[${category}] "${keyword}" → ${result.wordpressUrl || '발행 실패'} (카페: ${result.naverCafe}, sns: ${JSON.stringify(result.sns)})`,
    keyword,
    postUrl: result.wordpressUrl,
  };
}
