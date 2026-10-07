import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';

const KEYS = ['NAVER_ECON_BLOG_ID', 'NAVER_ECON_NID_AUT', 'NAVER_ECON_NID_SES'] as const;

async function auth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function readSettings() {
  const { data } = await createAdminClient().from('app_settings').select('settings').eq('id', 1).single();
  return (data?.settings as Record<string, string>) || {};
}

async function setSchedule(userId: string, active: boolean) {
  const patch: Record<string, unknown> = { is_active: active };
  if (active) patch.next_run_at = new Date().toISOString();
  await createAdminClient().from('bossai_schedules').update(patch).eq('user_id', userId).eq('type', 'naver_econ_auto');
}

export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const s = await readSettings();
  const { data: sch } = await createAdminClient().from('bossai_schedules').select('is_active, next_run_at').eq('user_id', user.id).eq('type', 'naver_econ_auto').maybeSingle();
  return NextResponse.json({
    connected: !!(s.NAVER_ECON_BLOG_ID && s.NAVER_ECON_NID_AUT && s.NAVER_ECON_NID_SES),
    blog_id: s.NAVER_ECON_BLOG_ID || '',
    active: !!sch?.is_active,
    next_run: sch?.next_run_at || null,
  });
}

export async function POST(req: NextRequest) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const { blog_id, nid_aut, nid_ses, active } = await req.json();
  const cur = await readSettings();
  if (blog_id || nid_aut || nid_ses) {
    if (!blog_id?.trim() || !nid_aut?.trim() || !nid_ses?.trim()) return NextResponse.json({ error: '블로그 ID, NID_AUT, NID_SES 모두 필요' }, { status: 400 });
    cur.NAVER_ECON_BLOG_ID = blog_id.trim().toLowerCase();
    cur.NAVER_ECON_NID_AUT = nid_aut.trim();
    cur.NAVER_ECON_NID_SES = nid_ses.trim();
    const { error } = await createAdminClient().from('app_settings').update({ settings: cur }).eq('id', 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (typeof active === 'boolean') await setSchedule(user.id, active && !!cur.NAVER_ECON_NID_SES);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });
  const cur = await readSettings();
  for (const k of KEYS) delete cur[k];
  await createAdminClient().from('app_settings').update({ settings: cur }).eq('id', 1);
  await setSchedule(user.id, false);
  return NextResponse.json({ ok: true });
}
