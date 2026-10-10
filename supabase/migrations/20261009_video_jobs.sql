-- 영상 수집(다운로드/검색) 작업 큐. 웹은 등록·조회만, hy64 워커가 처리.
CREATE TABLE IF NOT EXISTS bossai_video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'download',      -- download | search
  input text NOT NULL,                        -- 영상 URL 또는 검색어
  status text NOT NULL DEFAULT 'queued',      -- queued | running | done | error
  result jsonb,                               -- download: {file,title,site,thumbnail,uploader,duration,size} / search: {items:[...]}
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_queue ON bossai_video_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_video_jobs_user ON bossai_video_jobs (user_id, created_at DESC);
