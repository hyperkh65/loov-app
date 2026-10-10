-- WeChat 백업 설정 컬럼 추가
ALTER TABLE bossai_company_settings
  ADD COLUMN IF NOT EXISTS wechat_config jsonb DEFAULT '{}'::jsonb;

-- WeChat 전용 API 키 (만료 없음)
ALTER TABLE bossai_company_settings
  ADD COLUMN IF NOT EXISTS wechat_api_key text;
