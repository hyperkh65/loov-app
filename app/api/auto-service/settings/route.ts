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
  const { enabled, ai_model, max_per_run, custom_keywords, use_gpt, use_openrouter, sns_caption_model } = body;

  const { data, error } = await supabase
    .from('bossai_auto_settings')
    .upsert({
      user_id: user.id,
      enabled: enabled ?? false,
      ai_model: ai_model || 'qwen3',
      max_per_run: max_per_run ?? 3,
      custom_keywords: custom_keywords || [],
      use_gpt: use_gpt ?? false,
      use_openrouter: use_openrouter ?? false,
      sns_caption_model: sns_caption_model || 'llama3.3',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
