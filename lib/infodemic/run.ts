/**
 * 미라쿨 자동 글(하루 3개): 인포데믹(주제·사실 참고용) → 뉴스 교차 확인 → 새로 쓰기 → 근거 없는 주장 제거 → 품질 게이트
 * → 정보 카드 이미지(서버에서 그림, 맥 불필요) → 미라쿨 발행. 확인 안 되면 올리지 않는다.
 */
import { createAdminClient } from '@/lib/supabase-server';
import { scrapeArticleFull } from '@/lib/rewrite-site-scraper';
import { assertPublishableHtml, tightTitle } from '@/lib/html-gate';
import { r2Available } from '@/lib/r2-storage';
import { getWpCredentials, publishSlotFree, publishToWordPress } from '@/lib/scheduler/blog-runner';
import type { Schedule } from '@/lib/scheduler';
import { askJson, writeDraft, findUnsupported, lint, isSensitive, type Draft, type Source } from './write';
import { renderCover, renderInfoCard } from './card';

export interface InfodemicConfig { wp_site_id?: string; dry_run?: boolean; used?: string[]; min_external?: number }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const FEED = 'https://infodemic.kr/rss';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tag = (b: string, t: string) => (b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const timeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function fetchText(url: string, ms = 15000): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

interface Cand { title: string; link: string; summary: string; body: string }
async function candidates(used: Set<string>): Promise<Cand[]> {
  const xml = await fetchText(FEED);
  const out: Cand[] = [];
  for (const b of (xml.match(/<item>[\s\S]*?<\/item>/g) || []).slice(0, 40)) {
    const title = tag(b, 'title'), link = tag(b, 'link'), full = tag(b, 'description'), summary = full.slice(0, 400);
    if (!title || !/^https?:/.test(link) || used.has(link)) continue;
    if (isSensitive(title) || isSensitive(summary)) continue;
    out.push({ title, link, summary, body: full });
  }
  return out;
}

async function readSource(url: string, n: number, external: boolean, diag?: string[]): Promise<Source | null> {
  try {
    const a = await timeout(scrapeArticleFull(url), 20000);
    const text = (a.text || '').replace(/\s+/g, ' ').trim();
    if (text.length < 400) { diag?.push(`${host(url)}: 본문 짧음(${text.length})`); return null; }
    let title = '';
    try { title = tag(await fetchText(url, 8000), 'title').slice(0, 80); } catch { /* 제목은 선택 */ }
    return { n, url, host: host(url), title: title || host(url), text: text.slice(0, 6000), external };
  } catch (e) { diag?.push(`${host(url)}: ${String(e).slice(0, 50)}`); return null; }
}

/** 뉴스 검색(Bing 뉴스 RSS → 안 되면 네이버)에서 서로 다른 언론사 기사를 모아 읽는다(주제어가 실제로 들어 있는 것만) */
async function newsLinks(queries: string[], diag: string[]): Promise<string[]> {
  const links: string[] = [], hosts = new Set<string>();
  const add = (raw: string) => {
    let u = raw.replace(/&amp;/g, '&').trim();
    try { const x = new URL(u); const real = x.searchParams.get('url'); if (/bing\.com$/.test(x.hostname) && real) u = decodeURIComponent(real); } catch { return; }
    const h = host(u);
    if (!/^https?:/.test(u) || /naver|pstatic|daum|kakao|google|youtube|infodemic|tistory|instagram|facebook|bing\.com|msn\.com/.test(h) || hosts.has(h)) return;
    hosts.add(h); links.push(u);
  };
  for (const query of queries) {
    if (links.length >= 4) break;
    try {
      const xml = await fetchText(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setmkt=ko-KR&cc=kr`);
      for (const b of xml.match(/<item>[\s\S]*?<\/item>/g) || []) add(b.match(/<link>([^<]*)<\/link>/)?.[1] || '');
      diag.push(`Bing "${query.slice(0, 14)}" → ${links.length}곳`);
    } catch (e) { diag.push(`Bing 실패 ${String(e).slice(0, 30)}`); }
  }
  if (links.length < 3) {
    try {
      const html = await fetchText(`https://search.naver.com/search.naver?where=news&sort=1&query=${encodeURIComponent(queries[queries.length - 1])}`);
      for (const m of html.matchAll(/href="(https?:\/\/[^"#]+)"/g)) { if (/(article|news|view|read|page)/i.test(m[1])) add(m[1]); }
      diag.push(`네이버 보강 후 ${links.length}곳`);
    } catch (e) { diag.push(`네이버 실패 ${String(e).slice(0, 30)}`); }
  }
  return links.slice(0, 8);
}

async function externalSources(query: string, entity: string, startN: number, diag: string[]): Promise<Source[]> {
  const links = await newsLinks([...new Set([query, entity, `${entity} 정보`])], diag);
  const key = (entity.split(/\s+/)[0] || entity).trim();
  const out: Source[] = [];
  for (const u of links) {
    const s = await readSource(u, startN + out.length, true, diag);
    if (s && !s.text.includes(key)) diag.push(`${host(u)}: 주제어(${key}) 없음`);
    if (s && s.text.includes(key)) out.push(s);
    if (out.length >= 4) break;
  }
  return out;
}

const bigrams = (s: string) => { const t = s.replace(/\s+/g, ''); const o = new Set<string>(); for (let i = 0; i + 2 <= t.length; i++) o.add(t.slice(i, i + 2)); return o; };
const similar = (a: string, b: string) => { const x = bigrams(a), y = bigrams(b); let i = 0; x.forEach(v => { if (y.has(v)) i++; }); return i / Math.max(1, x.size + y.size - i); };

async function recentTitles(wpUrl: string): Promise<string[]> {
  try {
    const r = await fetch(`${wpUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts?per_page=40&_fields=title`, { signal: AbortSignal.timeout(10000) });
    return ((await r.json()) as Array<{ title: { rendered: string } }>).map(p => p.title.rendered);
  } catch { return []; }
}

function toHtml(d: Draft, cardUrl: string, srcs: Source[], today: string): string {
  const p = (t: string) => `<p style="margin-bottom:15px;">${esc(t)}</p>`;
  const parts: string[] = [p(d.answer), `<figure style="text-align:center;margin:0 auto 28px;"><img src="${cardUrl}" alt="${esc(d.card.headline)} 정보 카드" loading="lazy" style="max-width:100%;height:auto;border-radius:12px;" /></figure>`, p(`확인 기준일: ${today} · 아래 자료에서 공통으로 확인되는 내용만 정리했어요.`)];
  for (const s of d.sections) {
    parts.push(`<h2>${esc(s.h2)}</h2>`, ...s.paras.map(p));
    if (s.bullets?.length) parts.push(`<ul>${s.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`);
    if (s.table?.rows?.length) parts.push(`<table style="width:100%;border-collapse:collapse;margin:0 0 20px;"><thead><tr>${s.table.head.map(h => `<th style="border:1px solid #ddd;background:#f6f7f9;padding:10px;text-align:left;">${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map(r => `<tr>${r.map(c => `<td style="border:1px solid #ddd;padding:10px;">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
  }
  parts.push('<h2>자주 묻는 질문</h2>', ...d.faq.map(f => `<div style="font-weight:bold;margin:14px 0 4px;">${esc(f.q)}</div>\n<div style="color:#555;">${esc(f.a)}</div>`));
  const ext = srcs.filter(s => s.external);
  if (ext.length) parts.push('<h2>참고한 자료</h2>', `<ul>${ext.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="nofollow noopener">${esc(s.host)}</a></li>`).join('')}</ul>`, p('이 글은 위 자료에서 공개된 사실을 확인해 새로 작성했어요. 내용이 바뀌거나 정정되면 다시 확인해 고쳐요.'));
  return parts.join('\n');
}

export async function runInfodemic(schedule: Schedule): Promise<{ summary: string; result: Record<string, unknown> }> {
  if (!r2Available()) throw new Error('R2 미설정 — 이미지 업로드 불가');
  const cfg = (schedule.config || {}) as unknown as InfodemicConfig;
  if (!cfg.wp_site_id) throw new Error('config.wp_site_id(미라쿨 사이트) 필요');
  const dry = !!cfg.dry_run, minExt = cfg.min_external ?? 2;
  const wp = await getWpCredentials(cfg.wp_site_id);
  if (!dry && !await publishSlotFree(wp.url)) return { summary: '발행 간격 대기(건너뜀)', result: { skipped: 'slot' } };

  const used = new Set(cfg.used || []);
  const cands = await candidates(used);
  if (!cands.length) return { summary: '새 후보 없음', result: { skipped: 'no_candidates' } };
  const recent = await recentTitles(wp.url);

  // 독자가 검색할 만하고 사실로 확인 가능한 주제를 AI가 고른다
  const top = cands.slice(0, 14);
  const pick = await askJson<{ picks: Array<{ i: number; entity: string; query: string }> }>(
    `당신은 정보 블로그 편집자입니다. 아래는 참고 블로그의 최근 글 제목입니다. 이 중 "사람들이 검색할 만하고, 공개된 기사로 사실 확인이 되는" 주제를 최대 3개 고르세요.\n선호: 방송·작품 정보(방영일, 출연, 줄거리 정리), 공개된 프로필 정보(데뷔, 작품, 소속 등), 일정·결과 정리. 제외: 사생활 폭로, 의혹, 사건사고, 루머.\n각 항목: i=번호, entity=핵심 대상 이름(프로그램/작품/인물 1개), query=독자가 검색할 만한 문장(예: "이혼숙려캠프 26기 출연 부부 정보").\n${top.map((c, i) => `${i}. ${c.title}`).join('\n')}\nJSON만: {"picks":[{"i":0,"entity":"","query":""}]}`,
    v => (Array.isArray(v.picks) && v.picks.length ? null : 'picks 없음'),
    '주제 고르기',
  );

  const notes: string[] = [];
  for (const pk of pick.picks.slice(0, 3)) {
    const c = top[pk.i]; if (!c || !pk.entity || !pk.query) continue;
    if (recent.some(t => similar(t, c.title) > 0.55 || similar(t, pk.query) > 0.55)) { notes.push(`${c.title.slice(0, 20)}: 최근 글과 겹침`); continue; }
    const dg: string[] = [];
    const base: Source | null = c.body.length >= 500 ? { n: 1, url: c.link, host: 'infodemic.kr', title: c.title, text: c.body.slice(0, 6000), external: false } : await readSource(c.link, 1, false, dg);
    const ext = await externalSources(pk.query, pk.entity, 2, dg);
    if (!base || ext.length < minExt) { notes.push(`${pk.entity}: 확인 출처 부족(${ext.length}/${minExt}${base ? '' : ', 참고글 못 읽음'}) [${dg.join('; ').slice(0, 260)}]`); continue; }
    const srcs = [base, ...ext];

    let draft = await writeDraft({ title: c.title, entity: pk.entity, query: pk.query }, srcs);
    let bad = await findUnsupported(draft, srcs);
    if (bad.length) { draft = await writeDraft({ title: c.title, entity: pk.entity, query: pk.query }, srcs, bad); bad = await findUnsupported(draft, srcs); }
    if (bad.length) { notes.push(`${pk.entity}: 근거 없는 주장 ${bad.length}건 [${bad.slice(0, 4).map(x => x.slice(0, 50)).join(' / ')}]`); continue; }
    const why = lint(draft, srcs);
    if (why) { notes.push(`${pk.entity}: ${why}`); continue; }

    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const [cover, card] = await Promise.all([renderCover(draft.title, draft.card.kicker, key), renderInfoCard(draft.card, key)]);
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const html = toHtml(draft, card, srcs, today);
    const title = tightTitle(draft.title);
    assertPublishableHtml(title, html);
    const result: Record<string, unknown> = { title, source: c.link, entity: pk.entity, external: ext.map(s => s.host), cover, card, chars: html.length };
    if (dry) return { summary: `[드라이런] ${title} — 출처 ${ext.length}곳, ${html.length}자`, result: { ...result, html: html.slice(0, 6000) } };

    const post = await publishToWordPress(wp.url, wp.username, wp.appPassword, title, html, cover, 'publish');
    result.url = post.link;
    const next = [...(cfg.used || []), c.link].slice(-400);
    await createAdminClient().from('bossai_schedules').update({ config: { ...(schedule.config as object), used: next } }).eq('id', schedule.id);
    return { summary: `${title} → ${post.link}`, result };
  }
  return { summary: `발행 없음(검증 통과 못 함): ${notes.join(' | ').slice(0, 900)}`, result: { skipped: 'verify', notes } };
}
