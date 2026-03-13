import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { invalidateSettingsCache } from '@/lib/get-setting';

// 웹 UI에서 관리 가능한 키 목록 (보안상 허용된 키만)
const ALLOWED_KEYS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'CLAUDE_API_KEY',
  'PIXABAY_API_KEY',
  'N8N_WEBHOOK_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  // Naver Open API
  'NAVER_CLIENT_ID',
  'NAVER_CLIENT_SECRET',
  // Naver Search Ad API (키워드 검색량)
  'NAVER_AD_API_KEY',
  'NAVER_AD_SECRET',
  'NAVER_AD_CUSTOMER_ID',
  // Kakao/Daum API
  'KAKAO_REST_API_KEY',
  // 갤러리
  'GALLERY_SECRET_PASSWORD',
  'GALLERY_NOTION_DB_URL',
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
        // 값이 있으면 저장/교체
        updated[key] = val;
      }
      // 빈 값이면 기존 값 유지 (삭제 안 함)
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
