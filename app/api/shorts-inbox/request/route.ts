import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { addReq, takeReqs, ackReq, pendingReqs } from '@/lib/shorts-request';

// POST: 화면에서 "발행 대기로 보내기" — 맥(딸깍)에 영상 파일을 올려 달라고 요청한다
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (!id || !/^[0-9a-f]{12}_\d{1,2}$/.test(id)) return NextResponse.json({ error: '맥에서 만든 영상 카드만 보낼 수 있어요' }, { status: 400 });
  const { data: row } = await supabase.from('shorts_jobs').select('id, status').eq('user_id', user.id).eq('id', id).single();
  if (!row) return NextResponse.json({ error: '카드를 찾을 수 없어요' }, { status: 404 });
  if (row.status === 'uploaded') return NextResponse.json({ error: '이미 업로드된 영상이에요' }, { status: 400 });
  await addReq(id);
  return NextResponse.json({ ok: true });
}

// GET: 화면은 로그인으로 "요청 중인 카드"를, 맥은 토큰으로 처리할 요청을 가져간다
export async function GET(req: NextRequest) {
  if (inboxAuthed(req)) return NextResponse.json({ ids: await takeReqs() });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ids: await pendingReqs() });
}

// PUT: 맥이 처리 결과 보고 {id} — 요청을 목록에서 지운다
export async function PUT(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (id) await ackReq(id);
  return NextResponse.json({ ok: true });
}
