-- notion_connections에 리라이팅 설정 컬럼 추가
ALTER TABLE notion_connections
  ADD COLUMN IF NOT EXISTS openai_api_key text DEFAULT '',
  ADD COLUMN IF NOT EXISTS rewrite_prompt text DEFAULT '';
