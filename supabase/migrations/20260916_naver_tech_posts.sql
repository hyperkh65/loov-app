-- 네이버 전자제품 자동발행: 같은 해외 원문을 두 번 쓰지 않도록 발행 이력 기록
CREATE TABLE IF NOT EXISTS bossai_naver_tech_posts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL,
  source_url   text        NOT NULL,
  source_name  text,
  source_title text,
  title        text,
  post_url     text,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_naver_tech_posts_source_url ON bossai_naver_tech_posts (source_url);
CREATE INDEX IF NOT EXISTS idx_naver_tech_posts_created_at ON bossai_naver_tech_posts (created_at DESC);
