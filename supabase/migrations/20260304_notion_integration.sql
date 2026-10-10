-- Add notion_config column to bossai_company_settings
ALTER TABLE bossai_company_settings
  ADD COLUMN IF NOT EXISTS notion_config jsonb DEFAULT NULL;

-- Create bossai_notion_uploads table
CREATE TABLE IF NOT EXISTS bossai_notion_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('PDF', 'Word', 'Excel')),
  category text,
  ai_title text,
  summary text,
  tags text[] DEFAULT '{}',
  notion_page_id text,
  notion_db_row_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE bossai_notion_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notion uploads"
  ON bossai_notion_uploads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS bossai_notion_uploads_user_id_idx ON bossai_notion_uploads(user_id);
CREATE INDEX IF NOT EXISTS bossai_notion_uploads_created_at_idx ON bossai_notion_uploads(created_at DESC);
