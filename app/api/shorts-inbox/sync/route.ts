import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { inboxAuthed } from '@/lib/shorts-youtube';

export const maxDuration = 60;

// 딸깍이 주기적으로 보내는 영상 현황(만든 것/예약/업로드/실패). id 기준 upsert.
const STATUS = ['created', 'scheduled', 'uploading', 'uploaded', 'failed'];
export async function POST(req: NextRequest) {
  if (!inboxAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  let q = admin.from('sns_connections').select('user_id').eq('platform', 'youtube').eq('is_active', true).order('updated_at', { ascending: false }).limit(1);
  if (process.env.OWNER_USER_ID) q = q.eq('user_id', process.env.OWNER_USER_ID);
  const { data: conn } = await q.maybeSingle();
  const user_id = process.env.OWNER_USER_ID || conn?.user_id;
  if (!user_id) return NextResponse.json({ error: 'LOOV 사용자를 찾을 수 없어요' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const s = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));
  const iso = (v: unknown) => (v && !isNaN(Number(v)) ? new Date(Number(v)).toISOString() : null);
  const rows = (Array.isArray(body.jobs) ? body.jobs : []).slice(0, 100).filter((j: { id?: string; status?: string }) => j && j.id && STATUS.includes(String(j.status))).map((j: Record<string, unknown>) => ({
    id: String(j.id).slice(0, 80), user_id, title: s(j.title, 200), phrase: s(j.phrase, 80), description: s(j.description, 5000), status: j.status,
    scheduled_at: iso(j.scheduled_at), uploaded_at: iso(j.uploaded_at), video_url: s(j.video_url, 300), error: s(j.error, 300),
    ...(j.thumb ? { thumb: s(j.thumb, 40000) } : {}), created_at: iso(j.created_at) || new Date().toISOString(), updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return NextResponse.json({ ok: true, n: 0 });
  const { error } = await admin.from('shorts_jobs').upsert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, n: rows.length });
}
