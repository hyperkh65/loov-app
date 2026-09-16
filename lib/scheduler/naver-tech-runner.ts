/**
 * 네이버 블로그 전자제품 자동발행 러너
 *
 * 해외 유명 전자제품 사이트(Apple/Samsung 뉴스룸, The Verge, TechCrunch 등) RSS에서
 * 최근 올라온 기사를 하나 골라 → 스크랩 → Groq로 "한국인이 직접 쓴 것처럼" 한국어
 * 재작성(4000~5000자) → 원문 사진을 소제목마다 배치 → 네이버 블로그 발행.
 *
 * 발행은 NAS(가정용 IP) 경유 파이썬 스크립트(lib/naver-nas-publish.ts)로 한다 —
 * 네이버가 클라우드 IP를 차단하기 때문이며, 브라우저 자동화가 아니라 API 직접
 * 호출이라 서버에서 몇 초 만에 끝난다.
 */
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting } from '@/lib/get-setting';
import { scrapeArticleFull, fetchFeedItems } from '@/lib/rewrite-site-scraper';
import { searchNaver } from '@/lib/blog-content-generator';
import { postViaNas } from '@/lib/naver-nas-publish';
import { sanitizeForNaver } from '@/lib/naver-blog';

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

const GROQ_MODEL = 'qwen/qwen3.8-27b';

let groqKeyIdx = 0;
/** Groq 4키 라운드로빈 (lib/ai-translate.ts와 동일 패턴 — 키 하나론 분당 토큰 한도에 걸림) */
async function callGroq(prompt: string): Promise<string> {
  const raw = await getSetting('GROQ_API_KEYS');
  const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);
  if (!keys.length) throw new Error('GROQ_API_KEYS 설정 없음');

  let lastErr = '';
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[groqKeyIdx % keys.length];
      groqKeyIdx++;
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 8000,
          }),
          signal: AbortSignal.timeout(120_000),
        });
        if (res.status === 429) { lastErr = `429 rate limit (key ${i})`; continue; }
        if (!res.ok) throw new Error(`Groq API ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json() as { choices?: { message?: { content?: string } }[] };
        return data.choices?.[0]?.message?.content || '';
      } catch (e) {
        if ((e as Error).message?.startsWith('Groq API')) throw e;
        lastErr = (e as Error).message;
      }
    }
    if (pass === 0) await new Promise((r) => setTimeout(r, 60_000)); // TPM 한도 리셋 대기
  }
  throw new Error(`Groq 호출 실패 — 키 ${keys.length}개 모두 rate limit: ${lastErr}`);
}

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

/** 소제목(h2)마다 원문 사진을 순서대로 배치 — 스톡사진은 글과 무관해서 안 씀 */
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

/** 글 끝에 출처를 "텍스트로만" 남긴다 — 링크로 걸면 독자가 원문으로 빠져나감 */
function sourcesFooter(sourceUrl: string, refs: { title: string; link: string }[], images: string[]): string {
  const lines = [`원문: ${sourceUrl}`];
  for (const r of refs) if (r.link) lines.push(`참고: ${r.title} - ${r.link}`);
  if (images.length) lines.push(`사진 출처: ${images.join(', ')}`);
  return `\n<h2>출처</h2>\n<p>${lines.join('<br/>')}</p>`;
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

  const rawOut = await callGroq(prompt);
  const cleaned = rawOut.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
  const titleMatch = cleaned.match(/^<!--\s*TITLE:\s*(.+?)\s*-->/i);
  const title = (titleMatch?.[1] || topic.title).trim();
  let content = cleaned.replace(/^<!--\s*TITLE:.*?-->\s*/i, '');
  if (!content || content.length < 500) throw new Error('AI 응답이 비었거나 너무 짧음');

  content = insertImages(content, scraped.images);
  content += sourcesFooter(topic.link, refs, scraped.images);

  // 네이버 연결 정보 (쿠키)
  const admin = createAdminClient();
  const { data: conn } = await admin
    .from('naver_connections')
    .select('blog_id, nid_aut, nid_ses, upload_session_key, naver_user_id')
    .eq('user_id', userId)
    .single();
  if (!conn?.blog_id || !conn.nid_aut || !conn.nid_ses) {
    throw new Error('네이버 연결 정보(blog_id/NID_AUT/NID_SES) 없음 — 설정 탭에서 먼저 연결 필요');
  }

  const result = await postViaNas({
    blogId: conn.blog_id,
    nidAut: conn.nid_aut,
    nidSes: conn.nid_ses,
    title,
    content: sanitizeForNaver(content),
    tags: [],
    categoryNo: 18, // 전자제품
    isPublish: true,
    uploadSessionKey: conn.upload_session_key || '',
    naverUserId: conn.naver_user_id || '',
  });

  if (!result.postUrl && !result.postId) {
    throw new Error(`발행 실패: ${result.error || '알 수 없음'}`);
  }

  // 같은 원문을 두 번 쓰지 않도록 기록
  await admin.from('bossai_naver_tech_posts').insert({
    user_id: userId,
    source_url: topic.link,
    source_name: topic.source,
    source_title: topic.title,
    title,
    post_url: result.postUrl || '',
  });

  await admin.from('naver_publish_history').insert({
    user_id: userId,
    blog_id: conn.blog_id,
    post_id: result.postId || '',
    post_url: result.postUrl || '',
    title,
    notion_page_id: '',
    status: 'publish',
  });

  return {
    summary: `[${topic.source}] ${title} → ${result.postUrl}`,
    postUrl: result.postUrl,
    sourceUrl: topic.link,
    title,
  };
}
