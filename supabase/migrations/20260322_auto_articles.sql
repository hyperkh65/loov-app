-- 블로그 자동화 초안 테이블
CREATE TABLE IF NOT EXISTS bossai_auto_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  keyword TEXT NOT NULL,
  focus_keyword TEXT,
  title TEXT NOT NULL,
  meta_description TEXT,
  content TEXT NOT NULL,
  representative_image_url TEXT,
  ai_model TEXT DEFAULT 'qwen3',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'failed')),
  blog_platforms TEXT[] DEFAULT '{}',
  sns_platforms TEXT[] DEFAULT '{}',
  published_urls JSONB DEFAULT '{}',
  published_at TIMESTAMPTZ,
  error_message TEXT,
  sources JSONB DEFAULT '[]',
  word_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bossai_auto_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own auto articles"
  ON bossai_auto_articles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_auto_articles_user_status ON bossai_auto_articles(user_id, status);
CREATE INDEX IF NOT EXISTS idx_auto_articles_created ON bossai_auto_articles(created_at DESC);
