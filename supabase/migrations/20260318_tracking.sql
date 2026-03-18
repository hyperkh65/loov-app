CREATE TABLE IF NOT EXISTS bossai_tracking_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy REAL,
  altitude REAL,
  speed REAL,
  heading REAL,
  session_id TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON bossai_tracking_locations (user_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS bossai_tracking_voice_memos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  nas_path TEXT NOT NULL,
  transcript TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  duration_sec INT,
  ai_provider TEXT DEFAULT 'gemini',
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
