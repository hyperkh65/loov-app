import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { actionKey, addItem } from '@/lib/top10-inbox';

// ChatGPT 플러그인(MCP 커넥터)용 최소 MCP 서버(Streamable HTTP, 상태 없음). 플러그인 커넥터는 헤더 키를 못 넣어서 URL 경로에 키를 둔다.
const TOOL = {
  name: 'send_top10_to_ddalkak',
  description: '검증이 끝난 TOP10 JSON을 딸깍 영상 제작 대기열로 보낸다. 답변의 ⑤ JSON과 똑같은 객체를 data에 넣는다. 한 JSON당 한 번만 호출한다.',
  inputSchema: { type: 'object', required: ['data'], properties: { data: { type: 'object', description: 'TOP10 JSON (title, rows 등)', additionalProperties: true } } },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

const ok = (id: unknown, result: unknown) => NextResponse.json({ jsonrpc: '2.0', id, result });
const err = (id: unknown, code: number, message: string) => NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } });

function keyOk(k: string) {
  const want = actionKey();
  return !!want && k.length === want.length && timingSafeEqual(Buffer.from(k), Buffer.from(want));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!keyOk((await params).key)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const m = await req.json().catch(() => null) as { id?: unknown; method?: string; params?: { name?: string; arguments?: { data?: Record<string, unknown> }; protocolVersion?: string } } | null;
  if (!m || !m.method) return err(null, -32700, 'parse error');
  if (m.id === undefined) return new NextResponse(null, { status: 202 }); // 알림(notifications/*)
  switch (m.method) {
    case 'initialize':
      return ok(m.id, { protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: '2days-top10-ddalkak', version: '1.0.0' } });
    case 'ping': return ok(m.id, {});
    case 'tools/list': return ok(m.id, { tools: [TOOL] });
    case 'tools/call': {
      if (m.params?.name !== TOOL.name) return err(m.id, -32602, 'unknown tool');
      const d = m.params?.arguments?.data;
      const bad = (t: string) => ok(m.id, { isError: true, content: [{ type: 'text', text: t }] });
      if (!d || typeof d.title !== 'string' || !Array.isArray(d.rows) || d.rows.length < 2) return bad('title과 rows(2개 이상)가 있는 TOP10 JSON이 필요해요');
      if (JSON.stringify(d).length > 60_000) return bad('JSON이 너무 커요');
      const r = await addItem(d);
      return ok(m.id, { content: [{ type: 'text', text: r.dup ? '이미 받은 JSON이에요' : '딸깍으로 전달했어요. 영상이 만들어지면 LOOV 발행 대기에 올라가요.' }] });
    }
    default: return err(m.id, -32601, 'method not found');
  }
}

export function GET() { return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } }); }
