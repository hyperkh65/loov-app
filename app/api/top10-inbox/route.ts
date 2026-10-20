import { NextRequest, NextResponse } from 'next/server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { actionAuthed, addItem, takePending, ack } from '@/lib/top10-inbox';

// POST: Custom GPT Action이 검증 끝난 TOP10 JSON을 보낸다 (Bearer = GPT Action 키)
export async function POST(req: NextRequest) {
  if (!actionAuthed(req.headers.get('authorization'))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  const d = (b && typeof b.data === 'object' && b.data ? b.data : b) as Record<string, unknown> | null;
  if (!d || typeof d.title !== 'string' || !Array.isArray(d.rows) || d.rows.length < 2) return NextResponse.json({ error: 'title과 rows(2개 이상)가 있는 TOP10 JSON이 필요해요' }, { status: 400 });
  if (JSON.stringify(d).length > 60_000) return NextResponse.json({ error: 'JSON이 너무 커요' }, { status: 413 });
  const r = await addItem(d);
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
