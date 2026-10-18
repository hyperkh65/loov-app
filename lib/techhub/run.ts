/**
 * Tech Hub: 핫 소스 수집 → AI 집필 → 실사 사진+카드뉴스 서버 렌더 → 블로그(화수분/네이버) + SNS 카드뉴스 일괄 배포.
 * 맥 불필요. 이미지는 AI(Cloudflare) → 원문 이미지 → 스톡 순으로 폴백.
 */
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase-server';
import { scrapeArticleFull } from '@/lib/rewrite-site-scraper';
import { generateHqImage, searchStockImages } from '@/lib/blog-content-generator';
import { uploadToR2, r2Available } from '@/lib/r2-storage';
import { tightTitle, assertPublishableHtml } from '@/lib/html-gate';
import { sanitizeForNaver } from '@/lib/naver-blog';
import { postToPlatformWithMedia, postCommentOnOwnPost, waitThreadsPostAccessible } from '@/lib/sns/platforms-server';
import { logSnsPost } from '@/lib/sns/account-rotation';
import { withUtm } from '@/lib/utm';
import { getBloggerTokenAdmin, publishToBlogger } from '@/lib/scheduler/blog-runner';
import { dispatchNaverPublishJob } from '@/lib/scheduler/naver-tech-runner';
import type { Schedule } from '@/lib/scheduler';
import { collectCandidates, dropUsed, type Candidate } from './sources';
import { judge, writeArticle, writeCaptions, type Article } from './write';
import { renderAll } from './render';
import { TECHHUB_PROFILES, TECHHUB_BLOGS } from './accounts';

export interface TechHubConfig {
  dry_run?: boolean;
  profiles?: string[];
  blogger?: boolean;
  naver?: boolean;
  sns?: boolean;
  blogger_blog_id?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/** 원격 이미지를 받아 R2에 올려 안정적인 URL로 (핫링크 차단·만료 방지) */
async function rehost(url: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Referer: new URL(url).origin + '/' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return null;
    const buf = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    if (buf.length < 8_000) return null;
    return await uploadToR2(`techhub/${key}.jpg`, buf, 'image/jpeg');
  } catch { return null; }
}

type Photo = { url: string | null; how: 'ai' | 'original' | 'stock' | 'none' };
async function photo(prompt: string, stock: string, original: string | undefined, key: string): Promise<Photo> {
  const ai = await withTimeout(generateHqImage(prompt), 110_000).catch(() => null);
  if (ai) return { url: ai, how: 'ai' };
  const o = original ? await rehost(original, key) : null;
  if (o) return { url: o, how: 'original' };
  const s = stock ? (await searchStockImages(stock, 1).catch(() => []))[0] : undefined;
  const sr = s ? await rehost(s, key) : null;
  return sr ? { url: sr, how: 'stock' } : { url: null, how: 'none' };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

function buildHtml(a: Article, cover: string, photos: Photo[], cards: string[], src: { name: string; title: string; link: string }): string {
  const img = (u: string, alt: string) => `<figure><img src="${u}" alt="${esc(alt)}" style="max-width:100%;height:auto"/></figure>`;
  const strip = (s: string) => s.replace(/\*\*/g, '');
  const parts: string[] = [];
  parts.push(img(cover, a.title));
  parts.push(`<blockquote><strong>3줄 요약</strong><br/>${a.summary.slice(0, 3).map((s, i) => `${i + 1}. ${esc(strip(s))}`).join('<br/>')}</blockquote>`);
  a.sections.forEach((s, i) => {
    parts.push(`<h2>${esc(strip(s.h2))}</h2>`);
    if (photos[i + 1]?.url) parts.push(img(photos[i + 1].url!, s.alt || s.h2));
    s.paras.forEach(p => parts.push(`<p>${esc(strip(p))}</p>`));
  });
  parts.push('<h2>카드뉴스로 한눈에 보기</h2>');
  cards.forEach((c, i) => parts.push(img(c, `${a.title} 카드뉴스 ${i + 1}`)));
  if (a.faq.length) {
    parts.push('<h2>자주 묻는 질문</h2>');
    a.faq.forEach(f => parts.push(`<p><strong>Q. ${esc(strip(f.q))}</strong><br/>${esc(strip(f.a))}</p>`));
  }
  parts.push(`<p>참고: ${esc(src.name)} — ${esc(src.title)}</p>`);
  return parts.join('\n');
}

async function bloggerBlogId(token: string, url: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/byurl?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.id) throw new Error(`블로그 조회 실패(${res.status}): ${j?.error?.message || url}`);
  return j.id as string;
}

async function bloggerAccess(token: string, blogId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/blogger/v3/users/self/blogs/${blogId}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (res.ok) return 'ok';
  const j = await res.json().catch(() => ({}));
  return `no(${res.status}: ${j?.error?.message || ''})`.slice(0, 120);
}

async function pickAndScrape(topics: string, notes: string[]): Promise<{ c: Candidate; text: string; images: string[]; bodyImages: string[]; ranked: number }> {
  const { list, ok, failed } = await collectCandidates();
  notes.push(`소스 ${ok.length}곳 OK, 실패: ${failed.join(',') || '없음'}, 후보 ${list.length}`);
  const fresh = await dropUsed(list);
  if (!fresh.length) throw new Error('[스킵] 새로 쓸 후보가 없음');
  const ranked = await judge(fresh, topics);
  for (const [i, c] of ranked.filter(x => !/techmeme\.com/.test(x.link)).slice(0, 8).entries()) { // 테크밈은 모음 페이지라 원문이 아님(화제성 신호로만 사용)
    let s = { text: '', images: [] as string[], bodyImages: [] as string[] };
    try { s = await scrapeArticleFull(c.link); } catch { /* 요약으로 대체 시도 */ }
    const text = s.text.length >= 800 ? s.text : (c.summary.length >= 150 ? `${c.title}\n${c.summary}` : '');
    if (text) return { c, text, images: s.images, bodyImages: s.bodyImages, ranked: i };
  }
  throw new Error('[스킵] 본문을 가져올 수 있는 후보가 없음');
}

export async function runTechHub(schedule: Schedule): Promise<{ summary: string; result: Record<string, unknown> }> {
  if (!r2Available()) throw new Error('R2 미설정 — 이미지 업로드 불가');
  const cfg = (schedule.config || {}) as unknown as TechHubConfig;
  const dry = !!cfg.dry_run;
  const profiles = TECHHUB_PROFILES.filter(p => p.enabled && (!cfg.profiles?.length || cfg.profiles.includes(p.id)));
  if (!profiles.length) throw new Error('활성 프로필 없음');
  const notes: string[] = [];
  const t0 = Date.now();
  const lap = (l: string) => notes.push(`${l} ${Math.round((Date.now() - t0) / 1000)}s`);

  const { c, text, images, bodyImages, ranked } = await pickAndScrape(profiles.map(p => p.topics).join(' / '), notes);
  lap(`선정[${c.source}] #${ranked} ${c.title.slice(0, 60)}`);

  const a = await writeArticle(c, text, profiles.map(p => p.topics).join(' / '));
  a.title = tightTitle(a.title);
  lap('집필');

  const slug = `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`;
  const jobs = [{ p: a.coverPrompt, s: a.coverStock, o: images[0] }, ...a.sections.slice(0, 4).map((s, i) => ({ p: s.photoPrompt, s: s.stock, o: bodyImages[i] || images[i + 1] }))];
  const photos = await pool(jobs, 2, (j, i) => photo(j.p, j.s, j.o, `${slug}/photo${i}`));
  lap(`사진 ${photos.map(x => x.how).join('/')}`);

  const brand = profiles[0].brand;
  const { wideCover, cards } = await renderAll({
    slides: a.cards.slice(0, 7), hook: a.hook, kicker: a.kicker, brand, handle: profiles[0].handle,
    coverPhotoUrl: photos[0].url, source: { name: c.source, title: c.title, imageUrl: images[0] || null }, slug,
  });
  lap(`렌더 카드 ${cards.length}장`);

  const html = buildHtml(a, wideCover, photos, cards, { name: c.source, title: c.title, link: c.link });
  assertPublishableHtml(a.title, html);

  const result: Record<string, unknown> = {
    dry_run: dry, title: a.title, hook: a.hook, source: c.source, sourceUrl: c.link, wideCover, cards,
    photos: photos.map(p => ({ how: p.how, url: p.url })), notes,
  };
  const admin = createAdminClient();
  const userId = schedule.user_id;
  const errors: string[] = [];
  let blogUrl = '';
  const done: string[] = [];

  // 블로거(화수분)
  const bl = TECHHUB_BLOGS.blogger;
  let bloggerReady: { token: string; blogId: string } | null = null;
  if (bl && cfg.blogger !== false) {
    try {
      const token = await getBloggerTokenAdmin(userId);
      if (!token) throw new Error('Blogger 계정 연결 없음');
      const blogId = cfg.blogger_blog_id || bl.blogId || await bloggerBlogId(token, bl.url);
      bloggerReady = { token, blogId };
      result.bloggerAccess = await bloggerAccess(token, blogId);
    } catch (e) { errors.push(`blogger: ${e instanceof Error ? e.message : e}`); }
  }

  // 계정별 캡션 (드라이런에서도 생성해서 품질 확인)
  const captions: Record<string, { instagram: string; threads: string }> = {};
  for (const p of profiles) {
    try { captions[p.id] = await writeCaptions(a, p); } catch (e) { errors.push(`caption ${p.id}: ${e instanceof Error ? e.message : e}`); }
  }
  result.captions = captions;
  lap('캡션');

  if (dry) {
    result.errors = errors;
    return { summary: `[드라이런] ${a.title} — 카드 ${cards.length}장, 사진 ${photos.map(x => x.how).join('/')}, blogger=${result.bloggerAccess ?? 'n/a'}${errors.length ? ` / 오류 ${errors.join(' | ')}`.slice(0, 200) : ''}`, result };
  }

  if (bloggerReady && cfg.blogger !== false) {
    try {
      blogUrl = await publishToBlogger(bloggerReady.token, bloggerReady.blogId, a.title, html, a.tags);
      done.push('blogger'); result.blogUrl = blogUrl;
    } catch (e) { errors.push(`blogger 발행: ${e instanceof Error ? e.message : e}`); }
  }

  // 네이버 블로그(Playwright 큐)
  if (TECHHUB_BLOGS.naver && cfg.naver !== false) {
    try {
      const { data: conn } = await admin.from('naver_connections').select('blog_id, nid_aut, nid_ses').eq('user_id', userId).single();
      if (!conn?.blog_id || !conn.nid_aut || !conn.nid_ses) throw new Error('네이버 연결 정보 없음');
      const { data: job, error } = await admin.from('naver_publish_jobs').insert({
        user_id: userId, title: a.title, content: sanitizeForNaver(html), tags: a.tags.slice(0, 10),
        category_no: TECHHUB_BLOGS.naver.categoryNo, is_publish: true, job_type: 'scrape', source_url: c.link, notion_page_id: '__techhub__', status: 'pending',
      }).select('id').single();
      if (error || !job) throw new Error(`job 등록 실패: ${error?.message}`);
      await dispatchNaverPublishJob(job.id);
      done.push('naver'); result.naverJob = job.id;
    } catch (e) { errors.push(`naver: ${e instanceof Error ? e.message : e}`); }
  }

  // SNS 카드뉴스 (계정마다 자기 캡션)
  if (cfg.sns !== false) {
    const { data: conns } = await admin.from('sns_connections').select('platform, platform_user_id, access_token').eq('user_id', userId).eq('is_active', true);
    const slog = (platform: string, status: 'success' | 'failed', note?: string, postId?: string) =>
      admin.from('sns_post_logs').insert({ user_id: userId, platform, status, ...(note ? { error_message: `[techhub] ${note}`.slice(0, 500) } : {}), ...(postId ? { platform_post_id: postId } : {}) }).then(() => {}, () => {});
    const sns: Record<string, string> = {};
    for (const p of profiles) {
      const cap = captions[p.id];
      if (!cap) continue;
      for (const platform of ['instagram', 'threads'] as const) {
        const uid = p[platform];
        const conn = uid ? (conns || []).find(x => x.platform === platform && x.platform_user_id === uid) : undefined;
        if (!conn) { if (uid) errors.push(`${p.id} ${platform}: 연결 없음`); continue; }
        try {
          const posted = await postToPlatformWithMedia(platform, conn.access_token, conn.platform_user_id, cap[platform], cards.slice(0, 10));
          slog(platform, 'success', undefined, posted.id); logSnsPost(admin, platform, conn.platform_user_id).catch(() => {});
          sns[`${p.id}.${platform}`] = posted.id; done.push(`${p.id}.${platform}`);
          if (p.linkComment && blogUrl) {
            let last = '';
            for (let k = 0; k < 3; k++) {
              try {
                if (platform === 'threads') await waitThreadsPostAccessible(posted.id, conn.access_token); else await new Promise(r => setTimeout(r, 4000));
                await postCommentOnOwnPost(platform, conn.access_token, conn.platform_user_id, posted.id, `자세한 내용은 여기서 👉 ${withUtm(blogUrl, `${platform}_techhub`)}`);
                last = ''; break;
              } catch (ce) { last = ce instanceof Error ? ce.message : String(ce); await new Promise(r => setTimeout(r, 8000)); }
            }
            if (last) { slog(`${platform}_comment`, 'failed', `링크 댓글 실패: ${last}`); errors.push(`${p.id} ${platform} 댓글: ${last}`); }
          }
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          slog(platform, 'failed', `${p.id}: ${m}`); errors.push(`${p.id} ${platform}: ${m}`);
        }
      }
    }
    result.sns = sns;
  }

  result.errors = errors; result.done = done;
  if (!done.length) throw new Error(`발행된 곳이 없음: ${errors.join(' | ')}`.slice(0, 480));

  await admin.from('bossai_naver_tech_posts').insert({
    user_id: userId, source_url: c.link, source_name: c.source, source_title: c.title, title: a.title, post_url: blogUrl,
  });
  return { summary: `${a.title} → ${done.join(', ')}${errors.length ? ` (오류 ${errors.length}: ${errors[0].slice(0, 80)})` : ''}`, result };
}
