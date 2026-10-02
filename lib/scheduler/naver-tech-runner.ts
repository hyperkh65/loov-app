/**
 * 네이버 블로그 전자제품 자동발행 러너
 *
 * 해외 유명 전자제품 사이트(Apple/Samsung 뉴스룸, The Verge, TechCrunch 등) RSS에서
 * 최근 올라온 기사를 하나 골라 → 스크랩 → Groq로 "한국인이 직접 쓴 것처럼" 한국어
 * 재작성(4000~5000자) → 원문 사진을 소제목마다 배치 → 네이버 블로그 발행.
 *
 * 2026-09-28: 발행 방식을 NAS 경유 raw-API(post.py) → Playwright 실브라우저
 * 큐 방식(naver_publish_jobs + repository_dispatch → naver-publish.yml)으로
 * 전환. raw-API 방식은 documentModel JSON 필드를 실캡처값과 완전히 똑같이
 * 맞춰도 이미지가 "존재하지 않는 이미지입니다"로 뜨는 문제가 지속됐는데(실사용
 * 중 여러 차례 재현), 원인은 실제 SmartEditor가 문서를 그대로 서버로 보내는 게
 * 아니라 브라우저에서 setDocumentData→getDocumentData 정규화 과정을 거친 뒤
 * 보내기 때문으로 추정(공개된 네이버 블로그 자동화 분석 자료에서 확인) — 이
 * 클라이언트 측 정규화/후처리를 raw-API 호출은 원천적으로 건너뛸 수밖에 없다.
 * 반면 naver_publish_jobs 기반 Playwright 큐는 실제로 2026-09-16에 이 정확히
 * 같은 기사 자동화 용도로 성공 이력이 있다(status: completed, 실제 post_url
 * 확인됨) — 검증된 경로로 되돌리는 것.
 */
import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { scrapeArticleFull, fetchFeedItems } from '@/lib/rewrite-site-scraper';
import { searchNaver, searchInlineImages } from '@/lib/blog-content-generator';
import { sanitizeForNaver } from '@/lib/naver-blog';

async function dispatchNaverPublishJob(jobId: string): Promise<void> {
  const pat = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO || 'hyperkh65/loov-app';
  if (!pat) throw new Error('GITHUB_PAT 미설정 — Playwright 발행 큐 트리거 불가');

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'naver-publish', client_payload: { job_id: jobId } }),
  });
  if (res.status !== 204) {
    throw new Error(`repository_dispatch 실패: ${res.status} ${await res.text()}`);
  }
}

// 해외 전자제품 뉴스 소스 — 각 피드는 최신순이라 상위 몇 개만 봐도 "최근 트렌드"가 된다
const TECH_FEEDS = [
  { name: 'Apple Newsroom', url: 'https://www.apple.com/newsroom/rss-feed.rss' },
  { name: 'Samsung Newsroom', url: 'https://news.samsung.com/global/feed' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml' },
  { name: '9to5Mac', url: 'https://9to5mac.com/feed/' },
  { name: '9to5Google', url: 'https://9to5google.com/feed/' },
  { name: 'Android Authority', url: 'https://www.androidauthority.com/feed/' },
  { name: 'GSMArena', url: 'https://www.gsmarena.com/rss-news-reviews.php3' },
];

/** 이미 발행한 원문(source url)은 빼고, 최근 올라온 기사 하나를 고른다 */
async function pickTopic(): Promise<{ title: string; link: string; source: string } | null> {
  const perFeed = await Promise.all(TECH_FEEDS.map(async (f) => {
    try {
      const items = await fetchFeedItems(f.url, 5);
      return items.map((it) => ({ ...it, source: f.name }));
    } catch { return []; }
  }));
  const candidates = perFeed.flat();
  if (!candidates.length) return null;

  const admin = createAdminClient();
  const { data: used } = await admin
    .from('bossai_naver_tech_posts')
    .select('source_url')
    .order('created_at', { ascending: false })
    .limit(500);
  const usedSet = new Set((used || []).map((r: { source_url: string }) => r.source_url));

  return candidates.find((c) => !usedSet.has(c.link)) || null;
}

/** 소제목(h2)마다 이미지를 순서대로 배치 — 원문 사진은 저작권 문제로 안 쓰고 AI 생성/스톡 사진만 사용 */
function insertImages(html: string, images: string[]): string {
  if (!images.length) return html;
  let i = 0;
  return html.replace(/(<h2[^>]*>[\s\S]*?<\/h2>)/gi, (match) => {
    const url = images[i++];
    if (!url) return match;
    const alt = match.replace(/<[^>]+>/g, '').trim();
    return `${match}\n<figure><img src="${url}" alt="${alt}"/></figure>`;
  });
}

export interface NaverTechResult {
  summary: string;
  postUrl?: string;
  sourceUrl?: string;
  title?: string;
}

export async function runNaverTechAuto(userId: string): Promise<NaverTechResult> {
  const topic = await pickTopic();
  if (!topic) return { summary: '새로 쓸 만한 최근 기사가 없어 건너뜀' };

  const scraped = await scrapeArticleFull(topic.link);
  if (!scraped.text || scraped.text.length < 300) {
    return { summary: `본문 스크랩 실패(너무 짧음) — 건너뜀: ${topic.link}`, sourceUrl: topic.link };
  }

  // 원문 하나만 리라이팅하면 그대로 따라 쓴 것처럼 보이므로, 같은 주제의 국내
  // 기사·블로그도 참고자료로 같이 넣어 여러 소스를 종합한 글이 되게 한다
  const [news, blogs] = await Promise.all([
    searchNaver('news', topic.title).catch(() => []),
    searchNaver('blog', topic.title).catch(() => []),
  ]);
  const refs = [...news.slice(0, 5), ...blogs.slice(0, 5)] as { title: string; description: string; link: string }[];
  const refBlock = refs.length
    ? `\n참고자료(같은 주제의 다른 기사·블로그 — 사실관계만 참고, 베끼지 말 것):\n${refs.map((r, i) => `[참고${i + 1}] ${r.title} — ${r.description}`).join('\n')}\n`
    : '';

  const prompt = `한국어 SEO 블로그 작가입니다. 아래 해외 기사를 바탕으로 한국 독자를 위한 블로그 글을 작성하세요.

원문 기사(영어 등 외국어 — 단순 직역 금지. 내용을 완전히 이해한 한국인 전문 블로거가 정성껏 직접 쓴 것처럼 자연스러운 한국어로 재구성할 것. 번역투 어색한 문장 절대 금지):
제목: ${topic.title}
${scraped.text}
${refBlock}
[규칙]
1. 한국어만 사용. 한국어 동의어가 있는 영어 단어 금지(content→콘텐츠, review→리뷰, update→업데이트 등). 고유 제품명·브랜드명만 예외.
2. 존재하지 않는 회사·보고서·수치를 지어내지 말 것
3. 전체 분량 4000~5000자(한국어 기준, 공백 포함). 짧게 끝내지 말 것.
4. 소제목(h2) 5~6개, 각 소제목 아래 단락 2개, 각 단락 6문장 이상
5. 첫 문단은 핵심 결론부터(서론식 "~에 대해 알아봅니다" 금지), 6문장 이상
6. 친근한 구어체, 한국 독자가 체감할 구체적 사례(국내 출시·가격·경쟁 제품 등) 포함
7. 글 마지막에 자주 묻는 질문 3~4개(질문+답변 2~3문장)

[출력 형식 — 순수 HTML만, 다른 설명·코드블록 없이. 첫 줄은 반드시 제목 주석]
<!--TITLE: (키워드 포함 한국어 SEO 제목 40~60자)-->
<h2>(소제목1)</h2>
<p>(단락1)</p>
<p>(단락2)</p>
... (h2 5~6개 반복) ...
<h2>자주 묻는 질문</h2>
<p><strong>Q. (질문1)</strong><br/>(답변)</p>`;

  const rawOut = await generateText(prompt, 'qwen3', undefined, undefined, undefined, undefined, { ollamaOnly: true });
  const cleaned = rawOut.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
  const titleMatch = cleaned.match(/^<!--\s*TITLE:\s*(.+?)\s*-->/i);
  const title = (titleMatch?.[1] || topic.title).trim();
  let content = cleaned.replace(/^<!--\s*TITLE:.*?-->\s*/i, '');
  if (!content || content.length < 500) throw new Error('AI 응답이 비었거나 너무 짧음');

  // 출처/참고 주소 하단 표기는 제거(사용자 요청 2026-10-03)
  const { displayUrls, thumbUrl } = await searchInlineImages(title, 3);
  content = insertImages(content, [...new Set([thumbUrl, ...displayUrls].filter((u): u is string => !!u))]);

  // 네이버 연결 정보 (쿠키) — Playwright 워커가 naver_connections에서 다시
  // 조회하지만, 여기서도 미리 확인해서 연결 자체가 없는 경우 빨리 실패시킨다.
  const admin = createAdminClient();
  const { data: conn } = await admin
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses')
    .eq('user_id', userId)
    .single();
  if (!conn?.blog_id || !conn.nid_aut || !conn.nid_ses) {
    throw new Error('네이버 연결 정보(blog_id/NID_AUT/NID_SES) 없음 — 설정 탭에서 먼저 연결 필요');
  }

  const { data: job, error: jobErr } = await admin
    .from('naver_publish_jobs')
    .insert({
      user_id: userId,
      title,
      content: sanitizeForNaver(content),
      tags: [],
      category_no: 18, // 전자제품
      is_publish: true,
      job_type: 'scrape',
      source_url: topic.link,
      notion_page_id: '__auto_tech__',
      status: 'pending',
    })
    .select('id')
    .single();
  if (jobErr || !job) throw new Error(`naver_publish_jobs 등록 실패: ${jobErr?.message}`);

  await dispatchNaverPublishJob(job.id);

  // 같은 원문을 두 번 쓰지 않도록 즉시 기록 — 실제 발행은 Playwright 워커가
  // 비동기로 처리하므로 post_url은 아직 비어있다(작업 완료 후 naver_publish_jobs/
  // naver_publish_history에서 확인 가능).
  await admin.from('bossai_naver_tech_posts').insert({
    user_id: userId,
    source_url: topic.link,
    source_name: topic.source,
    source_title: topic.title,
    title,
    post_url: '',
  });

  return {
    summary: `[${topic.source}] ${title} → Playwright 발행 큐 등록됨 (job: ${job.id})`,
    postUrl: undefined,
    sourceUrl: topic.link,
    title,
  };
}
