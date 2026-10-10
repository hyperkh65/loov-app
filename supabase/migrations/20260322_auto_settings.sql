-- 블로그 자동화 사용자별 설정 테이블
CREATE TABLE IF NOT EXISTS bossai_auto_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT FALSE,
  ai_model TEXT DEFAULT 'qwen3',
  max_per_run INTEGER DEFAULT 3,
  custom_keywords TEXT[] DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bossai_auto_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own auto settings"
  ON bossai_auto_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
