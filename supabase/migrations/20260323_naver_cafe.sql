-- 네이버 카페 연동 테이블
CREATE TABLE IF NOT EXISTS naver_cafe_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  club_id text NOT NULL DEFAULT '',
  cafe_name text DEFAULT '',
  cafe_url text DEFAULT '',
  member_id text DEFAULT '',
  menu_list jsonb DEFAULT '[]',
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE naver_cafe_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cafe connection" ON naver_cafe_connections
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admin full access cafe connections" ON naver_cafe_connections
  FOR ALL USING (auth.role() = 'service_role');

-- 네이버 카페 발행 이력
CREATE TABLE IF NOT EXISTS naver_cafe_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  club_id text,
  article_id text,
  article_url text,
  title text,
  menu_id text,
  menu_name text,
  open_yn text DEFAULT 'Y',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE naver_cafe_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cafe history" ON naver_cafe_history
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admin full access cafe history" ON naver_cafe_history
  FOR ALL USING (auth.role() = 'service_role');
