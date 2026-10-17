-- 숏폼 딸깍(맥 앱) 영상 현황: 만든 영상 / 예약 / 업로드 / 실패
CREATE TABLE IF NOT EXISTS public.shorts_jobs (
  id           TEXT PRIMARY KEY,                       -- 딸깍 작업ID_클립번호 (수동 업로드는 manual_<videoId>)
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT,
  phrase       TEXT,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','scheduled','uploading','uploaded','failed')),
  source       TEXT NOT NULL DEFAULT 'ddalkkak',       -- ddalkkak | manual
  scheduled_at TIMESTAMPTZ,
  uploaded_at  TIMESTAMPTZ,
  video_id     TEXT,
  video_url    TEXT,
  error        TEXT,
  thumb        TEXT,                                   -- 작은 JPEG data URL (업로드 전 미리보기)
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shorts_jobs_user_status ON public.shorts_jobs (user_id, status, created_at DESC);
ALTER TABLE public.shorts_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shorts_jobs_owner" ON public.shorts_jobs;
CREATE POLICY "shorts_jobs_owner" ON public.shorts_jobs FOR ALL USING (auth.uid() = user_id);
