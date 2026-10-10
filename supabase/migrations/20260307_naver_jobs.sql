-- GitHub Actions를 통한 네이버 블로그 발행 작업 큐
CREATE TABLE IF NOT EXISTS naver_publish_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  content         text        NOT NULL,
  tags            text[]      DEFAULT '{}',
  category_no     int         DEFAULT 0,
  is_publish      boolean     DEFAULT true,
  notion_page_id  text        DEFAULT '',
  -- 상태: pending → processing → completed | failed
  status          text        NOT NULL DEFAULT 'pending',
  post_id         text,
  post_url        text,
  error_message   text,
  created_at      timestamptz DEFAULT now(),
  completed_at    timestamptz
);

ALTER TABLE naver_publish_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own naver jobs" ON naver_publish_jobs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
