-- 갤러리 아이템 테이블
CREATE TABLE IF NOT EXISTS gallery_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL DEFAULT 'personal'   CHECK (category IN ('personal','work','secret')),
  title         TEXT NOT NULL DEFAULT '',
  memo          TEXT NOT NULL DEFAULT '',
  image_url     TEXT,
  notion_page_id  TEXT NOT NULL DEFAULT '',
  notion_page_url TEXT NOT NULL DEFAULT '',
  tags          TEXT[] NOT NULL DEFAULT '{}',
  is_favorite   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gallery_items_owner" ON gallery_items
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_gallery_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER gallery_items_updated_at
  BEFORE UPDATE ON gallery_items
  FOR EACH ROW EXECUTE FUNCTION update_gallery_updated_at();

-- Supabase Storage bucket (갤러리 이미지)
INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery', 'gallery', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "gallery_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gallery' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "gallery_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'gallery');

CREATE POLICY "gallery_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'gallery' AND (storage.foldername(name))[1] = auth.uid()::text);
