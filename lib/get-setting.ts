/**
 * 앱 설정 값 조회 (Supabase DB 우선, env var 폴백)
 * - 웹 대시보드에서 저장한 키가 있으면 그것을 사용
 * - 없으면 Vercel 환경변수 사용
 */
import { createAdminClient } from './supabase-server';

// 5분 캐시 (DB 호출 최소화)
let _cache: { data: Record<string, string>; exp: number } | null = null;

async function loadSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_cache && _cache.exp > now) return _cache.data;

  try {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from('app_settings')
      .select('settings')
      .eq('id', 1)
      .single();

    const settings = (data?.settings as Record<string, string>) || {};
    _cache = { data: settings, exp: now + 5 * 60 * 1000 };
    return settings;
  } catch {
    return {};
  }
}

export async function getSetting(key: string): Promise<string> {
  const settings = await loadSettings();
  return settings[key] || process.env[key] || '';
}

// 캐시 무효화 (설정 저장 후 호출)
export function invalidateSettingsCache() {
  _cache = null;
}
