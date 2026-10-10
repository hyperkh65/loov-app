-- sns_connections: youtube, instagram 플랫폼 추가
-- 1. CHECK 제약 제거 후 재생성 (youtube, instagram 포함)
ALTER TABLE public.sns_connections DROP CONSTRAINT IF EXISTS sns_connections_platform_check;
ALTER TABLE public.sns_connections ADD CONSTRAINT sns_connections_platform_check
  CHECK (platform IN ('twitter', 'threads', 'facebook', 'youtube', 'instagram'));

-- 2. platform_display_name NOT NULL → nullable (YouTube는 제공 안 함)
ALTER TABLE public.sns_connections ALTER COLUMN platform_display_name DROP NOT NULL;

-- 3. connected_at, extra 컬럼 추가 (YouTube callback에서 사용)
ALTER TABLE public.sns_connections ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sns_connections ADD COLUMN IF NOT EXISTS extra JSONB;
