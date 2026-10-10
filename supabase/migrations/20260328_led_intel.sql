-- LED 시장 분析 (사용자 수동 입력 데이터만 loov.co.kr Supabase에 저장)
-- led_products, led_reports 등은 loov22.vercel.app 의 Supabase에 이미 존재

CREATE TABLE IF NOT EXISTS led_market_data (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  category    text NOT NULL DEFAULT '분析',
  value       numeric NOT NULL DEFAULT 0,
  description text,
  date        timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_led_market_data_user ON led_market_data (user_id, created_at DESC);

ALTER TABLE led_market_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "led_market_data_own" ON led_market_data;
CREATE POLICY "led_market_data_own" ON led_market_data
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
