import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  // 새 컬럼 포함해서 시도, 없으면 기본 컬럼만
  let data: Record<string, unknown> | null = null;
  const { data: fullData, error: fullError } = await supabase
    .from('naver_connections')
    .select('blog_id, blog_name, nid_aut, nid_ses, categories, last_tested_at, access_token, token_expires_at, upload_session_key, naver_user_id')
    .eq('user_id', user.id)
    .single();

  if (fullError && fullError.message?.includes('column')) {
    // 마이그레이션 전: 기본 컬럼만
    const { data: baseData } = await supabase
      .from('naver_connections')
      .select('blog_id, blog_name, nid_aut, nid_ses, categories, last_tested_at, access_token, token_expires_at')
      .eq('user_id', user.id)
      .single();
    data = baseData as Record<string, unknown> | null;
  } else {
    data = fullData as Record<string, unknown> | null;
  }

  if (!data) return NextResponse.json(null);

  const oauthConnected = !!(data.access_token && data.token_expires_at &&
    new Date(data.token_expires_at as string) > new Date());

  const { access_token: _, token_expires_at, upload_session_key, naver_user_id, ...safe } = data as {
    access_token?: string; token_expires_at?: string;
    upload_session_key?: string; naver_user_id?: string;
    [key: string]: unknown;
  };
  return NextResponse.json({
    ...safe,
    oauth_connected: oauthConnected,
    token_expires_at,
    has_upload_session: !!(upload_session_key),
    naver_user_id: naver_user_id || '',
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json();
  const { blog_id, blog_name, nid_aut, nid_ses, upload_session_key, naver_user_id } = body;

  // upload_session_key만 업데이트하는 경우
  if (upload_session_key !== undefined || naver_user_id !== undefined) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (upload_session_key !== undefined) patch.upload_session_key = upload_session_key?.trim() || null;
    if (naver_user_id !== undefined) patch.naver_user_id = naver_user_id?.trim() || null;
    const { data: patchData, error: patchErr } = await supabase
      .from('naver_connections')
      .update(patch)
      .eq('user_id', user.id)
      .select()
      .single();
    if (patchErr) {
      if (patchErr.message?.includes('column')) {
        return NextResponse.json({ error: 'DB 마이그레이션이 필요합니다. supabase/migrations/20260626_naver_image_upload.sql을 실행해주세요.' }, { status: 500 });
      }
      return NextResponse.json({ error: patchErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, naver_user_id: (patchData as Record<string, unknown>)?.naver_user_id as string || '' });
  }

  if (!blog_id?.trim()) return NextResponse.json({ error: '블로그 ID가 필요합니다' }, { status: 400 });

  const { data, error } = await supabase
    .from('naver_connections')
    .upsert({
      user_id: user.id,
      blog_id: blog_id.trim().toLowerCase(),
      blog_name: blog_name?.trim() || blog_id.trim(),
      nid_aut: nid_aut?.trim() || '',
      nid_ses: nid_ses?.trim() || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  await supabase.from('naver_connections').delete().eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
