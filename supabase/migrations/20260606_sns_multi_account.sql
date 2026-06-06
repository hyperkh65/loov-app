-- 1. PK를 (user_id, platform, platform_user_id)로 변경해서 다중 계정 허용
ALTER TABLE public.sns_connections DROP CONSTRAINT IF EXISTS sns_connections_pkey;
ALTER TABLE public.sns_connections ADD PRIMARY KEY (user_id, platform, platform_user_id);
