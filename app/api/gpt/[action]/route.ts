import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { scrapeArticleFull } from '@/lib/rewrite-site-scraper';
import { rehostImages, searchStockImages, insertRepresentativeImageIntoContent } from '@/lib/blog-content-generator';
import { authorized, safeUrl, research, GUIDE, RISK_NOTES, needsRiskNotes, validateDraft, normalizeHtml } from '@/lib/gpt-bridge';

export const maxDuration = 120;

const draftProps = {
  keyword: { type: 'string', description: '메인 키워드' },
  title: { type: 'string', description: '글 제목(20~32자)' },
  meta_description: { type: 'string', description: '메타 설명(100~160자)' },
  content_html: { type: 'string', description: '본문 HTML 조각(<h1>/<body> 없이). 표·링크·이미지 포함' },
  featured_image_url: { type: 'string', description: '대표이미지 URL (직접 만든 이미지는 openaiFileIdRefs로)' },
  openaiFileIdRefs: { type: 'array', description: '생성/첨부한 이미지 파일. 첫 번째가 대표이미지', items: { type: 'object', properties: { name: { type: 'string' }, id: { type: 'string' }, mime_type: { type: 'string' }, download_link: { type: 'string' } } } },
};
const post = (id: string, summary: string, properties: object, required: string[]) => ({
  post: { operationId: id, summary, 'x-openai-isConsequential': false, requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties, required } } } }, responses: { '200': { description: 'OK' } } },
});
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
  const v = validateDraft({ ...b, hasFileImages: files.length > 0 });
  if (action === 'validate') return NextResponse.json(v);
  if (action !== 'draft') return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!v.pass) return NextResponse.json({ saved: false, ...v }, { status: 422 });

  const rehost = async (u: string) => (safeUrl(u) ? (await rehostImages([u]))[0] : undefined);
  const r2 = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  let content = normalizeHtml(b.content_html);
  for (const tag of new Set(content.match(/<img\b[^>]*>/gi) || [])) {
    const u = tag.match(/\ssrc=["']([^"']+)["']/i)?.[1];
    if (!u || (r2 && u.startsWith(r2))) continue;
    const re = await rehost(u);
    content = content.split(tag).join(re ? tag.replace(u, re) : '');
  }
  const wanted = b.featured_image_url || files[0];
  let featured = wanted ? await rehost(wanted) : undefined;
  if (wanted && !featured) return NextResponse.json({ saved: false, errors: ['대표이미지를 가져오지 못함 — 다른 이미지 URL/파일로 다시 시도'], warnings: v.warnings }, { status: 422 });
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
  return NextResponse.json({ saved: true, article_id: data.id, review_url: 'https://loov.co.kr/dashboard/auto-service', featured_image_url: featured, warnings: v.warnings, stats: v.stats });
}
