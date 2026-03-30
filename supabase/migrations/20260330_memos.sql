-- bossai_memos: 기록/메모 시스템
CREATE TABLE IF NOT EXISTS bossai_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text DEFAULT '',
  content text NOT NULL DEFAULT '',
  summary text DEFAULT '',
  tags text[] DEFAULT '{}',
  category text DEFAULT '기타',
  memo_date date NOT NULL DEFAULT CURRENT_DATE,
  backup_nas boolean DEFAULT false,
  backup_notion boolean DEFAULT false,
  notion_page_id text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bossai_memos_user_id_idx ON bossai_memos(user_id);
CREATE INDEX IF NOT EXISTS bossai_memos_memo_date_idx ON bossai_memos(memo_date);
CREATE INDEX IF NOT EXISTS bossai_memos_tags_idx ON bossai_memos USING GIN(tags);

ALTER TABLE bossai_memos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memos_owner" ON bossai_memos
  FOR ALL USING (auth.uid() = user_id);
