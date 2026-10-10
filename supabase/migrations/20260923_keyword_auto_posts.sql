-- 키워드 발굴 기반 자동발행(yellow.2days.kr 등): 같은 키워드를 두 번 쓰지 않도록 발행 이력 기록
-- (bossai_naver_tech_posts와 동일한 패턴 — source_url 대신 keyword로 중복 체크)
CREATE TABLE IF NOT EXISTS bossai_keyword_auto_posts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL,
  source_id  uuid,
  category   text        NOT NULL,
  keyword    text        NOT NULL,
  title      text,
  post_url   text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_keyword_auto_posts_keyword ON bossai_keyword_auto_posts (keyword);
CREATE INDEX IF NOT EXISTS idx_keyword_auto_posts_created_at ON bossai_keyword_auto_posts (created_at DESC);
