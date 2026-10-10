-- user_settings 플랜 관련 필드 추가
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS plan_start_at TIMESTAMPTZ;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS plan_billing_day INTEGER DEFAULT 1; -- 매월 결제일 (1~28)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS plan_memo TEXT; -- 관리자 메모

-- auth.users 이메일을 편하게 조회하기 위한 뷰 (서비스롤 전용)
CREATE OR REPLACE VIEW admin_user_list AS
SELECT
  u.id AS user_id,
  u.email,
  u.created_at AS joined_at,
  s.plan,
  s.plan_start_at,
  s.plan_expires_at,
  s.plan_billing_day,
  s.plan_memo,
  s.stripe_customer_id,
  s.updated_at AS settings_updated_at
FROM auth.users u
LEFT JOIN user_settings s ON s.user_id = u.id
ORDER BY u.created_at DESC;
