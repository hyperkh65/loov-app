import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// GET: 연결된 티스토리 블로그 목록
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data, error } = await supabase
    .from('tistory_connections')
    .select('id, blog_name, blog_url, display_name, is_active, last_tested_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST: 티스토리 블로그 추가
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { blog_name, blog_url, display_name, tssession } = await req.json() as {
    blog_name: string;
    blog_url: string;
    display_name?: string;
    tssession: string;
  };

  if (!blog_name || !tssession) {
    return NextResponse.json({ error: 'blog_name과 tssession 필요' }, { status: 400 });
  }

  const normalizedBlogName = blog_name.replace('.tistory.com', '').trim();
  const normalizedUrl = blog_url || `https://${normalizedBlogName}.tistory.com`;

  const { data, error } = await supabase
    .from('tistory_connections')
    .upsert({
      user_id: user.id,
      blog_name: normalizedBlogName,
      blog_url: normalizedUrl,
      display_name: display_name || normalizedBlogName,
      tssession,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,blog_name' })
    .select('id, blog_name, blog_url, display_name, is_active')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH: 쿠키 갱신 또는 활성화/비활성화
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { id, tssession, is_active, display_name } = await req.json() as {
    id: string;
    tssession?: string;
    is_active?: boolean;
    display_name?: string;
  };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (tssession !== undefined) update.tssession = tssession;
  if (is_active !== undefined) update.is_active = is_active;
  if (display_name !== undefined) update.display_name = display_name;

  const { error } = await supabase
    .from('tistory_connections')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: 블로그 연결 삭제
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { id } = await req.json() as { id: string };

  const { error } = await supabase
    .from('tistory_connections')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
