-- bossai_auto_settings에 네이버 자동발행 옵션 추가
ALTER TABLE bossai_auto_settings
  ADD COLUMN IF NOT EXISTS naver_auto_publish boolean DEFAULT false;
