import { NextRequest, NextResponse } from 'next/server';
import { inboxAuthed } from '@/lib/shorts-youtube';
import { saveMonglePost, parseMonglePost } from '@/lib/mongle-posts';

// 딸깍이 몽글 카드의 붙여 넣을 문구를 따로(나중에) 등록할 때
export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  const b = await req.json().catch(() => ({})) as { id?: string; post?: unknown };
  const id = String(b.id || ''), p = parseMonglePost(JSON.stringify(b.post || {}));
  if (!/^hold_mongle_[\w-]+$/.test(id) || !p) return NextResponse.json({ error: '형식 오류' }, { status: 400 });
  saveMonglePost(id, p); return NextResponse.json({ ok: true });
}
