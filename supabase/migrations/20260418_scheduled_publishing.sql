-- 예약 발행 기능 추가
ALTER TABLE bossai_auto_articles
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_platforms JSONB DEFAULT '{}';

-- status에 'scheduled' 추가
ALTER TABLE bossai_auto_articles
  DROP CONSTRAINT IF EXISTS bossai_auto_articles_status_check;
ALTER TABLE bossai_auto_articles
  ADD CONSTRAINT bossai_auto_articles_status_check
  CHECK (status IN ('draft', 'approved', 'published', 'failed', 'scheduled'));

-- 예약 시간 인덱스
CREATE INDEX IF NOT EXISTS idx_auto_articles_scheduled
  ON bossai_auto_articles(scheduled_at)
  WHERE status = 'scheduled';
