-- 리라이팅 기사 테이블
CREATE TABLE IF NOT EXISTS bossai_rewrite_articles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  notion_page_id   TEXT UNIQUE,
  title            TEXT NOT NULL DEFAULT '',
  source_url       TEXT DEFAULT '',
  source_account   TEXT DEFAULT '',
  original_content TEXT DEFAULT '',
  rewritten_title  TEXT DEFAULT '',
  rewritten_meta   TEXT DEFAULT '',
  rewritten_content TEXT DEFAULT '',
  ai_model         TEXT DEFAULT 'qwen3',
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','rewriting','ready','failed','published')),
  error_message    TEXT,
  word_count       INTEGER DEFAULT 0,
  published_at     TIMESTAMPTZ,
  published_urls   JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewrite_user_status
  ON bossai_rewrite_articles(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rewrite_notion
  ON bossai_rewrite_articles(notion_page_id);
CREATE INDEX IF NOT EXISTS idx_rewrite_account
  ON bossai_rewrite_articles(source_account);
