-- 네이버 발행 예약 시간 컬럼 추가
ALTER TABLE naver_publish_jobs
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
