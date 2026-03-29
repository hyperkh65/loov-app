import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { invalidateSettingsCache } from '@/lib/get-setting';

// 웹 UI에서 관리 가능한 키 목록 (보안상 허용된 키만)
const ALLOWED_KEYS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'CLAUDE_API_KEY',
  'OLLAMA_API_KEY',
  'OPENROUTER_API_KEY',
  'GOOGLE_SEARCH_API_KEY',
  'GOOGLE_SEARCH_CX',
  'PIXABAY_API_KEY',
  'N8N_WEBHOOK_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  // Naver Open API
  'NAVER_CLIENT_ID',
  'NAVER_CLIENT_SECRET',
  'NAVER_CAFE_CLUB_ID',
  // Naver Search Ad API (키워드 검색량)
  'NAVER_AD_API_KEY',
  'NAVER_AD_SECRET',
  'NAVER_AD_CUSTOMER_ID',
  // Kakao/Daum API
  'KAKAO_REST_API_KEY',
  // 공공데이터 API
  'DATA_GO_KR_SERVICE_KEY',
  // 갤러리
  'GALLERY_SECRET_PASSWORD',
  'GALLERY_NOTION_DB_URL',
  // 숏폼
  'PEXELS_API_KEY',
  // Edge-TTS (NAS Docker)
  'EDGE_TTS_SERVER_URL',
  'EDGE_TTS_SECRET',
  // Ollama
  'OLLAMA_API_KEY',
  'OLLAMA_BASE_URL',
  // AI 폴백 체인 (JSON string)
  'AI_FALLBACK_CHAIN',
  // 글로벌 AI 설정
  'AI_GLOBAL_PROVIDER',
  'AI_GLOBAL_MODEL',
  // loov22.vercel.app Supabase (LED 제품/조달 데이터 읽기용)
  'LOOV_SUPABASE_URL',
  'LOOV_SUPABASE_ANON_KEY',
  // Cloudflare R2 Storage
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_URL',
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

  // 마스킹: 키 앞 4자리만 노출 (비민감 키는 전체 값 반환)
  const NON_SECRET_KEYS = new Set(['OLLAMA_BASE_URL', 'AI_FALLBACK_CHAIN', 'AI_GLOBAL_PROVIDER', 'AI_GLOBAL_MODEL', 'R2_BUCKET', 'R2_PUBLIC_URL', 'R2_ACCOUNT_ID', 'EDGE_TTS_SERVER_URL']);
  const masked: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    const val = settings[key] || '';
    if (NON_SECRET_KEYS.has(key)) {
      masked[key] = val; // return raw value for non-sensitive settings
    } else {
      masked[key] = val ? val.slice(0, 4) + '••••••••••••' : '';
    }
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
