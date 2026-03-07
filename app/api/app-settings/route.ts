import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { invalidateSettingsCache } from '@/lib/get-setting';

// 웹 UI에서 관리 가능한 키 목록 (보안상 허용된 키만)
const ALLOWED_KEYS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'N8N_WEBHOOK_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
] as const;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const admin = await createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('settings, updated_at')
    .eq('id', 1)
    .single();

  const settings = (data?.settings as Record<string, string>) || {};

  // 마스킹: 키 앞 4자리만 노출
  const masked: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    const val = settings[key] || '';
    masked[key] = val ? val.slice(0, 4) + '••••••••••••' : '';
  }

  return NextResponse.json({
    settings: masked,
    hasKey: Object.fromEntries(ALLOWED_KEYS.map(k => [k, !!(settings[k] || process.env[k])])),
    updatedAt: data?.updated_at || null,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const body = await req.json() as Record<string, string>;

  // 허용된 키만 저장
  const admin = await createAdminClient();
  const { data: existing } = await admin
    .from('app_settings')
    .select('settings')
    .eq('id', 1)
    .single();

  const current = (existing?.settings as Record<string, string>) || {};
  const updated: Record<string, string> = { ...current };

  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      const val = body[key]?.trim();
      if (val) {
        updated[key] = val;
      } else if (val === '') {
        // 빈 값이면 삭제
        delete updated[key];
      }
    }
  }

  const { error } = await admin
    .from('app_settings')
    .update({ settings: updated, updated_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateSettingsCache();
  return NextResponse.json({ ok: true });
}
