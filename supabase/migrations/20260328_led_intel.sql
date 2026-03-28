-- LED Intelligence tables migration
-- 모든 테이블을 동일한 Supabase 계정(loov.co.kr)에 생성

-- LED 시장 분석 (사용자 수동 입력 데이터)
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

-- LED 제품 (Danawa GitHub Actions 스크래퍼 수집)
CREATE TABLE IF NOT EXISTS led_products (
  id            bigserial PRIMARY KEY,
  external_id   text UNIQUE,
  name          text NOT NULL,
  price         integer NOT NULL DEFAULT 0,
  maker         text,
  category      text,
  image_url     text,
  specs         jsonb,
  collected_at  timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_led_products_category  ON led_products (category);
CREATE INDEX IF NOT EXISTS idx_led_products_maker     ON led_products (maker);
CREATE INDEX IF NOT EXISTS idx_led_products_price     ON led_products (price);
CREATE INDEX IF NOT EXISTS idx_led_products_collected ON led_products (collected_at DESC);

ALTER TABLE led_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "led_products_read"  ON led_products;
DROP POLICY IF EXISTS "led_products_write" ON led_products;
CREATE POLICY "led_products_read"  ON led_products FOR SELECT USING (true);
CREATE POLICY "led_products_write" ON led_products FOR ALL    USING (true) WITH CHECK (true);

-- LED 가격 이력
CREATE TABLE IF NOT EXISTS led_price_history (
  id          bigserial PRIMARY KEY,
  product_id  bigint REFERENCES led_products(id) ON DELETE CASCADE,
  external_id text,
  price       integer NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_led_price_history_product ON led_price_history (product_id, recorded_at DESC);

ALTER TABLE led_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "led_price_history_read"  ON led_price_history;
DROP POLICY IF EXISTS "led_price_history_write" ON led_price_history;
CREATE POLICY "led_price_history_read"  ON led_price_history FOR SELECT USING (true);
CREATE POLICY "led_price_history_write" ON led_price_history FOR ALL    USING (true) WITH CHECK (true);

-- LED AI 리포트 (일별 요약)
CREATE TABLE IF NOT EXISTS led_reports (
  id             bigserial PRIMARY KEY,
  total_count    integer,
  ai_commentary  text,
  top_makers     jsonb,
  waste_items    jsonb,
  generated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE led_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "led_reports_read"  ON led_reports;
DROP POLICY IF EXISTS "led_reports_write" ON led_reports;
CREATE POLICY "led_reports_read"  ON led_reports FOR SELECT USING (true);
CREATE POLICY "led_reports_write" ON led_reports FOR ALL    USING (true) WITH CHECK (true);

-- LED 수집 작업 상태
CREATE TABLE IF NOT EXISTS led_collection_jobs (
  id             bigserial PRIMARY KEY,
  status         text NOT NULL DEFAULT 'IDLE',
  progress       text,
  result_summary jsonb,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE led_collection_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "led_collection_jobs_read"  ON led_collection_jobs;
DROP POLICY IF EXISTS "led_collection_jobs_write" ON led_collection_jobs;
CREATE POLICY "led_collection_jobs_read"  ON led_collection_jobs FOR SELECT USING (true);
CREATE POLICY "led_collection_jobs_write" ON led_collection_jobs FOR ALL    USING (true) WITH CHECK (true);

-- LED 카테고리 (사용자 정의)
CREATE TABLE IF NOT EXISTS led_categories (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  keyword    text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE led_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "led_categories_read"  ON led_categories;
DROP POLICY IF EXISTS "led_categories_write" ON led_categories;
CREATE POLICY "led_categories_read"  ON led_categories FOR SELECT USING (true);
CREATE POLICY "led_categories_write" ON led_categories FOR ALL    USING (true) WITH CHECK (true);

-- 조달: 시장 카테고리 현황 집계
CREATE TABLE IF NOT EXISTS pro_market_overviews (
  id              bigserial PRIMARY KEY,
  category_name   text NOT NULL,
  total_companies integer DEFAULT 0,
  total_products  integer DEFAULT 0,
  min_price       integer,
  median_price    integer,
  avg_efficacy    numeric,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pro_market_overviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro_market_overviews_read"  ON pro_market_overviews;
DROP POLICY IF EXISTS "pro_market_overviews_write" ON pro_market_overviews;
CREATE POLICY "pro_market_overviews_read"  ON pro_market_overviews FOR SELECT USING (true);
CREATE POLICY "pro_market_overviews_write" ON pro_market_overviews FOR ALL    USING (true) WITH CHECK (true);

-- 조달: 변경 이벤트
CREATE TABLE IF NOT EXISTS pro_change_events (
  id           bigserial PRIMARY KEY,
  event_type   text NOT NULL,
  severity     text NOT NULL DEFAULT 'normal',
  product_name text,
  company_name text,
  diff_summary text,
  detected_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_change_events_detected ON pro_change_events (detected_at DESC);

ALTER TABLE pro_change_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro_change_events_read"  ON pro_change_events;
DROP POLICY IF EXISTS "pro_change_events_write" ON pro_change_events;
CREATE POLICY "pro_change_events_read"  ON pro_change_events FOR SELECT USING (true);
CREATE POLICY "pro_change_events_write" ON pro_change_events FOR ALL    USING (true) WITH CHECK (true);
