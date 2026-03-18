CREATE TABLE IF NOT EXISTS bossai_blogger_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  coupang_access_key text,
  coupang_secret_key text,
  notion_token text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bossai_blogger_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own" ON bossai_blogger_settings FOR ALL USING (auth.uid() = user_id);
