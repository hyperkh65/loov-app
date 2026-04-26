import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-server';
import { getSetting, invalidateSettingsCache } from '@/lib/get-setting';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const accessKey = await getSetting('COUPANG_ACCESS_KEY');
  const secretKey = await getSetting('COUPANG_SECRET_KEY');

  return NextResponse.json({
    accessKey: accessKey ? '****' + accessKey.slice(-4) : '',
    secretKey: secretKey ? '****' + secretKey.slice(-4) : '',
    configured: !!(accessKey && secretKey),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { accessKey, secretKey } = await req.json() as { accessKey?: string; secretKey?: string };
  if (!accessKey || !secretKey)
    return NextResponse.json({ error: 'accessKey, secretKey 모두 필요합니다' }, { status: 400 });

  const admin = await createAdminClient();
  const { data: existing } = await admin
    .from('app_settings')
    .select('settings')
    .eq('id', 1)
    .single();

  const current = (existing?.settings as Record<string, string>) || {};
  const updated = { ...current, COUPANG_ACCESS_KEY: accessKey.trim(), COUPANG_SECRET_KEY: secretKey.trim() };

  const { error } = await admin
    .from('app_settings')
    .update({ settings: updated, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateSettingsCache();
  return NextResponse.json({ success: true });
}
