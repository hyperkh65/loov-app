import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { videoDb } from '@/lib/video-db';

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  const q = videoDb().from('bossai_video_jobs').select('*').eq('user_id', user.id);
  if (id) return NextResponse.json((await q.eq('id', id).maybeSingle()).data);
  const { data } = await q.eq('kind', 'download').order('created_at', { ascending: false }).limit(100);
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const { urls, q, sites } = await req.json() as { urls?: string[]; q?: string; sites?: string[] };
  if (q?.trim()) {
    const ok = (sites || []).filter(s => ['youtube', 'bilibili'].includes(s));
    const { data, error } = await videoDb().from('bossai_video_jobs')
      .insert({ user_id: user.id, kind: 'search', input: JSON.stringify({ q: q.trim().slice(0, 100), sites: ok.length ? ok : ['youtube', 'bilibili'], limit: 12 }) })
      .select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  }
  const list = [...new Set((urls || []).map(u => u.trim()).filter(u => /^https?:\/\//i.test(u)))].slice(0, 30);
  if (!list.length) return NextResponse.json({ error: 'http(s) URL이 없음' }, { status: 400 });
  const { error } = await videoDb().from('bossai_video_jobs')
    .insert(list.map(input => ({ user_id: user.id, kind: 'download', input })));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ queued: list.length });
}

export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const { id } = await req.json() as { id: string };
  await videoDb().from('bossai_video_jobs').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
