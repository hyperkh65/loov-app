import { NextRequest, NextResponse } from 'next/server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { actionAuthed, addItem, takePending, ack } from '@/lib/top10-inbox';

// POST: Custom GPT Action이 검증 끝난 TOP10 JSON을 보낸다 (Bearer = GPT Action 키)
export async function POST(req: NextRequest) {
  if (!actionAuthed(req.headers.get('authorization'))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  // GPT Action은 data를 객체·JSON 문자열·평평한 본문 중 어느 모양으로든 보낼 수 있다
  let d: unknown = b && b.data !== undefined ? b.data : b;
  if (typeof d === 'string') { const t = d.replace(/^```(?:json)?\s*|\s*```$/g, ''); try { d = JSON.parse(t); } catch { d = null; } }
  if (d && typeof d === 'object' && typeof (d as Record<string, unknown>).json === 'string') { try { d = JSON.parse((d as Record<string, string>).json); } catch {} }
  const dd = d as Record<string, unknown> | null;
  if (!dd || typeof dd.title !== 'string' || !Array.isArray(dd.rows)) console.error('[top10-inbox] 형식 오류', JSON.stringify(b).slice(0, 300));
  if (!dd || typeof dd.title !== 'string' || !Array.isArray(dd.rows) || dd.rows.length < 2) return NextResponse.json({ error: 'title과 rows(2개 이상)가 있는 TOP10 JSON이 필요해요' }, { status: 400 });
  if (JSON.stringify(dd).length > 60_000) return NextResponse.json({ error: 'JSON이 너무 커요' }, { status: 413 });
  const r = await addItem(dd);
  return NextResponse.json({ ok: true, id: r.id, duplicate: r.dup, message: r.dup ? '이미 받은 JSON이에요' : '딸깍으로 전달했어요. 영상이 만들어지면 LOOV 발행 대기에 올라가요.' });
}

// GET: 맥(딸깍)이 주기적으로 가져간다 / DELETE ?id=: 영상 제작을 시작한 뒤 확인
export async function GET(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ items: await takePending() });
}
export async function DELETE(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (id) await ack(id);
  return NextResponse.json({ ok: true });
}
