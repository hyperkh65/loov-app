-- 마스터 유저 + AI 사용량 추적

-- 1. 프로필에 is_master 컬럼 추가
ALTER TABLE bossai_profiles
  ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false;

-- 2. 회사 설정에도 동기화
ALTER TABLE bossai_company_settings
  ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false;

-- 3. AI 일일 사용량 테이블
CREATE TABLE IF NOT EXISTS bossai_ai_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  call_count INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON bossai_ai_usage (user_id, usage_date);

-- 4. 마스터 도메인 자동 지정 함수 (2days.kr 이메일)
CREATE OR REPLACE FUNCTION auto_set_master()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email ILIKE '%@2days.kr' OR NEW.email ILIKE '%@loov.co.kr' THEN
    UPDATE bossai_profiles SET is_master = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 (신규 가입 시)
DROP TRIGGER IF EXISTS trg_auto_master ON auth.users;
CREATE TRIGGER trg_auto_master
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION auto_set_master();

-- 5. AI 사용량 증가 RPC
CREATE OR REPLACE FUNCTION increment_ai_usage(p_user_id UUID, p_date DATE)
RETURNS void AS $$
BEGIN
  INSERT INTO bossai_ai_usage (user_id, usage_date, call_count, updated_at)
  VALUES (p_user_id, p_date, 1, NOW())
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET
    call_count = bossai_ai_usage.call_count + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 기존 유저 중 해당 도메인 마스터 지정
UPDATE bossai_profiles SET is_master = true
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email ILIKE '%@2days.kr' OR email ILIKE '%@loov.co.kr'
);
