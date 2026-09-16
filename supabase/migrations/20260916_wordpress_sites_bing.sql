-- Bing Webmaster Tools 등록 상태 추적 (gsc_status와 같은 패턴)
ALTER TABLE wordpress_sites
  ADD COLUMN IF NOT EXISTS bing_status        text,
  ADD COLUMN IF NOT EXISTS bing_error         text,
  ADD COLUMN IF NOT EXISTS bing_registered_at timestamptz;
