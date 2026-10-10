-- 쿠팡/무신사/토스 제휴 콘텐츠가 raw 제휴 URL을 그대로 노출하고 끝나서 클릭
-- 추적이 전혀 없던 문제 — 자체 리다이렉트(/go/{id})를 거치게 해서 1st-party로
-- 클릭을 기록한다. platform/카테고리/채널/앵글별로 뭐가 실제 클릭으로
-- 이어지는지 나중에 비교하기 위한 최소 스키마(bossai_naver_tech_posts,
-- bossai_toss_posts와 동일하게 RLS 없이 서버 admin client 전용).
CREATE TABLE IF NOT EXISTS bossai_affiliate_go_links (
  id               text        PRIMARY KEY,          -- 8자 base62 랜덤
  platform         text        NOT NULL,              -- 'coupang' | 'musinsa' | 'toss'
  network_product_id text,
  product_name     text,
  destination_url  text        NOT NULL,              -- 실제 제휴 URL
  schedule_id      uuid,
  content_channel  text,                              -- 'sns_comment' | 'wordpress_cta'
  sns_platform     text,                              -- 'threads' | 'instagram' | 'facebook' | 'twitter' | 'wordpress'
  content_angle    text,                              -- 'discount' | 'compare' | 'review' | 'use_case'
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_go_links_platform_product ON bossai_affiliate_go_links (platform, network_product_id);
CREATE INDEX IF NOT EXISTS idx_go_links_created_at ON bossai_affiliate_go_links (created_at DESC);

CREATE TABLE IF NOT EXISTS bossai_affiliate_click_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  go_link_id   text        REFERENCES bossai_affiliate_go_links(id),
  clicked_at   timestamptz DEFAULT now(),
  referrer     text,
  device_type  text,                                  -- mobile/desktop/unknown (UA 파싱)
  ip_hash      text                                    -- sha256(ip) — 원본 IP 미저장
);

CREATE INDEX IF NOT EXISTS idx_click_events_go_link_id ON bossai_affiliate_click_events (go_link_id);
CREATE INDEX IF NOT EXISTS idx_click_events_clicked_at ON bossai_affiliate_click_events (clicked_at DESC);

-- 쿠팡/무신사 상품 하루 1회 가격 스냅샷 — "어제보다 –12%" 같은 진짜 데이터 기반
-- 긴급성 문구를 만들기 위한 최소 이력(스펙의 전체 Change Detector는 불필요,
-- 가격 한 컬럼만 하루 단위로 쌓으면 충분).
CREATE TABLE IF NOT EXISTS bossai_affiliate_price_snapshots (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            text        NOT NULL,           -- 'coupang' | 'musinsa'
  network_product_id  text        NOT NULL,
  price               integer     NOT NULL,
  snapshot_date        date        NOT NULL DEFAULT current_date,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (platform, network_product_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_product ON bossai_affiliate_price_snapshots (platform, network_product_id, snapshot_date DESC);
