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
  'OLLAMA_API_KEYS',
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
  // LED 스크래퍼
  'LED_SCRAPE_SECRET',
  // GitHub Actions trigger
  'GITHUB_PAT',
  'GITHUB_REPO',
  // 카메라 설정
  'NOTION_API_KEY',
  'NOTION_CAMERA_DB_ID',
  'CAMERA_SECRET_PASSWORD',
  'NAS_WEB_BASE_URL',
  // Instagram / Facebook OAuth 앱 키
  'INSTAGRAM_APP_ID',
  'INSTAGRAM_APP_SECRET',
  'FACEBOOK_APP_ID',
  'FACEBOOK_APP_SECRET',
  // Twitter/X OAuth 2.0 앱 키
  'TWITTER_CLIENT_ID',
  'TWITTER_CLIENT_SECRET',
  // Threads OAuth 앱 키
  'THREADS_APP_ID',
  'THREADS_APP_SECRET',
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
  const NON_SECRET_KEYS = new Set(['OLLAMA_BASE_URL', 'AI_FALLBACK_CHAIN', 'AI_GLOBAL_PROVIDER', 'AI_GLOBAL_MODEL', 'R2_BUCKET', 'R2_PUBLIC_URL', 'R2_ACCOUNT_ID', 'EDGE_TTS_SERVER_URL', 'NAS_WEB_BASE_URL', 'NOTION_CAMERA_DB_ID', 'OLLAMA_API_KEYS']);
  const masked: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    const val = settings[key] || '';
    if (NON_SECRET_KEYS.has(key)) {
      masked[key] = val; // return raw value for non-sensitive settings
    } else {
      masked[key] = val ? val.slice(0, 4) + '••••••••••••' : '';
    }
  }

  // Multi-key Ollama Cloud: return masked array
  let ollamaKeysMasked: string[] = [];
  try {
    const raw = settings['OLLAMA_API_KEYS'];
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) {
        ollamaKeysMasked = arr.map((k) => k ? k.slice(0, 8) + '••••••••' : '');
      }
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    settings: masked,
    hasKey: Object.fromEntries(ALLOWED_KEYS.map(k => [k, !!(settings[k] || process.env[k])])),
    ollamaKeysMasked,
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

  // Special: append a new Ollama Cloud key to the array
  if ('OLLAMA_API_KEYS_ADD' in body) {
    const newKey = body['OLLAMA_API_KEYS_ADD']?.trim();
    if (newKey) {
      let arr: string[] = [];
      try { arr = JSON.parse(current['OLLAMA_API_KEYS'] || '[]') as string[]; } catch { /* ignore */ }
      if (!arr.includes(newKey)) arr.push(newKey);
      updated['OLLAMA_API_KEYS'] = JSON.stringify(arr);
    }
    const { error } = await admin.from('app_settings').update({ settings: updated, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invalidateSettingsCache();
    return NextResponse.json({ ok: true });
  }

  // Special: delete a key by index from the array
  if ('OLLAMA_API_KEYS_DELETE_INDEX' in body) {
    const idx = Number(body['OLLAMA_API_KEYS_DELETE_INDEX']);
    let arr: string[] = [];
    try { arr = JSON.parse(current['OLLAMA_API_KEYS'] || '[]') as string[]; } catch { /* ignore */ }
    if (!isNaN(idx) && idx >= 0 && idx < arr.length) arr.splice(idx, 1);
    updated['OLLAMA_API_KEYS'] = JSON.stringify(arr);
    const { error } = await admin.from('app_settings').update({ settings: updated, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invalidateSettingsCache();
    return NextResponse.json({ ok: true });
  }

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
