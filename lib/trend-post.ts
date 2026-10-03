/**
 * 트렌드 글 자동 발행(2days.kr) — 텔레그램 명령·Codex·Claude 어느 쪽이 시켜도 이 함수 하나로 동작.
 * 1) 구글트렌드·X(trends24)·네이버 실시간(signal.bz)·빙뉴스·구글뉴스에서 겹치는 인기 키워드 선정
 * 2) 네이버·구글·빙 뉴스로 교차검증(2개 이상 매체 일치 사실만)
 * 3) 기존 생성기로 글·AI 대표이미지·본문 이미지 → 2days.kr 발행 → SNS
 */
import { createAdminClient } from '@/lib/supabase-server';
import { generateText } from '@/lib/auto-blog-ai';
import { generateBlogContent, searchNaver, searchInlineImages, rehostImages, insertImagesIntoContent } from '@/lib/blog-content-generator';
import { generateAndUploadThumbnail } from '@/lib/auto-blog-thumbnail';
import { sanitizeInvisible, assertPublishableHtml, tightTitle } from '@/lib/html-gate';
import { publishToWordPress, crossPostBlogToSns } from '@/lib/scheduler/blog-runner';
import { alertOwner } from '@/lib/owner-alert';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36';
const SITE = 'https://2days.kr';

const get = (url: string) => fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12_000) }).then(r => r.text()).catch(() => '');
const rssTitles = (xml: string, n: number) =>
  [...xml.matchAll(/<title>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/title>/g)].map(m => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()).slice(1, n + 1);

async function collectTrends(): Promise<Record<string, string[]>> {
  const [g, x, s, b, gn] = await Promise.all([
    get('https://trends.google.com/trending/rss?geo=KR'),
    get('https://trends24.in/korea/'),
    get('https://api.signal.bz/news/realtime'),
    get('https://www.bing.com/news/search?q=%EC%86%8D%EB%B3%B4&format=rss&setmkt=ko-KR'),
    get('https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko'),
  ]);
  let naver: string[] = [];
  try { naver = (JSON.parse(s).top10 || []).map((t: { keyword: string }) => t.keyword); } catch { /* 빈 값 */ }
  return {
    google_trends: rssTitles(g, 20),
    x_trends: [...x.matchAll(/class="?trend-link"?[^>]*>([^<]+)</g)].map(m => m[1].trim()).slice(0, 25),
    naver_realtime: naver,
    bing_news: rssTitles(b, 15),
    google_news: rssTitles(gn, 15),
  };
}

async function newsFor(keyword: string): Promise<Array<{ outlet: string; title: string; desc: string }>> {
  const q = encodeURIComponent(keyword);
  const [naver, gn, bing] = await Promise.all([
    searchNaver('news', keyword).catch(() => []),
    get(`https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`),
    get(`https://www.bing.com/news/search?q=${q}&format=rss&setmkt=ko-KR`),
  ]);
  const fromRss = (xml: string, src: string) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map(m => {
    const t = m[1].match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/)?.[1] || '';
    const d = (m[1].match(/<description>([\s\S]*?)<\/description>/)?.[1] || '').replace(/<[^>]+>|&lt;[^&]*&gt;/g, ' ');
    const outlet = m[1].match(/<source[^>]*>([^<]+)<\/source>/)?.[1] || t.split(' - ').pop() || src;
    return { outlet: outlet.trim(), title: t.replace(/ - [^-]+$/, '').trim(), desc: d.replace(/\s+/g, ' ').trim().slice(0, 200) };
  });
  return [
    ...naver.slice(0, 8).map((n: { title: string; description: string; link: string }) => ({ outlet: (() => { try { return new URL(n.link).hostname.replace(/^www\./, ''); } catch { return '네이버뉴스'; } })(), title: n.title, desc: n.description })),
    ...fromRss(gn, '구글뉴스'), ...fromRss(bing, '빙뉴스'),
  ];
}

const jsonOf = (s: string) => { try { return JSON.parse(s.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch { return {}; } };

// 로컬 Claude/Codex가 직접 쓴 완성 글(article)을 받으면 생성 단계는 건너뛰고 이미지·발행·SNS만 처리
export async function runTrendPost(opts: { keyword?: string; userId?: string; article?: { title: string; html: string; outlets?: string[] } } = {}): Promise<{ ok: boolean; keyword?: string; title?: string; url?: string; outlets?: string[]; error?: string }> {
  const userId = opts.userId || process.env.OWNER_USER_ID!;
  try {
    if (opts.article) return await publishProvided(opts.article, opts.keyword || opts.article.title, userId);

    // 1) 키워드
    let keyword = opts.keyword?.trim();
    let reason = '직접 지정';
    if (!keyword) {
      const trends = await collectTrends();
      const recent = await fetch(`${SITE}/wp-json/wp/v2/posts?per_page=30&_fields=title`).then(r => r.json()).catch(() => []) as Array<{ title: { rendered: string } }>;
      const pick = jsonOf(await generateText(
        `아래는 지금 한국의 인기 검색어·트렌드·헤드라인이다(소스별).\n${JSON.stringify(trends)}\n\n` +
        `최근 우리 블로그에 이미 쓴 글(중복 금지): ${recent.map(p => p.title.rendered).join(' / ').slice(0, 1500)}\n\n` +
        `2개 이상 소스에서 겹치는(같은 사건·인물·주제) 것 중, 사람들이 지금 검색해서 읽고 싶어 할 주제 1개를 골라라. 비극적 사고의 희생자 개인 신상, 선정적 루머는 제외.\n` +
        `블로그 검색 키워드 형태(2~5단어 한국어 명사구)로. JSON만: {"keyword":"...","reason":"겹친 소스와 이유 한 줄"}`,
        'gemini', undefined, undefined, undefined, undefined, { multilingual: true },
      ));
      keyword = String(pick.keyword || '').trim() || trends.naver_realtime[0] || trends.google_trends[0];
      reason = pick.reason || '';
    }
    if (!keyword) throw new Error('트렌드 키워드를 찾지 못함');

    // 2) 교차검증
    const news = await newsFor(keyword);
    const verified = jsonOf(await generateText(
      `키워드: ${keyword}\n아래는 여러 매체 보도다.\n${news.map((n, i) => `[${i + 1}] (${n.outlet}) ${n.title} — ${n.desc}`).join('\n').slice(0, 6000)}\n\n` +
      `서로 다른 매체 2곳 이상이 일치하게 보도한 사실만 골라 정리하라(숫자·날짜·인물·경위). 한 곳만 말한 내용, 추측, 매체 간 다른 내용은 빼라.\n` +
      `JSON만: {"facts":["사실1","사실2",...최대 10개],"outlets":["사실 근거가 된 매체명 최대 5개"]}`,
      'gemini', undefined, undefined, undefined, undefined, { multilingual: true },
    ));
    const facts: string[] = Array.isArray(verified.facts) ? verified.facts.slice(0, 10) : [];
    const outlets: string[] = Array.isArray(verified.outlets) ? verified.outlets.slice(0, 5) : [];

    // 3) 글·이미지
    const gen = await generateBlogContent(keyword, 'qwen3', undefined, facts.length ? facts.map(f => `- ${f}`).join('\n') : undefined);
    const content = gen.content + (outlets.length
      ? `\n<p style="margin-top:24px;padding:12px 14px;background:#f6f7f9;border-radius:8px;font-size:14px;color:#555;">이 글은 ${outlets.join('·')} 보도를 교차 확인해 공통된 사실을 중심으로 정리했습니다.</p>`
      : '');

    // 4) 발행(즉시 — 분산 슬롯 우회) + SNS
    const { data: site } = await createAdminClient().from('wordpress_sites').select('site_url, wp_username, app_password').eq('site_url', SITE).single();
    if (!site) throw new Error('2days.kr 연결 정보 없음');
    const wp = await publishToWordPress(site.site_url, site.wp_username, site.app_password, gen.title, content, gen.imageUrl, 'publish', { bypassSlot: true });
    if (!wp.link) throw new Error('워드프레스 발행 실패');
    crossPostBlogToSns(userId, SITE, gen.title, wp.link, wp.featuredImageUrl || gen.imageUrl, content).catch(() => {});
    alertOwner(`trend:${wp.link}`, `🔥 트렌드 글 발행\n키워드: ${keyword}\n선정 이유: ${reason}\n교차확인 매체: ${outlets.join(', ') || '-'}\n${decodeURI(wp.link)}`).catch(() => {});
    return { ok: true, keyword, title: gen.title, url: wp.link, outlets };
  } catch (e) {
    const error = (e as Error).message?.slice(0, 300);
    alertOwner(`trend-fail:${Date.now()}`, `⚠️ 트렌드 글 발행 실패\n${opts.keyword || '(자동 키워드)'}\n${error}`).catch(() => {});
    return { ok: false, keyword: opts.keyword, error };
  }
}

async function publishProvided(article: { title: string; html: string; outlets?: string[] }, keyword: string, userId: string) {
  const title = tightTitle(sanitizeInvisible(article.title));
  let content = sanitizeInvisible(article.html);
  assertPublishableHtml(title, content);
  const { displayUrls, thumbUrl } = await searchInlineImages(keyword, 3, { aiThumb: true, thumbTitle: title });
  content = insertImagesIntoContent(content, await rehostImages(displayUrls), keyword);
  if (article.outlets?.length) content += `\n<p style="margin-top:24px;padding:12px 14px;background:#f6f7f9;border-radius:8px;font-size:14px;color:#555;">이 글은 ${article.outlets.slice(0, 5).join('·')} 보도를 교차 확인해 공통된 사실을 중심으로 정리했습니다.</p>`;
  const imageUrl = await generateAndUploadThumbnail(title, keyword, 'blue', thumbUrl).catch(() => null);
  const { data: site } = await createAdminClient().from('wordpress_sites').select('site_url, wp_username, app_password').eq('site_url', SITE).single();
  if (!site) throw new Error('2days.kr 연결 정보 없음');
  const wp = await publishToWordPress(site.site_url, site.wp_username, site.app_password, title, content, imageUrl, 'publish', { bypassSlot: true });
  if (!wp.link) throw new Error('워드프레스 발행 실패');
  crossPostBlogToSns(userId, SITE, title, wp.link, wp.featuredImageUrl || imageUrl, content).catch(() => {});
  alertOwner(`trend:${wp.link}`, `🔥 트렌드 글 발행(로컬 AI 작성)\n키워드: ${keyword}\n${decodeURI(wp.link)}`).catch(() => {});
  return { ok: true, keyword, title, url: wp.link, outlets: article.outlets || [] };
}
