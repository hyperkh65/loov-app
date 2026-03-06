-- notion_connections 테이블에 SEO 리라이팅 관련 컬럼 추가
ALTER TABLE notion_connections
  ADD COLUMN IF NOT EXISTS openai_api_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rewrite_prompt text DEFAULT NULL;
