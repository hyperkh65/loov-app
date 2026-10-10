import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSetting } from '@/lib/get-setting';
import { GET as gptGet, POST as gptPost } from '@/app/api/gpt/[action]/route';

export const maxDuration = 120;

const str = (description: string) => ({ type: 'string', description });
const draft = {
  keyword: str('메인 키워드'),
  title: str('글 제목'),
  meta_description: str('메타 설명(100~160자)'),
  content_html: str('본문 HTML 조각(<h1>/<body> 없이). 표·링크·이미지 포함. 이미지는 <img src="https://..."> 공개 주소로'),
  featured_image_url: str('대표이미지 공개 URL'),
  attachments: { type: 'array', description: '관련 양식/자료 파일. 올려도 되는지 직접 페이지를 열어 판단한 것만', items: { type: 'object', properties: { url: str('파일 직접 주소'), name: str('파일 이름'), source_page_url: str('파일이 있던 페이지'), permission_note: str('올려도 되는 근거 한 줄') } } },
};
const TOOLS = [
  { name: 'getWritingGuide', action: 'guide', description: '작성 지침 받기. 글 시작 전에 반드시 호출', readOnly: true, props: { keyword: str('주제 키워드') }, required: [] as string[] },
  { name: 'researchKeyword', action: 'research', description: '연관·롱테일 키워드, 네이버 상위 글/블로그/뉴스/지식인 주소, 스톡 이미지 후보', readOnly: true, props: { keyword: str('키워드'), image_query_en: str('스톡 이미지 후보용 영어 검색어') }, required: ['keyword'] },
  { name: 'readPage', action: 'page', description: '웹페이지 본문 텍스트와 이미지 주소 읽기', readOnly: true, props: { url: str('주소') }, required: ['url'] },
  { name: 'validateDraft', action: 'validate', description: '초안의 형태 검사. errors가 비어야 저장 가능', readOnly: true, props: draft, required: ['title', 'content_html'] },
  { name: 'saveDraft', action: 'draft', description: '검사 통과한 글을 초안으로 저장(이미지 재호스팅 포함). article_id를 주면 그 초안을 수정', readOnly: false, props: { ...draft, article_id: str('수정할 초안 id') }, required: ['keyword', 'title', 'meta_description', 'content_html'] },
];

async function callTool(name: string, args: Record<string, unknown>, key: string) {
  const t = TOOLS.find(x => x.name === name);
  if (!t) throw new Error(`unknown tool: ${name}`);
  const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const ctx = { params: Promise.resolve({ action: t.action }) };
  const url = `https://loov.co.kr/api/gpt/${t.action}`;
  if (t.action === 'guide') return (await gptGet(new NextRequest(`${url}?keyword=${encodeURIComponent(String(args.keyword || ''))}`, { headers }), ctx)).json();
  return (await gptPost(new NextRequest(url, { method: 'POST', headers, body: JSON.stringify(args) }), ctx)).json();
}

async function handle(msg: { id?: number | string; method?: string; params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string } }, key: string) {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result });
  switch (msg.method) {
    case 'initialize': return ok({ protocolVersion: msg.params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'loov-blog', version: '1.0.0' } });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: { type: 'object', properties: t.props, required: t.required }, annotations: { readOnlyHint: t.readOnly, openWorldHint: true } })) });
    case 'tools/call':
      try {
        const out = await callTool(msg.params?.name || '', msg.params?.arguments || {}, key);
        return ok({ content: [{ type: 'text', text: JSON.stringify(out) }] });
      } catch (e) { return ok({ isError: true, content: [{ type: 'text', text: (e as Error).message }] }); }
    default:
      return msg.id === undefined ? null : { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } };
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const key = (await getSetting('GPT_ACTION_KEY')) || '';
  if (!key || token.length !== key.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(key))) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, { status: 400 });
  const out = Array.isArray(body) ? (await Promise.all(body.map(m => handle(m, key)))).filter(Boolean) : await handle(body, key);
  if (!out || (Array.isArray(out) && !out.length)) return new NextResponse(null, { status: 202 });
  return NextResponse.json(out);
}

export const GET = () => new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
