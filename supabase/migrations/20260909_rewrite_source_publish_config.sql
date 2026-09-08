-- 소스 사이트별로 발행 대상 워드프레스 사이트/채널을 다르게 설정할 수 있게 함
-- (예: 위즈데이터센터는 SNS 없이 네이버카페+텀블러만, one.yoosol/yoonfree는
-- aboda.kr로 SNS 전체+카페+텀블러) + 백로그 대신 항상 최신글만 처리하는
-- latest_only 옵션(오래된 글부터 처리하다 최신 이슈를 놓치는 문제 방지)
ALTER TABLE bossai_rewrite_sources
  ADD COLUMN IF NOT EXISTS publish_wp_site_id UUID REFERENCES wordpress_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS publish_sns BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS publish_tumblr BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS latest_only BOOLEAN NOT NULL DEFAULT false;
