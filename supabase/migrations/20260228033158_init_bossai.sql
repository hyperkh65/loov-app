-- ============================================================
-- BOSS.AI — Supabase Schema (bossai_ 접두어)
-- 기존 DB와 충돌 없이 bossai_ 네임스페이스 분리
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- UUID 확장 (이미 있으면 무시)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 사용자 프로필 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT UNIQUE NOT NULL,
  display_name      TEXT,
  avatar_url        TEXT,
  subscription_tier TEXT DEFAULT 'free'
                    CHECK (subscription_tier IN ('free','basic','starter','professional','enterprise')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 회사 설정 (사용자당 1개) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_company_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.bossai_profiles(id) ON DELETE CASCADE UNIQUE,
  company_name     TEXT DEFAULT 'My Company',
  slogan           TEXT,
  ceo_name         TEXT,
  industry         TEXT,
  website          TEXT,
  business_number  TEXT,
  address          TEXT,
  phone            TEXT,
  email            TEXT,
  instagram        TEXT,
  twitter          TEXT,
  linkedin         TEXT,
  facebook         TEXT,
  youtube          TEXT,
  tiktok           TEXT,
  kakao            TEXT,
  target_audience  TEXT,
  brand_tone       TEXT,
  hashtags         TEXT,
  ad_budget        TEXT,
  global_ai_provider TEXT,
  global_ai_model    TEXT,
  subscription_tier  TEXT DEFAULT 'free',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── AI 직원 ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_employees (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.bossai_profiles(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  animal               TEXT NOT NULL
                       CHECK (animal IN ('pig','cat','rabbit','fox','otter','tiger','deer','elephant','monkey')),
  role                 TEXT NOT NULL,
  department           TEXT NOT NULL,
  hired_at             TIMESTAMPTZ DEFAULT NOW(),
  status               TEXT DEFAULT 'active' CHECK (status IN ('active','busy','offline')),
  skills               TEXT[] DEFAULT '{}',
  task_count           INTEGER DEFAULT 0,
  completed_task_count INTEGER DEFAULT 0,
  ai_provider          TEXT,
  ai_model             TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── 채팅 메시지 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_direct_chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.bossai_profiles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.bossai_employees(id) ON DELETE CASCADE,
  from_role   TEXT NOT NULL,  -- 'user' or employee id
  content     TEXT NOT NULL,
  timestamp   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bossai_chats_employee ON public.bossai_direct_chats(employee_id);
CREATE INDEX IF NOT EXISTS idx_bossai_chats_user     ON public.bossai_direct_chats(user_id);

-- ── 회의 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_meetings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.bossai_profiles(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  participant_ids UUID[],
  scheduled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bossai_meeting_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.bossai_meetings(id) ON DELETE CASCADE,
  from_id    TEXT NOT NULL,
  from_name  TEXT NOT NULL,
  content    TEXT NOT NULL,
  timestamp  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 프로젝트 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_projects (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.bossai_profiles(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  color_key             TEXT DEFAULT 'indigo',
  assigned_employee_ids UUID[],
  status                TEXT DEFAULT 'planning'
                        CHECK (status IN ('planning','active','done')),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── CEO 지시사항 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_directives (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.bossai_profiles(id) ON DELETE CASCADE,
  title                TEXT,
  content              TEXT NOT NULL,
  target_employee_ids  UUID[],
  target_department    TEXT,
  priority             TEXT DEFAULT 'medium'
                       CHECK (priority IN ('low','medium','high','urgent')),
  status               TEXT DEFAULT 'pending'
                       CHECK (status IN ('pending','acknowledged','in_progress','completed')),
  deadline             DATE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bossai_directive_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id  UUID NOT NULL REFERENCES public.bossai_directives(id) ON DELETE CASCADE,
  employee_id   UUID,
  employee_name TEXT NOT NULL,
  content       TEXT NOT NULL,
  timestamp     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 영업 ERP ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_sales_leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.bossai_profiles(id) ON DELETE CASCADE,
  company_name         TEXT NOT NULL,
  contact_name         TEXT,
  contact_email        TEXT,
  phone                TEXT,
  status               TEXT DEFAULT 'lead'
                       CHECK (status IN ('lead','contacted','proposal','negotiating','won','lost')),
  value                BIGINT DEFAULT 0,
  assigned_employee_id UUID,
  notes                TEXT,
  closed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bossai_leads_user   ON public.bossai_sales_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_bossai_leads_status ON public.bossai_sales_leads(status);

-- ── 회계 ERP ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_accounting_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.bossai_profiles(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL CHECK (type IN ('income','expense')),
  category             TEXT NOT NULL,
  description          TEXT NOT NULL,
  amount               BIGINT NOT NULL,
  date                 DATE NOT NULL,
  assigned_employee_id UUID,
  invoice_number       TEXT,
  is_recurring         BOOLEAN DEFAULT FALSE,
  tags                 TEXT[] DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bossai_accounting_user ON public.bossai_accounting_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_bossai_accounting_date ON public.bossai_accounting_entries(date);

-- ── 마케팅 캠페인 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_marketing_campaigns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES public.bossai_profiles(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  platform             TEXT NOT NULL
                       CHECK (platform IN ('instagram','twitter','linkedin','facebook','youtube','tiktok','blog','email','kakao')),
  status               TEXT DEFAULT 'draft'
                       CHECK (status IN ('draft','scheduled','active','paused','completed')),
  start_date           DATE,
  end_date             DATE,
  budget               BIGINT,
  content              TEXT,
  target_audience      TEXT,
  assigned_employee_id UUID,
  impressions          BIGINT,
  clicks               BIGINT,
  conversions          BIGINT,
  spend                BIGINT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── 스케줄 이벤트 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_schedule_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.bossai_profiles(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  date                  DATE NOT NULL,
  time                  TIME,
  end_time              TIME,
  type                  TEXT DEFAULT 'other'
                        CHECK (type IN ('meeting','deadline','call','review','task','other')),
  assigned_employee_ids UUID[],
  is_all_day            BOOLEAN DEFAULT FALSE,
  color                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bossai_schedule_user ON public.bossai_schedule_events(user_id);
CREATE INDEX IF NOT EXISTS idx_bossai_schedule_date ON public.bossai_schedule_events(date);

-- ── 일일 보고서 ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bossai_daily_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.bossai_profiles(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  content      TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE public.bossai_profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_company_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_employees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_direct_chats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_meetings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_meeting_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_directives           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_directive_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_sales_leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_accounting_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_marketing_campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_schedule_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bossai_daily_reports        ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 자신의 데이터만 접근 가능
CREATE POLICY "bossai_own_profiles"    ON public.bossai_profiles             FOR ALL USING (auth.uid() = id);
CREATE POLICY "bossai_own_company"     ON public.bossai_company_settings     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bossai_own_employees"   ON public.bossai_employees            FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bossai_own_chats"       ON public.bossai_direct_chats         FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bossai_own_meetings"    ON public.bossai_meetings              FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bossai_own_projects"    ON public.bossai_projects              FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bossai_own_directives"  ON public.bossai_directives            FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bossai_own_leads"       ON public.bossai_sales_leads           FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bossai_own_accounting"  ON public.bossai_accounting_entries    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bossai_own_campaigns"   ON public.bossai_marketing_campaigns   FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bossai_own_schedule"    ON public.bossai_schedule_events       FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "bossai_own_reports"     ON public.bossai_daily_reports         FOR ALL USING (auth.uid() = user_id);

-- meeting_messages: meeting 소유자만
CREATE POLICY "bossai_own_meeting_msgs" ON public.bossai_meeting_messages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.bossai_meetings m
    WHERE m.id = meeting_id AND m.user_id = auth.uid()
  ));

-- directive_responses: directive 소유자만
CREATE POLICY "bossai_own_directive_resp" ON public.bossai_directive_responses FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.bossai_directives d
    WHERE d.id = directive_id AND d.user_id = auth.uid()
  ));

-- ============================================================
-- 신규 회원가입 시 프로필 자동 생성 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_bossai_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.bossai_profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.bossai_company_settings (user_id, company_name)
  VALUES (NEW.id, 'My Company')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 기존 트리거 있으면 제거 후 재생성
DROP TRIGGER IF EXISTS on_bossai_auth_user_created ON auth.users;
CREATE TRIGGER on_bossai_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_bossai_user();

-- ============================================================
-- updated_at 자동 갱신
-- ============================================================
CREATE OR REPLACE FUNCTION update_bossai_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bossai_updated_at_profiles
  BEFORE UPDATE ON public.bossai_profiles
  FOR EACH ROW EXECUTE FUNCTION update_bossai_updated_at();

CREATE TRIGGER bossai_updated_at_company
  BEFORE UPDATE ON public.bossai_company_settings
  FOR EACH ROW EXECUTE FUNCTION update_bossai_updated_at();

CREATE TRIGGER bossai_updated_at_employees
  BEFORE UPDATE ON public.bossai_employees
  FOR EACH ROW EXECUTE FUNCTION update_bossai_updated_at();

CREATE TRIGGER bossai_updated_at_projects
  BEFORE UPDATE ON public.bossai_projects
  FOR EACH ROW EXECUTE FUNCTION update_bossai_updated_at();

CREATE TRIGGER bossai_updated_at_directives
  BEFORE UPDATE ON public.bossai_directives
  FOR EACH ROW EXECUTE FUNCTION update_bossai_updated_at();

CREATE TRIGGER bossai_updated_at_leads
  BEFORE UPDATE ON public.bossai_sales_leads
  FOR EACH ROW EXECUTE FUNCTION update_bossai_updated_at();

CREATE TRIGGER bossai_updated_at_campaigns
  BEFORE UPDATE ON public.bossai_marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_bossai_updated_at();
