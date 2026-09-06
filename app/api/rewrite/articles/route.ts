/**
 * GET  /api/rewrite/articles?status=&account=&limit=
 * POST /api/rewrite/articles          수동 기사 추가
 * PATCH /api/rewrite/articles         기사 수정 (id 필요)
 * DELETE /api/rewrite/articles?id=    기사 삭제
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createClient } from '@/lib/supabase-server';

const OWNER_ID = () => process.env.OWNER_USER_ID!;

function authCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.BOT_SECRET;
  return !!(secret && req.headers.get('authorization') === `Bearer ${secret}`);
}

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: NextRequest) {
  // 일반 유저 인증 또는 CRON 인증
  const isCron = authCron(req);
  let userId: string;

  if (isCron) {
    userId = OWNER_ID();
  } else {
    const supabaseUser = await createClient();
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return err('인증 필요', 401);
    userId = user.id;
  }

  const supabase = await createAdminClient();
  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status') || undefined;
  const account = searchParams.get('account') || undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  let q = supabase
    .from('bossai_rewrite_articles')
    .select('id,notion_page_id,title,source_url,source_account,source_id,representative_image_url,rewritten_title,rewritten_content,rewritten_meta,status,ai_model,word_count,error_message,created_at,updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);
  if (account) q = q.eq('source_account', account);

  const { data, error } = await q;
  if (error) return err(error.message);

  // source_account 목록도 함께 반환
  const { data: accounts } = await supabase
    .from('bossai_rewrite_articles')
    .select('source_account')
    .eq('user_id', userId)
    .not('source_account', 'eq', '');

  const uniqueAccounts = [...new Set((accounts || []).map((a) => a.source_account))].filter(Boolean);

  return NextResponse.json({ ok: true, data, accounts: uniqueAccounts });
}

export async function POST(req: NextRequest) {
  const isCron = authCron(req);
  let userId: string;

  if (isCron) {
    userId = OWNER_ID();
  } else {
    const supabaseUser = await createClient();
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return err('인증 필요', 401);
    userId = user.id;
  }

  const body = await req.json().catch(() => ({}));
  const { title, source_url, source_account, original_content } = body as {
    title: string; source_url?: string; source_account?: string; original_content?: string;
  };

  if (!title) return err('title 필요');

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('bossai_rewrite_articles')
    .insert({
      user_id: userId,
      title,
      source_url: source_url || '',
      source_account: source_account || '',
      original_content: original_content || '',
      status: 'pending',
    })
    .select()
    .single();

  if (error) return err(error.message);
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const isCron = authCron(req);
  let userId: string;

  if (isCron) {
    userId = OWNER_ID();
  } else {
    const supabaseUser = await createClient();
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return err('인증 필요', 401);
    userId = user.id;
  }

  const body = await req.json().catch(() => ({}));
  const { id, ...updates } = body as { id: string; [k: string]: unknown };
  if (!id) return err('id 필요');

  // 허용 필드만
  const allowed = ['title', 'source_url', 'source_account', 'original_content', 'rewritten_title', 'rewritten_meta', 'rewritten_content', 'status', 'ai_model', 'representative_image_url'];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in updates) patch[key] = updates[key];
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('bossai_rewrite_articles')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return err(error.message);
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return err('인증 필요', 401);

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('id 필요');

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('bossai_rewrite_articles')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return err(error.message);
  return NextResponse.json({ ok: true });
}
