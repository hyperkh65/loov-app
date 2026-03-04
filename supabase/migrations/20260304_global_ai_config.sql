-- globalAIConfig를 서버에서 읽을 수 있도록 DB 컬럼 추가
ALTER TABLE bossai_company_settings
  ADD COLUMN IF NOT EXISTS global_ai_config jsonb DEFAULT NULL;
