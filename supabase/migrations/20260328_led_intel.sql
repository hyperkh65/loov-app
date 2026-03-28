-- LED Intelligence tables migration
-- Corresponds to hyperkh65/loov repo LED market intelligence features

-- NOTE: LED 시장 분석 데이터는 Notion에 저장 (Supabase 테이블 불필요)
-- Notion DB ID는 bossai_company_settings.notion_config.ledMarketDbId 에 저장됩니다

-- LED products (collected from Danawa via GitHub Actions scraper)
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

CREATE INDEX IF NOT EXISTS idx_led_products_category ON led_products (category);
CREATE INDEX IF NOT EXISTS idx_led_products_maker    ON led_products (maker);
CREATE INDEX IF NOT EXISTS idx_led_products_price    ON led_products (price);
CREATE INDEX IF NOT EXISTS idx_led_products_collected ON led_products (collected_at DESC);

ALTER TABLE led_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "led_products_read" ON led_products;
CREATE POLICY "led_products_read" ON led_products FOR SELECT USING (true);
DROP POLICY IF EXISTS "led_products_write" ON led_products;
CREATE POLICY "led_products_write" ON led_products FOR ALL USING (true) WITH CHECK (true);

-- LED price history
CREATE TABLE IF NOT EXISTS led_price_history (
  id          bigserial PRIMARY KEY,
  product_id  bigint REFERENCES led_products(id) ON DELETE CASCADE,
  external_id text,
  price       integer NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_led_price_history_product ON led_price_history (product_id, recorded_at DESC);

ALTER TABLE led_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "led_price_history_read" ON led_price_history;
CREATE POLICY "led_price_history_read" ON led_price_history FOR SELECT USING (true);
DROP POLICY IF EXISTS "led_price_history_write" ON led_price_history;
CREATE POLICY "led_price_history_write" ON led_price_history FOR ALL USING (true) WITH CHECK (true);

-- LED AI reports (daily summaries)
CREATE TABLE IF NOT EXISTS led_reports (
  id              bigserial PRIMARY KEY,
  total_count     integer,
  ai_commentary   text,
  top_makers      jsonb,
  waste_items     jsonb,
  generated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE led_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "led_reports_read" ON led_reports;
CREATE POLICY "led_reports_read" ON led_reports FOR SELECT USING (true);
DROP POLICY IF EXISTS "led_reports_write" ON led_reports;
CREATE POLICY "led_reports_write" ON led_reports FOR ALL USING (true) WITH CHECK (true);

-- LED collection jobs
CREATE TABLE IF NOT EXISTS led_collection_jobs (
  id             bigserial PRIMARY KEY,
  status         text NOT NULL DEFAULT 'IDLE',  -- IDLE | RUNNING | COMPLETED | FAILED
  progress       text,
  result_summary jsonb,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE led_collection_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "led_collection_jobs_read" ON led_collection_jobs;
CREATE POLICY "led_collection_jobs_read" ON led_collection_jobs FOR SELECT USING (true);
DROP POLICY IF EXISTS "led_collection_jobs_write" ON led_collection_jobs;
CREATE POLICY "led_collection_jobs_write" ON led_collection_jobs FOR ALL USING (true) WITH CHECK (true);

-- LED categories (custom)
CREATE TABLE IF NOT EXISTS led_categories (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  keyword    text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE led_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "led_categories_read" ON led_categories;
CREATE POLICY "led_categories_read" ON led_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "led_categories_write" ON led_categories;
CREATE POLICY "led_categories_write" ON led_categories FOR ALL USING (true) WITH CHECK (true);

-- Procurement: market overviews (aggregated category stats)
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
DROP POLICY IF EXISTS "pro_market_overviews_read" ON pro_market_overviews;
CREATE POLICY "pro_market_overviews_read" ON pro_market_overviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "pro_market_overviews_write" ON pro_market_overviews;
CREATE POLICY "pro_market_overviews_write" ON pro_market_overviews FOR ALL USING (true) WITH CHECK (true);

-- Procurement: change events
CREATE TABLE IF NOT EXISTS pro_change_events (
  id           bigserial PRIMARY KEY,
  event_type   text NOT NULL,  -- price_change | spec_change | cert_change | new_product | status_change
  severity     text NOT NULL DEFAULT 'normal',  -- normal | high
  product_name text,
  company_name text,
  diff_summary text,
  detected_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_change_events_detected ON pro_change_events (detected_at DESC);

ALTER TABLE pro_change_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pro_change_events_read" ON pro_change_events;
CREATE POLICY "pro_change_events_read" ON pro_change_events FOR SELECT USING (true);
DROP POLICY IF EXISTS "pro_change_events_write" ON pro_change_events;
CREATE POLICY "pro_change_events_write" ON pro_change_events FOR ALL USING (true) WITH CHECK (true);
