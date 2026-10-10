-- naver_connections에 이미지 업로드용 컬럼 추가
ALTER TABLE naver_connections
  ADD COLUMN IF NOT EXISTS upload_session_key text,
  ADD COLUMN IF NOT EXISTS naver_user_id text;
