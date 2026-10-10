-- 쿠팡 파트너스 발행 히스토리 테이블
CREATE TABLE IF NOT EXISTS coupang_post_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_name text NOT NULL DEFAULT '',
  product_url text NOT NULL DEFAULT '',
  affiliate_url text NOT NULL DEFAULT '',
  image_urls text[] DEFAULT '{}',
  first_review text DEFAULT '',
  platforms text[] DEFAULT '{}',
  generated_content jsonb DEFAULT '{}',
  post_ids jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE coupang_post_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coupang_history_own"
  ON coupang_post_history
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
