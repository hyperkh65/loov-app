-- 에이전트 선택 컬럼 추가
ALTER TABLE naver_publish_jobs
  ADD COLUMN IF NOT EXISTS preferred_agent text NOT NULL DEFAULT 'server1';

-- Heartbeat 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS naver_agent_heartbeat (
  agent_id  text        PRIMARY KEY,
  last_seen timestamptz NOT NULL DEFAULT now(),
  hostname  text
);
ALTER TABLE naver_agent_heartbeat ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_only" ON naver_agent_heartbeat
  FOR ALL TO service_role USING (true) WITH CHECK (true);
