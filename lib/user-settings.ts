import { createAdminClient } from './supabase-server';

export interface UserSettings {
  user_id: string;
  // NAS
  nas_ssh_host?: string;
  nas_ssh_port?: number;
  nas_ssh_user?: string;
  nas_ssh_password?: string;
  nas_web_base_url?: string;
  // Notion
  notion_api_key?: string;
  notion_camera_db_id?: string;
  // CCTV
  cctv_streams?: Array<{ name: string; url: string }>;
  // Storage
  storage_type?: 'nas' | 'r2' | 'none';
  // Camera
  camera_secret_password?: string;
  // Plan
  plan?: 'free' | 'pro' | 'business';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  plan_expires_at?: string;
}

/** 대표님 여부 체크 */
export function isOwner(userId: string): boolean {
  const ownerId =
    process.env.OWNER_USER_ID ||
    process.env.NEXT_PUBLIC_OWNER_USER_ID ||
    '0a7e3d43-0159-411e-b171-0aebb70a4893';
  return userId === ownerId;
}

/** 서버사이드: 사용자 설정 읽기 (RLS 우회) */
export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // 행 없음 → null 반환
      return null;
    }
    console.error('[getUserSettings] error:', error);
    return null;
  }

  return data as UserSettings;
}

/** 서버사이드: 사용자 설정 저장 (upsert, RLS 우회) */
export async function saveUserSettings(
  userId: string,
  settings: Partial<UserSettings>
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { ...settings, user_id: userId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('[saveUserSettings] error:', error);
    throw new Error(`설정 저장 실패: ${error.message}`);
  }
}
