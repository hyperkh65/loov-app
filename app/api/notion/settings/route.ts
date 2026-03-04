import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data } = await supabase
      .from('bossai_company_settings')
      .select('notion_config')
      .eq('user_id', user.id)
      .single();

    const config = data?.notion_config ?? {};
    return NextResponse.json({
      apiKey: config.apiKey ? `${config.apiKey.slice(0, 8)}${'•'.repeat(8)}` : '',
      databaseId: config.databaseId ?? '',
      hasApiKey: !!config.apiKey,
    });
  } catch (e) {
    console.error('notion/settings GET:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { apiKey, databaseId } = body as { apiKey?: string; databaseId?: string };

    // Fetch existing config to allow partial updates
    const { data: existing } = await supabase
      .from('bossai_company_settings')
      .select('notion_config')
      .eq('user_id', user.id)
      .single();

    const prev = existing?.notion_config ?? {};
    const updated = {
      ...prev,
      ...(apiKey !== undefined && apiKey !== '' ? { apiKey } : {}),
      ...(databaseId !== undefined ? { databaseId } : {}),
    };

    const { error } = await supabase
      .from('bossai_company_settings')
      .upsert({ user_id: user.id, notion_config: updated }, { onConflict: 'user_id' });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('notion/settings POST:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
