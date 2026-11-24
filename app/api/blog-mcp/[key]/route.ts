/**
 * LOOV 블로그 작가 — ChatGPT 플러그인(MCP 커넥터)용 서버 (Streamable HTTP, 상태 없음).
 * 기존 GPT 액션과 같은 로직(lib/gpt-actions)을 쓴다. 커스텀 GPT는 2026-12-11에 종료되어 플러그인으로 옮긴다.
 * 이미지: 도구가 `_meta["openai/fileParams"]`로 image_1..image_6을 선언하면 ChatGPT가 { download_url, file_id }를 넘긴다.
 *   image_1 = 대표이미지, 본문의 {{file:N}} = image_N. 파일이 비거나 문자열로 오는 경우(알려진 간헐 문제)는 다시 만들어 호출하도록 안내한다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { blogMcpKey, GUIDE, RISK_NOTES, needsRiskNotes } from '@/lib/gpt-bridge';
import { runGptAction } from '@/lib/gpt-actions';
import { TOP10_GUIDE, validateTop10 } from '@/lib/top10-guide';
import { addItem as addTop10 } from '@/lib/top10-inbox';

export const maxDuration = 120;

const NAMES = ['image_1', 'image_2', 'image_3', 'image_4', 'image_5', 'image_6'];
const fileSchema = { type: 'object', description: 'ChatGPT가 만든/첨부한 이미지 파일', properties: { download_url: { type: 'string' }, file_id: { type: 'string' }, mime_type: { type: 'string' }, file_name: { type: 'string' } }, required: ['download_url', 'file_id'] };
const fileProps = Object.fromEntries(NAMES.map((n, i) => [n, { ...fileSchema, description: i === 0 ? '대표이미지 파일(필수). ' + fileSchema.description : `(선택) 본문 이미지 ${i}번 파일 — 소스 이미지 URL로 대신해도 됨. 본문에는 <img src="{{file:${i + 1}}}">로 넣는다. ${fileSchema.description}` }]));
const draftProps = {
  keyword: { type: 'string', description: '메인 키워드' },
  title: { type: 'string', description: '글 제목(24~40자, 롱테일 키워드 + 구체적 상황 + 숫자 + 궁금증 포인트, 막연한 제목 저장 거부)' },
  meta_description: { type: 'string', description: '메타 설명(100~160자)' },
  content_html: { type: 'string', description: '본문 HTML 조각(<h1>/<body> 없이). 표·링크·이미지(합계 3장 이상) 포함. 직접 만든 이미지는 <img src="{{file:2}}">처럼 image_N 순번으로 넣는다(image_1=대표이미지는 본문에 따로 쓰지 않는다). 직접 그린 이미지는 1장(image_1)만 있어도 되고, 나머지는 열어 확인한 기사·영상·공식 사이트의 관련 사진을 <img src="https://…" alt="…">로 넣어 합계 3장을 채워도 된다' },
  featured_image_url: { type: 'string', description: '대표이미지 URL (직접 만든 이미지는 image_1 파일로)' },
  attachments: { type: 'array', description: '관련 양식/자료 파일(pdf,hwp,docx,xlsx 등). 올려도 되는지 직접 페이지를 열어 판단한 것만', items: { type: 'object', properties: { url: { type: 'string', description: '파일 직접 주소' }, name: { type: 'string' }, source_page_url: { type: 'string', description: '파일이 있던 페이지 주소' }, permission_note: { type: 'string', description: '올려도 되는 근거(10자 이상)' } } } },
  ...fileProps,
};
const FILE_META = { 'openai/fileParams': NAMES };

const TOOLS = [
  { name: 'getWritingGuide', description: '작성 지침 받기. 글 시작 전에 반드시 호출한다. 이 플러그인에서는 이미지를 openaiFileIdRefs 대신 image_1(대표), image_2… 파라미터에 순서대로 넣고, 본문의 {{file:N}}은 image_N을 뜻한다.', inputSchema: { type: 'object', properties: { keyword: { type: 'string' } } }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'researchKeyword', description: '연관·롱테일 키워드와 월간 검색량·경쟁도, 네이버 상위 글/블로그/뉴스/지식인 주소, 스톡 이미지 후보', inputSchema: { type: 'object', required: ['keyword'], properties: { keyword: { type: 'string' }, image_query_en: { type: 'string', description: '스톡 이미지 후보가 필요할 때 영어 검색어' } } }, annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'readPage', description: '웹페이지 본문 텍스트와 이미지 주소 읽기(직접 브라우징이 막힐 때 백업)', inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } }, annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'validateDraft', description: '초안의 형태 검사. errors가 비어야 저장 가능. 이미지는 image_1.. 파일로 함께 보낸다.', inputSchema: { type: 'object', required: ['title', 'content_html'], properties: draftProps }, _meta: FILE_META, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'saveDraft', description: '검사 통과한 글을 초안으로 저장(이미지 재호스팅 포함). article_id를 주면 그 초안을 수정. 이미지 오류로 실패하면 이미지를 새로 생성한 직후 다시 호출한다.', inputSchema: { type: 'object', required: ['keyword', 'title', 'meta_description', 'content_html'], properties: { ...draftProps, article_id: { type: 'string' } } }, _meta: FILE_META, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'getTop10Guide', description: 'TOP10 인포그래픽(딸깍 영상) 작성 지침과 JSON 형식. TOP10을 만들기 전에 반드시 호출한다.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'sendTop10ToDdalkak', description: '출처 2곳 이상으로 검증이 끝난 TOP10 JSON을 딸깍(맥) 영상 제작 대기열로 보낸다. getTop10Guide의 형식 그대로 data에 넣고, 한 JSON당 한 번만 호출한다. errors가 오면 고쳐서 다시 호출한다.', inputSchema: { type: 'object', required: ['data'], properties: { data: { type: 'object', description: 'TOP10 JSON (title, rows 10개, source, sources 등)', additionalProperties: true } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];

const ok =  (id: unknown, result: unknown) => NextResponse.json({ jsonrpc: '2.0', id, result });
const err = (id: unknown, code: number, message: string) => NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } });
const keyOk = (k: string) => { const w = blogMcpKey(); return !!w && k.length === w.length && timingSafeEqual(Buffer.from(k), Buffer.from(w)); };
const text = (id: unknown, t: string, isError = false) => ok(id, { content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });
const MAP_NOTE = '\n\n## 이 플러그인에서의 이미지 규칙\n- 이미지 파일은 openaiFileIdRefs 대신 도구의 image_1(대표), image_2, image_3… 파라미터에 순서대로 넣는다(빈 번호 없이 이어서).\n- 본문 <img src="{{file:N}}">의 N은 image_N이다.';

// 파일 파라미터 → 기존 로직이 쓰는 openaiFileIdRefs로 변환. 비거나 문자열로 온 것은 따로 모은다.
function toRefs(a: Record<string, unknown>) {
  const refs: Array<{ name: string; id: string; mime_type?: string; download_link: string }> = [], bad: string[] = [];
  for (const n of NAMES) {
    const v = a[n]; if (v === undefined || v === null || v === '') continue;
    const o = v as { download_url?: string; file_id?: string; mime_type?: string; file_name?: string };
    if (o && typeof o === 'object' && typeof o.download_url === 'string' && o.download_url.startsWith('http')) refs.push({ name: o.file_name || n, id: o.file_id || n, mime_type: o.mime_type, download_link: o.download_url });
    else bad.push(n);
  }
  return { refs, bad };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!keyOk((await params).key)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const m = await req.json().catch(() => null) as { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string } } | null;
  if (!m || !m.method) return err(null, -32700, 'parse error');
  if (m.id === undefined) return new NextResponse(null, { status: 202 }); // 알림(notifications/*)
  switch (m.method) {
    case 'initialize': return ok(m.id, { protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'loov-blog-writer', version: '1.0.0' } });
    case 'ping': return ok(m.id, {});
    case 'tools/list': return ok(m.id, { tools: TOOLS });
    case 'tools/call': {
      const name = m.params?.name || '', a = m.params?.arguments || {};
      if (!TOOLS.some(t => t.name === name)) return err(m.id, -32602, 'unknown tool');
      try {
        if (name === 'getTop10Guide') return text(m.id, TOP10_GUIDE);
        if (name === 'sendTop10ToDdalkak') {
          let d: unknown = (a as { data?: unknown }).data;
          if (typeof d === 'string') { try { d = JSON.parse(d.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { d = null; } }
          if (!d || typeof d !== 'object') return text(m.id, JSON.stringify({ sent: false, errors: ['data에 TOP10 JSON 객체가 필요해요'] }), true);
          const v = validateTop10(d as Record<string, unknown>);
          if (v.errors.length) return text(m.id, JSON.stringify({ sent: false, errors: v.errors, warnings: v.warnings }), true);
          if (JSON.stringify(d).length > 60_000) return text(m.id, JSON.stringify({ sent: false, errors: ['JSON이 너무 커요'] }), true);
          const r = await addTop10(d as Record<string, unknown>);
          return text(m.id, JSON.stringify({ sent: true, id: r.id, duplicate: r.dup, warnings: v.warnings, message: r.dup ? '이미 받은 JSON이에요' : '딸깍으로 전달했어요. 영상이 만들어지면 LOOV 발행 대기에 올라가요.' }));
        }
        if (name === 'getWritingGuide') return text(m.id, GUIDE + (needsRiskNotes(String(a.keyword || '')) ? '\n\n' + RISK_NOTES : '') + MAP_NOTE);
        const action = ({ researchKeyword: 'research', readPage: 'page', validateDraft: 'validate', saveDraft: 'draft' } as Record<string, string>)[name];
        const body: Record<string, unknown> = { ...a };
        if (name === 'validateDraft' || name === 'saveDraft') {
          const { refs, bad } = toRefs(a);
          for (const n of NAMES) delete body[n];
          if (bad.length) return text(m.id, JSON.stringify({ saved: false, errors: [`이미지 ${bad.join(', ')}을(를) 파일로 받지 못했어요(빈 값이거나 경로 문자열로 전달됨). 이전 파일은 쓰지 말고, 이미지를 새로 생성한 직후 그 결과를 image_N 파일 파라미터에 담아 다시 호출하세요.`] }), true);
          body.openaiFileIdRefs = refs;
        }
        const r = await runGptAction(action, body);
        return text(m.id, JSON.stringify(r.body), r.status >= 400);
      } catch (e) { return text(m.id, '처리 중 오류: ' + (e as Error).message.slice(0, 200), true); }
    }
    default: return err(m.id, -32601, 'method not found');
  }
}

export function GET() { return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } }); }
