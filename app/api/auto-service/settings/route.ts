import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase
    .from('bossai_auto_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json(data || {
    enabled: false,
    ai_model: 'qwen3',
    max_per_run: 3,
    custom_keywords: [],
    use_gpt: false,
    use_openrouter: false,
    sns_caption_model: 'llama3.3',
    prompt_template: null,
    last_run_at: null,
    last_run_status: null,
    last_run_count: 0,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json();
  const { enabled, ai_model, max_per_run, custom_keywords, use_gpt, use_openrouter, sns_caption_model, prompt_template, naver_auto_publish } = body;

  const upsertData: Record<string, unknown> = {
    user_id: user.id,
    enabled: enabled ?? false,
    ai_model: ai_model || 'qwen3',
    max_per_run: max_per_run ?? 3,
    custom_keywords: custom_keywords || [],
    updated_at: new Date().toISOString(),
  };

  if (prompt_template !== undefined) upsertData.prompt_template = prompt_template || null;
  if (naver_auto_publish !== undefined) upsertData.naver_auto_publish = !!naver_auto_publish;

  const { data, error } = await supabase
    .from('bossai_auto_settings')
    .upsert(upsertData, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
