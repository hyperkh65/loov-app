-- WordPress 본문 이미지용 Supabase Storage 버킷
INSERT INTO storage.buckets (id, name, public)
VALUES ('wordpress-images', 'wordpress-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "wp_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "wp_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "wp_images_delete" ON storage.objects;

CREATE POLICY "wp_images_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wordpress-images');

CREATE POLICY "wp_images_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'wordpress-images');

CREATE POLICY "wp_images_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'wordpress-images' AND auth.uid()::text = (storage.foldername(name))[1]);
