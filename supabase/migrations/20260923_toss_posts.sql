-- 토스쇼핑 쉐어링크 자동발행: 같은 상품을 두 번 올리지 않도록 발행 이력 기록
-- (bossai_naver_tech_posts와 동일한 패턴)
CREATE TABLE IF NOT EXISTS bossai_toss_posts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL,
  taca_item_id bigint      NOT NULL,
  display_name text,
  short_url    text,
  results      jsonb,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_toss_posts_taca_item_id ON bossai_toss_posts (taca_item_id);
CREATE INDEX IF NOT EXISTS idx_toss_posts_created_at ON bossai_toss_posts (created_at DESC);
