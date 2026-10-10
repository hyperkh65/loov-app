CREATE TABLE IF NOT EXISTS bossai_blogger_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  email text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS bossai_blogger_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  blog_id text DEFAULT '7951763866955162015',
  post_id text,
  title text,
  keyword text,
  content_type text,
  labels text[],
  status text DEFAULT 'DRAFT',
  blogger_url text,
  published_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bossai_blogger_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE bossai_blogger_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own" ON bossai_blogger_tokens FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "user_own" ON bossai_blogger_history FOR ALL USING (auth.uid() = user_id);
