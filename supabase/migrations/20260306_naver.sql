-- 네이버 블로그 연결 테이블
CREATE TABLE IF NOT EXISTS naver_connections (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blog_id       text        NOT NULL,          -- 네이버 블로그 ID (username)
  blog_name     text        DEFAULT '',        -- 블로그 이름 (표시용)
  nid_aut       text        DEFAULT '',        -- NID_AUT 쿠키
  nid_ses       text        DEFAULT '',        -- NID_SES 쿠키
  categories    jsonb       DEFAULT '[]'::jsonb, -- 카테고리 캐시 [{no, name}]
  is_active     boolean     DEFAULT true,
  last_tested_at timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE naver_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own naver" ON naver_connections USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 네이버 발행 히스토리
CREATE TABLE IF NOT EXISTS naver_publish_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blog_id       text        NOT NULL,
  post_id       text,
  post_url      text,
  title         text        NOT NULL,
  notion_page_id text       DEFAULT '',
  status        text        DEFAULT 'publish',
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE naver_publish_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own naver history" ON naver_publish_history USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
