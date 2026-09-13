-- 키워드 발굴 엔진(황금키워드 점수/등급 산출)을 라이프스타일 전용에서
-- 카테고리별(lifestyle/finance 등)로 나눠 쓰기 위한 컬럼. 기존 user_id+keyword
-- 고유 제약을 찾아서 category까지 포함한 걸로 교체 — 같은 키워드가 카테고리별로
-- 따로 저장될 수 있어야 함(예: "보험"이 lifestyle/finance 양쪽에 존재 가능).
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'bossai_keyword_opportunities'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 2;
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE bossai_keyword_opportunities DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE bossai_keyword_opportunities ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'lifestyle';

ALTER TABLE bossai_keyword_opportunities
  DROP CONSTRAINT IF EXISTS bossai_keyword_opportunities_user_keyword_category_key;
ALTER TABLE bossai_keyword_opportunities
  ADD CONSTRAINT bossai_keyword_opportunities_user_keyword_category_key UNIQUE (user_id, keyword, category);
