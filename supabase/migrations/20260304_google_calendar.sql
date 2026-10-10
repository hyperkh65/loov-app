-- bossai_schedule_events에 google_event_id 컬럼 추가
ALTER TABLE public.bossai_schedule_events
  ADD COLUMN IF NOT EXISTS google_event_id text;

CREATE INDEX IF NOT EXISTS idx_bossai_schedule_google
  ON public.bossai_schedule_events(google_event_id)
  WHERE google_event_id IS NOT NULL;
