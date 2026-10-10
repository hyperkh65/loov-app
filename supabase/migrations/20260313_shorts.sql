-- 숏폼 프로젝트 테이블
CREATE TABLE IF NOT EXISTS shorts_projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  topic       TEXT NOT NULL DEFAULT '',
  duration    INTEGER NOT NULL DEFAULT 30,   -- 15 / 30 / 60 초
  tone        TEXT NOT NULL DEFAULT 'info',  -- info / fun / emotion / edu
  voice_lang  TEXT NOT NULL DEFAULT 'ko-KR',
  scenes      JSONB NOT NULL DEFAULT '[]',   -- Scene[]
  status      TEXT NOT NULL DEFAULT 'draft', -- draft / ready
  settings    JSONB NOT NULL DEFAULT '{}',   -- 기타 설정
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shorts_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shorts_owner" ON shorts_projects
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION update_shorts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER shorts_updated_at
  BEFORE UPDATE ON shorts_projects
  FOR EACH ROW EXECUTE FUNCTION update_shorts_updated_at();
