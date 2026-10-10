-- 네이버 에이전트 Heartbeat 테이블
-- Primary(오래된 맥북)와 Fallback(현재 맥북) 우선순위 관리용

CREATE TABLE IF NOT EXISTS naver_agent_heartbeat (
  agent_id  text        PRIMARY KEY,
  last_seen timestamptz NOT NULL DEFAULT now(),
  hostname  text
);

ALTER TABLE naver_agent_heartbeat ENABLE ROW LEVEL SECURITY;

-- 에이전트는 service_role 키로 접근 (RLS 우회)
CREATE POLICY "service_role_only" ON naver_agent_heartbeat
  FOR ALL TO service_role USING (true) WITH CHECK (true);
