-- 앱 설정 테이블 (API 키 등 웹에서 관리 가능한 설정)
CREATE TABLE IF NOT EXISTS app_settings (
  id int PRIMARY KEY DEFAULT 1,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- 기본 행 삽입
INSERT INTO app_settings (id, settings) VALUES (1, '{}') ON CONFLICT DO NOTHING;

-- RLS: 인증된 사용자만 접근
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users read app_settings"
  ON app_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth users update app_settings"
  ON app_settings FOR UPDATE TO authenticated USING (true);
