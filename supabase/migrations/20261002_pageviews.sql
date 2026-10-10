-- WP 사이트 방문/체류시간 자체 집계 (loov-analytics mu-plugin 비콘이 기록)
CREATE TABLE IF NOT EXISTS bossai_pageviews (
  sid text PRIMARY KEY,
  host text NOT NULL,
  path text,
  referrer text,
  device_type text,
  is_bot boolean DEFAULT false,
  dwell_sec integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pageviews_host_time ON bossai_pageviews (host, created_at DESC);
