import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2 } from '@/lib/r2-storage';
import { createAdminClient } from '@/lib/supabase-server';
import { scrapeArticleFull } from '@/lib/rewrite-site-scraper';
import { rehostImages, searchStockImages, insertRepresentativeImageIntoContent, insertImagesIntoContent } from '@/lib/blog-content-generator';
import { authorized, safeUrl, research, GUIDE, RISK_NOTES, needsRiskNotes, validateDraft, normalizeHtml } from '@/lib/gpt-bridge';

export const maxDuration = 120;

const draftProps = {
  keyword: { type: 'string', description: '메인 키워드' },
  title: { type: 'string', description: '글 제목(20~32자)' },
  meta_description: { type: 'string', description: '메타 설명(100~160자)' },
  content_html: { type: 'string', description: '본문 HTML 조각(<h1>/<body> 없이). 표·링크·이미지(합계 3장 이상) 포함. 직접 만든 이미지는 <img src="{{file:2}}">처럼 openaiFileIdRefs 순번으로 넣는다' },
  featured_image_url: { type: 'string', description: '대표이미지 URL (직접 만든 이미지는 openaiFileIdRefs로)' },
  attachments: { type: 'array', description: '관련 양식/자료 파일(pdf,hwp,docx,xlsx 등). 올려도 되는지 직접 페이지를 열어 판단한 것만', items: { type: 'object', properties: { url: { type: 'string', description: '파일 직접 주소' }, name: { type: 'string' }, source_page_url: { type: 'string', description: '파일이 있던 페이지' }, permission_note: { type: 'string', description: '올려도 되는 근거 한 줄' } } } },
  openaiFileIdRefs: { type: 'array', description: '생성/첨부한 이미지 파일. 첫 번째가 대표이미지', items: { type: 'object', properties: { name: { type: 'string' }, id: { type: 'string' }, mime_type: { type: 'string' }, download_link: { type: 'string' } } } },
};
const post = (id: string, summary: string, properties: object, required: string[]) => ({
  post: { operationId: id, summary, 'x-openai-isConsequential': false, requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties, required } } } }, responses: { '200': { description: 'OK' } } },
});
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

const SPEC = {
  openapi: '3.1.0',
  info: { title: 'LOOV 블로그 작성 브리지', version: '1.0.0', description: '키워드 리서치, 형태 검사, 초안 저장' },
  servers: [{ url: 'https://loov.co.kr' }],
  paths: {
    '/api/gpt/guide': { get: { operationId: 'getWritingGuide', summary: '작성 지침 받기. 글 시작 전에 반드시 호출', 'x-openai-isConsequential': false, parameters: [{ name: 'keyword', in: 'query', required: false, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/api/gpt/research': post('researchKeyword', '연관·롱테일 키워드, 네이버 상위 글/블로그/뉴스/지식인 주소, 스톡 이미지 후보', { keyword: { type: 'string' }, image_query_en: { type: 'string', description: '스톡 이미지 후보가 필요할 때 영어 검색어' } }, ['keyword']),
    '/api/gpt/page': post('readPage', '웹페이지 본문 텍스트와 이미지 주소 읽기(직접 브라우징이 막힐 때 백업)', { url: { type: 'string' } }, ['url']),
    '/api/gpt/validate': post('validateDraft', '초안의 형태 검사. errors가 비어야 저장 가능', draftProps, ['title', 'content_html']),
    '/api/gpt/draft': post('saveDraft', '검사 통과한 글을 초안으로 저장(이미지 재호스팅 포함). article_id를 주면 그 초안을 수정', { ...draftProps, article_id: { type: 'string' } }, ['keyword', 'title', 'meta_description', 'content_html']),
  },
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action === 'openapi') return NextResponse.json(SPEC);
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (action === 'guide') {
    const kw = req.nextUrl.searchParams.get('keyword') || '';
    return NextResponse.json({ guide: GUIDE + (needsRiskNotes(kw) ? '\n\n' + RISK_NOTES : '') });
  }
  return NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!(await authorized(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  if (action === 'research') {
    if (!b.keyword) return NextResponse.json({ error: 'keyword 필요' }, { status: 400 });
    const [r, img] = await Promise.all([research(b.keyword), b.image_query_en ? searchStockImages(b.image_query_en, 6) : []]);
    return NextResponse.json({ ...r, stock_image_candidates: img, ...(needsRiskNotes(b.keyword) ? { risk_notes: RISK_NOTES } : {}) });
  }

  if (action === 'page') {
    if (!safeUrl(b.url || '')) return NextResponse.json({ error: '허용되지 않는 URL' }, { status: 400 });
    return NextResponse.json({ url: b.url, ...(await scrapeArticleFull(b.url)) });
  }

  const files: string[] = (b.openaiFileIdRefs || []).map((f: { download_link?: string }) => f.download_link).filter(Boolean);
  const v = validateDraft({ ...b, hasFileImages: files.length > 0, fileCount: files.length });
  if (action === 'validate') return NextResponse.json(v);
  if (action !== 'draft') return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!v.pass) return NextResponse.json({ saved: false, ...v }, { status: 422 });

  const rehost = async (u: string) => (safeUrl(u) ? (await rehostImages([u]))[0] : undefined);
  const r2 = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  const usedFiles = new Set([...b.content_html.matchAll(/\{\{file:(\d+)\}\}/g)].map(m => Number(m[1])));
  let content = normalizeHtml(b.content_html.replace(/\{\{file:(\d+)\}\}/g, (_: string, n: string) => files[Number(n) - 1] || ''));
  for (const tag of new Set(content.match(/<img\b[^>]*>/gi) || [])) {
    const u = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1];
    if (!u) { content = content.split(tag).join(''); continue; }
    if (r2 && u.startsWith(r2)) continue;
    const re = await rehost(u);
    content = content.split(tag).join(re ? tag.replace(u, re) : '');
  }
  const extra = (await Promise.all(files.map((f, i) => (usedFiles.has(i + 1) || (i === 0 && !b.featured_image_url) ? undefined : rehost(f))))).filter((u): u is string => !!u);
  if (extra.length) content = insertImagesIntoContent(content, extra, b.keyword);
  const wanted = b.featured_image_url || files[0];
  let featured = wanted ? await rehost(wanted) : undefined;
  if (wanted && !featured) return NextResponse.json({ saved: false, errors: ['대표이미지를 가져오지 못함 — SVG/data URI/코드로 그린 이미지는 불가(jpg·png·webp·gif만). 이미지 생성 도구로 PNG를 만들어 openaiFileIdRefs로 보낼 것. 다른 URL로 바꿔치기 금지'], warnings: v.warnings }, { status: 422 });
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
  if (error) return NextResponse.json({ saved: false, errors: [error.message] }, { status: 500 });
  return NextResponse.json({ saved: true, article_id: data.id, review_url: 'https://loov.co.kr/dashboard/auto-service', featured_image_url: featured, warnings: [...v.warnings, ...att.skipped.map(x => `첨부 제외 — ${x}`)], stats: v.stats });
}
