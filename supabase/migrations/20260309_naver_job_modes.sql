-- Naver publish job 3가지 모드 지원을 위한 컬럼 추가
-- job_type: 'draft' | 'rewrite' | 'scrape'

ALTER TABLE naver_publish_jobs
  ADD COLUMN IF NOT EXISTS job_type         text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS source_url       text,
  ADD COLUMN IF NOT EXISTS ai_prompt        text,
  ADD COLUMN IF NOT EXISTS ai_provider      text DEFAULT 'gemini',
  ADD COLUMN IF NOT EXISTS thumbnail_prompt text,
  ADD COLUMN IF NOT EXISTS thumbnail_url    text,
  ADD COLUMN IF NOT EXISTS raw_content      text;

-- job_type 값 제약
ALTER TABLE naver_publish_jobs
  ADD CONSTRAINT naver_publish_jobs_job_type_check
  CHECK (job_type IN ('draft', 'rewrite', 'scrape'));

-- ai_provider 값 제약
ALTER TABLE naver_publish_jobs
  ADD CONSTRAINT naver_publish_jobs_ai_provider_check
  CHECK (ai_provider IN ('gemini', 'claude', 'gpt4o', 'gpt4', 'gpt35'));
