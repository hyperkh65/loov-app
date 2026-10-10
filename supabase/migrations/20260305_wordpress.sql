-- ── WordPress 자동화 테이블 ──────────────────────────────

-- 워드프레스 사이트 목록
CREATE TABLE IF NOT EXISTS wordpress_sites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  site_name text NOT NULL,
  site_url text NOT NULL,
  wp_username text NOT NULL,
  app_password text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE wordpress_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wp_sites_own" ON wordpress_sites FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 노션 연동 설정 (유저당 1개)
CREATE TABLE IF NOT EXISTS notion_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  integration_token text NOT NULL,
  database_id text NOT NULL,
  title_property text DEFAULT 'Name',
  status_property text DEFAULT 'Status',
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE notion_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notion_conn_own" ON notion_connections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 워드프레스 발행 히스토리
CREATE TABLE IF NOT EXISTS wordpress_post_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  notion_page_id text DEFAULT '',
  title text NOT NULL DEFAULT '',
  sites text[] DEFAULT '{}',
  results jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE wordpress_post_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wp_history_own" ON wordpress_post_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
