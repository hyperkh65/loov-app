-- ============================================================
-- BOSS.AI — SNS 연동 테이블
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- ── SNS 계정 연결 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sns_connections (
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform              TEXT NOT NULL CHECK (platform IN ('twitter', 'threads', 'facebook')),
  access_token          TEXT NOT NULL,
  refresh_token         TEXT,
  token_expires_at      TIMESTAMPTZ,
  platform_user_id      TEXT NOT NULL,
  platform_username     TEXT NOT NULL,
  platform_display_name TEXT NOT NULL,
  platform_avatar       TEXT,
  is_active             BOOLEAN DEFAULT true,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, platform)
);
ALTER TABLE public.sns_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sns_connections_owner" ON public.sns_connections
  FOR ALL USING (auth.uid() = user_id);

-- ── SNS 포스트 템플릿 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sns_post_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.sns_post_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sns_templates_owner" ON public.sns_post_templates
  FOR ALL USING (auth.uid() = user_id);

-- ── SNS 발행 로그 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sns_post_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id      UUID REFERENCES public.sns_post_templates(id) ON DELETE SET NULL,
  platform         TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  platform_post_id TEXT,
  error_message    TEXT,
  posted_at        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.sns_post_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sns_logs_owner" ON public.sns_post_logs
  FOR ALL USING (auth.uid() = user_id);

-- ── OAuth 임시 상태 저장 (10분 TTL) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.sns_oauth_state (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  state         TEXT NOT NULL UNIQUE,
  code_verifier TEXT,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.sns_oauth_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sns_oauth_state_owner" ON public.sns_oauth_state
  FOR ALL USING (auth.uid() = user_id);

-- ── SNS 예약 발행 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sns_schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id  UUID NOT NULL REFERENCES public.sns_post_templates(id) ON DELETE CASCADE,
  platforms    TEXT[] NOT NULL,
  start_at     TIMESTAMPTZ NOT NULL,
  next_post_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.sns_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sns_schedules_owner" ON public.sns_schedules
  FOR ALL USING (auth.uid() = user_id);
