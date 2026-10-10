import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('bossai_blogger_settings')
    .select('coupang_access_key, coupang_secret_key, notion_token')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({
    coupang_access_key: data?.coupang_access_key ? '***' + data.coupang_access_key.slice(-4) : '',
    coupang_secret_key: data?.coupang_secret_key ? '***' + data.coupang_secret_key.slice(-4) : '',
    notion_token: data?.notion_token ? '***' + data.notion_token.slice(-6) : '',
    has_coupang: !!(data?.coupang_access_key && data?.coupang_secret_key),
    has_notion: !!data?.notion_token,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, string | null> = { updated_at: new Date().toISOString() };
  if (body.coupang_access_key !== undefined) updates.coupang_access_key = body.coupang_access_key || null;
  if (body.coupang_secret_key !== undefined) updates.coupang_secret_key = body.coupang_secret_key || null;
  if (body.notion_token !== undefined) updates.notion_token = body.notion_token || null;

  const { error } = await supabase
    .from('bossai_blogger_settings')
    .upsert({ user_id: user.id, ...updates });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
