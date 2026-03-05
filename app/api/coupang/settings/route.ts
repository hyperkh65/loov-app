import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase
    .from('bossai_company_settings')
    .select('coupang_config')
    .eq('user_id', user.id)
    .maybeSingle();

  const config = data?.coupang_config as { accessKey?: string; secretKey?: string } | null;
  return NextResponse.json({
    accessKey: config?.accessKey ? '****' + config.accessKey.slice(-4) : '',
    secretKey: config?.secretKey ? '****' + config.secretKey.slice(-4) : '',
    configured: !!(config?.accessKey && config?.secretKey),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { accessKey, secretKey } = await req.json();
  if (!accessKey || !secretKey)
    return NextResponse.json({ error: 'accessKey, secretKey 모두 필요합니다' }, { status: 400 });

  const { error } = await supabase
    .from('bossai_company_settings')
    .upsert({ user_id: user.id, coupang_config: { accessKey, secretKey } }, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
