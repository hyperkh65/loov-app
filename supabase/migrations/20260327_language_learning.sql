-- Language Learning Feature Migration
-- Created: 2026-03-27

CREATE TABLE IF NOT EXISTS public.language_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  word TEXT NOT NULL,
  translation TEXT NOT NULL,
  pronunciation TEXT,
  example TEXT,
  context TEXT, -- sentence where the word appeared
  level INTEGER DEFAULT 0, -- 0=new, 1=learning, 2=known
  next_review TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, language, word)
);

ALTER TABLE public.language_vocabulary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vocab_owner" ON public.language_vocabulary
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.language_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  mode TEXT NOT NULL,
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.language_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_owner" ON public.language_sessions
  FOR ALL USING (auth.uid() = user_id);
