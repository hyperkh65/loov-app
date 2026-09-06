/**
 * GET    /api/rewrite/sites        소스 사이트 목록
 * POST   /api/rewrite/sites        소스 사이트 등록 (feed_url 없으면 자동 감지)
 * PATCH  /api/rewrite/sites        수정 (id 필요)
 * DELETE /api/rewrite/sites?id=    삭제
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase-server';
import { discoverFeedUrl } from '@/lib/rewrite-site-scraper';

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return err('인증 필요', 401);

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('bossai_rewrite_sources')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return err(error.message, 500);
  return NextResponse.json({ ok: true, data: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return err('인증 필요', 401);

  const body = await req.json().catch(() => ({}));
  const { name, site_url } = body as { name?: string; site_url?: string };
  if (!name || !site_url) return err('name, site_url 필요');

  const feedUrl = await discoverFeedUrl(site_url);
  if (!feedUrl) return err('RSS/Atom 피드를 찾지 못했습니다. 사이트에 피드가 있는지 확인해주세요.');

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('bossai_rewrite_sources')
    .insert({ user_id: user.id, name, site_url, feed_url: feedUrl, is_active: true })
    .select()
    .single();

  if (error) return err(error.message, 500);
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return err('인증 필요', 401);

  const { id, ...fields } = await req.json().catch(() => ({})) as { id?: string; [k: string]: unknown };
  if (!id) return err('id 필요');

  const allowed = ['name', 'site_url', 'feed_url', 'is_active'];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in fields) updates[k] = fields[k];

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('bossai_rewrite_sources')
    .update(updates)
    .eq('id', id).eq('user_id', user.id)
    .select().single();

  if (error) return err(error.message, 500);
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return err('인증 필요', 401);

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('id 필요');

  const admin = await createAdminClient();
  await admin.from('bossai_rewrite_sources').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
