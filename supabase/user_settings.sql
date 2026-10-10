-- user_settings 테이블: 사용자별 NAS/Notion/CCTV/플랜 설정
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  nas_ssh_host TEXT,
  nas_ssh_port INTEGER DEFAULT 22,
  nas_ssh_user TEXT,
  nas_ssh_password TEXT,
  nas_web_base_url TEXT,
  notion_api_key TEXT,
  notion_camera_db_id TEXT,
  cctv_streams JSONB DEFAULT '[]',
  storage_type TEXT DEFAULT 'r2',
  camera_secret_password TEXT DEFAULT '0506',
  plan TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 설정만 읽기/쓰기 가능
CREATE POLICY "users_own_settings" ON user_settings
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- service_role(Admin)은 모든 행 접근 가능 (RLS 우회)
CREATE POLICY "admin_all" ON user_settings
  TO service_role USING (true) WITH CHECK (true);
