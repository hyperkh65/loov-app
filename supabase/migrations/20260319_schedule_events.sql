CREATE TABLE IF NOT EXISTS bossai_schedule_events (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  time TEXT,
  end_time TEXT,
  type TEXT DEFAULT 'other',
  assigned_employee_ids JSONB DEFAULT '[]'::jsonb,
  is_all_day BOOLEAN DEFAULT false,
  color TEXT,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON bossai_schedule_events (user_id, date);
