-- coupang_auto/toss_auto/blog_auto 크로스포스팅이 서로 조율 없이 각자
-- @2days.kr 계열 계정에 발행해서 같은 계정에 글이 몰리던 문제 — 실제 발행
-- 시각을 플랫폼별 공용으로 기록해서 lib/sns/account-rotation.ts가 "가장
-- 오래 전에 쓴 계정" 우선으로 로테이션 + 최소 간격 판단에 쓴다.
CREATE TABLE IF NOT EXISTS bossai_sns_post_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  platform_user_id text NOT NULL,
  posted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sns_post_log_lookup ON bossai_sns_post_log (platform, platform_user_id, posted_at DESC);
