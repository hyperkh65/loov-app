-- WeChat 백업 설정 컬럼 추가
ALTER TABLE bossai_company_settings
  ADD COLUMN IF NOT EXISTS wechat_config jsonb DEFAULT '{}'::jsonb;
