-- ================================================================
-- 상품 상세페이지 빌더 + Figma 연동
-- 2026-03-11
-- ================================================================

CREATE TABLE IF NOT EXISTS bossai_figma_connections (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token  text NOT NULL,
  figma_name    text DEFAULT '',
  figma_email   text DEFAULT '',
  figma_img_url text DEFAULT '',
  is_connected  boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
ALTER TABLE bossai_figma_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "figma_own" ON bossai_figma_connections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS bossai_product_detail_projects (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  product_name     text NOT NULL DEFAULT '',
  product_model    text DEFAULT '',
  product_category text DEFAULT '',
  brand            text DEFAULT '',
  product_info     jsonb DEFAULT '{}',
  template_id      text NOT NULL DEFAULT 'pure-white',
  figma_file_key   text DEFAULT '',
  sections         jsonb NOT NULL DEFAULT '{}',
  exported_html    text DEFAULT '',
  status           text DEFAULT 'draft' CHECK (status IN ('draft','generating','done')),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
ALTER TABLE bossai_product_detail_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "product_detail_own" ON bossai_product_detail_projects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS bossai_product_detail_user_idx
  ON bossai_product_detail_projects(user_id, created_at DESC);
