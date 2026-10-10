-- 리라이팅 소스 사이트 등록 (RSS 감지 → bossai_rewrite_articles에 자동 투입)
CREATE TABLE IF NOT EXISTS bossai_rewrite_sources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  name             TEXT NOT NULL,
  site_url         TEXT NOT NULL,
  feed_url         TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  last_checked_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewrite_sources_user ON bossai_rewrite_sources(user_id, is_active);

ALTER TABLE bossai_rewrite_articles
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES bossai_rewrite_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS representative_image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_rewrite_articles_source ON bossai_rewrite_articles(source_id);
