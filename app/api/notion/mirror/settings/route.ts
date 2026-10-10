import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('bossai_company_settings')
    .select('notion_mirror_config')
    .eq('user_id', user.id)
    .single();

  const config = (data?.notion_mirror_config ?? {}) as { apiKey?: string };
  return NextResponse.json({
    hasToken: !!config.apiKey,
    tokenPreview: config.apiKey ? `${config.apiKey.slice(0, 12)}${'•'.repeat(10)}` : '',
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { apiKey } = await req.json() as { apiKey: string };
  if (!apiKey?.startsWith('secret_') && !apiKey?.startsWith('ntn_')) {
    return NextResponse.json({ error: '올바른 Notion 토큰 형식이 아닙니다 (secret_ 또는 ntn_ 으로 시작)' }, { status: 400 });
  }

  const { error } = await supabase
    .from('bossai_company_settings')
    .upsert({ user_id: user.id, notion_mirror_config: { apiKey } }, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await supabase
    .from('bossai_company_settings')
    .update({ notion_mirror_config: {} })
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
