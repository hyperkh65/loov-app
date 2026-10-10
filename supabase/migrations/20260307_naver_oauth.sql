-- naver_connections에 OAuth 토큰 컬럼 추가
ALTER TABLE naver_connections
  ALTER COLUMN blog_id SET DEFAULT '',
  ALTER COLUMN nid_aut SET DEFAULT '',
  ALTER COLUMN nid_ses SET DEFAULT '',
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
