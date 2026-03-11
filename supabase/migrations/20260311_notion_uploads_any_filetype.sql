-- file_type CHECK 제약 제거 → 모든 파일 형식 허용
ALTER TABLE bossai_notion_uploads
  DROP CONSTRAINT IF EXISTS bossai_notion_uploads_file_type_check;

-- file_size, file_url 컬럼 없으면 추가
ALTER TABLE bossai_notion_uploads
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS file_url text;
