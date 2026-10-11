-- sns_connections: telegram, bluesky(토큰 직접 입력 방식) 등 신규 플랫폼 허용 — 플랫폼 CHECK 제약 제거
ALTER TABLE public.sns_connections DROP CONSTRAINT IF EXISTS sns_connections_platform_check;
