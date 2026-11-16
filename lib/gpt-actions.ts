/**
 * GPT 블로그 작가 공용 처리: research / page / validate / draft.
 * 기존 GPT 액션(app/api/gpt/[action])과 ChatGPT 플러그인용 MCP 서버(app/api/blog-mcp/[key])가 함께 쓴다.
 * 입력 b.openaiFileIdRefs = [{ name, id, mime_type, download_link }] (MCP는 image_1.. 파일 파라미터를 이 모양으로 바꿔 넣는다).
 */
import { uploadToR2 } from '@/lib/r2-storage';
import { createAdminClient } from '@/lib/supabase-server';
import { scrapeArticleFull } from '@/lib/rewrite-site-scraper';
import { rehostImages, searchStockImages, insertRepresentativeImageIntoContent, insertImagesIntoContent } from '@/lib/blog-content-generator';
import { safeUrl, research, RISK_NOTES, needsRiskNotes, validateDraft, normalizeHtml } from '@/lib/gpt-bridge';

export interface ActionResult { status: number; body: unknown }
const R = (body: unknown, init?: { status?: number }): ActionResult => ({ status: init?.status ?? 200, body });

const FILE_EXT = /\.(pdf|hwp|hwpx|docx?|xlsx?|pptx?|csv|zip)(?:$|\?)/i;
const FILE_MIME: Record<string, string> = { pdf: 'application/pdf', csv: 'text/csv', zip: 'application/zip' };

async function saveAttachments(list: Array<{ url?: string; name?: string; source_page_url?: string; permission_note?: string }>) {
  const ok: string[] = [], skipped: string[] = [];
  for (const a of list.slice(0, 5)) {
    try {
      const ext = a.url?.match(FILE_EXT)?.[1]?.toLowerCase();
      if (!a.url || !safeUrl(a.url) || !ext) throw new Error('파일 주소/확장자 부적합');
      if ((a.permission_note || '').trim().length < 10 || !safeUrl(a.source_page_url || '')) throw new Error('permission_note/source_page_url 필요');
      const res = await fetch(a.url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Mozilla/5.0' } });
      const buf = Buffer.from(await res.arrayBuffer());
      if (!res.ok || buf.length < 1000 || buf.length > 15_000_000) throw new Error('다운로드 실패/크기 초과');
      const url = await uploadToR2(`files/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`, buf, FILE_MIME[ext] || 'application/octet-stream');
      const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const host = new URL(a.source_page_url!).hostname.replace(/^www\./, '');
      ok.push(`<li><a href="${url}" download>${esc(a.name || '내려받기')}.${ext}</a> — 출처: <a href="${esc(a.source_page_url!)}" target="_blank" rel="noopener nofollow">${host}</a> (${esc(a.permission_note!.trim())})</li>`);
    } catch (e) { skipped.push(`${a.name || a.url}: ${(e as Error).message}`); }
  }
  return { html: ok.length ? `<h2>양식·자료 내려받기</h2><ul>${ok.join('')}</ul>` : '', skipped };
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runGptAction(action: string, b: any): Promise<ActionResult> {

  if (action === 'research') {
    if (!b.keyword) return R({ error: 'keyword 필요' }, { status: 400 });
    const [r, img] = await Promise.all([research(b.keyword), b.image_query_en ? searchStockImages(b.image_query_en, 6) : []]);
    return R({ ...r, stock_image_candidates: img, ...(needsRiskNotes(b.keyword) ? { risk_notes: RISK_NOTES } : {}) });
  }

  if (action === 'page') {
    if (!safeUrl(b.url || '')) return R({ error: '허용되지 않는 URL' }, { status: 400 });
    return R({ url: b.url, ...(await scrapeArticleFull(b.url)) });
  }

  const files: string[] = (b.openaiFileIdRefs || []).map((f: { download_link?: string }) => f.download_link).filter(Boolean);
  const v = validateDraft({ ...b, hasFileImages: files.length > 0, fileCount: files.length });
  const refs = Array.isArray(b.openaiFileIdRefs) ? b.openaiFileIdRefs : [];
  console.log(`[gpt-${action}] openaiFileIdRefs=${refs.length} usable=${files.length} keys=${refs[0] ? Object.keys(refs[0]).join(',') : '-'} mime=${refs.map((f: { mime_type?: string }) => f.mime_type || '?').join(',')}`);
  if (!files.length && refs.length) { v.errors.push(`openaiFileIdRefs ${refs.length}개를 받았지만 download_link가 없음(받은 키: ${Object.keys(refs[0]).join(',')})`); v.pass = false; }
  if (action === 'validate') return R(v);
  if (action !== 'draft') return R({ error: 'not found' }, { status: 404 });
  if (!v.pass) return R({ saved: false, ...v }, { status: 422 });

  const why: string[] = [];
  const memo = new Map<string, Promise<string | undefined>>();
  const rehost = (u: string) => {
    if (!safeUrl(u)) { why.push(`주소 부적합: ${u.slice(0, 60)}`); return Promise.resolve(undefined); }
    if (!memo.has(u)) memo.set(u, rehostImages([u], why).then(r => r[0]));
    return memo.get(u)!;
  };
  const r2 = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  const usedFiles = new Set([...b.content_html.matchAll(/\{\{file:(\d+)\}\}/g)].map(m => Number(m[1])));
  const dropped: string[] = [];
  let content = normalizeHtml(b.content_html.replace(/\{\{file:(\d+)\}\}/g, (_: string, n: string) => files[Number(n) - 1] || ''));
  for (const tag of new Set(content.match(/<img\b[^>]*>/gi) || [])) {
    const u = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1];
    if (!u) { dropped.push('src 비어 있는 <img>'); content = content.split(tag).join(''); continue; }
    if (r2 && u.startsWith(r2)) continue;
    const re = await rehost(u);
    if (!re) dropped.push(u.slice(0, 80));
    content = content.split(tag).join(re ? tag.replace(u, re) : '');
  }
  const extraTry = await Promise.all(files.map(async (f, i) => (usedFiles.has(i + 1) || (i === 0 && !b.featured_image_url) ? undefined : { i, u: await rehost(f) })));
  for (const x of extraTry) if (x && !x.u) dropped.push(`openaiFileIdRefs[${x.i + 1}]`);
  const extra = extraTry.map(x => x?.u).filter((u): u is string => !!u);
  if (extra.length) content = insertImagesIntoContent(content, extra, b.keyword);
  if (dropped.length) return R({ saved: false, errors: [`본문 이미지 ${dropped.length}장을 가져오지 못해 저장 중단: ${dropped.join(', ')} — 같은 이미지를 다시 첨부하거나 이미지를 새로 만들어 다시 saveDraft 할 것. 이미지 빼고 저장 금지${why.length ? ` [원인: ${why.slice(0, 3).join(' | ')}]` : ''}`], warnings: v.warnings }, { status: 422 });
  let featured: string | undefined;
  const candidates = [b.featured_image_url, files[0]].filter(Boolean) as string[];
  for (const w of candidates) { featured = await rehost(w); if (featured) break; }
  if (candidates.length && !featured) return R({ saved: false, errors: [`대표이미지를 가져오지 못함 — SVG/data URI/코드로 그린 이미지는 불가(jpg·png·webp·gif만). 이미지 생성 도구로 PNG를 만들어 openaiFileIdRefs로 보낼 것. 다른 URL로 바꿔치기 금지${why.length ? ` [원인: ${why.slice(0, 3).join(' | ')}]` : ''}`], warnings: v.warnings }, { status: 422 });
  const att = await saveAttachments(b.attachments || []);
  if (att.html) { const k = content.search(/<h2[^>]*>(?:(?!<\/h2>)[\s\S])*출처/i); content = k > 0 ? content.slice(0, k) + att.html + content.slice(k) : content + att.html; }
  if (featured) content = insertRepresentativeImageIntoContent(content, featured, b.title);
  else featured = content.match(/<img\b[^>]*\ssrc=["']([^"']+)["']/i)?.[1];

  const row = {
    user_id: process.env.OWNER_USER_ID, keyword: b.keyword, focus_keyword: b.keyword, title: b.title.trim(), meta_description: b.meta_description,
    content, representative_image_url: featured || null, ai_model: 'custom-gpt', status: 'draft',
    sources: v.stats.external_hosts.map(h => ({ type: 'gpt-source', title: h, link: `https://${h}` })),
    word_count: v.stats.text_chars, updated_at: new Date().toISOString(),
  };
  const q = createAdminClient().from('bossai_auto_articles');
  const { data, error } = await (b.article_id ? q.update(row).eq('id', b.article_id).select('id').single() : q.insert(row).select('id').single());
  if (error) return R({ saved: false, errors: [error.message] }, { status: 500 });
  return R({ saved: true, article_id: data.id, review_url: 'https://loov.co.kr/dashboard/auto-service', featured_image_url: featured, warnings: [...v.warnings, ...att.skipped.map(x => `첨부 제외 — ${x}`)], stats: v.stats });
}
