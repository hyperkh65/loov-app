-- 소스별로 SNS 배포에서 특정 플랫폼만 빼고 싶을 때 사용 (예: 스레드만 제외).
-- publish_sns가 켜져 있어도 이 목록에 있는 플랫폼은 건너뛴다.
ALTER TABLE bossai_rewrite_sources
  ADD COLUMN IF NOT EXISTS excluded_platforms text[] NOT NULL DEFAULT '{}';
