-- SNS 미디어 Storage 버킷 생성 + RLS 정책 설정
-- Supabase SQL Editor에서 실행하세요

-- 1. sns-media 버킷 생성 (이미 있으면 무시)
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'sns-media',
  'sns-media',
  true,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime'],
  52428800  -- 50MB
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      file_size_limit = EXCLUDED.file_size_limit;

-- 2. 기존 정책 제거 (중복 방지)
DROP POLICY IF EXISTS "sns_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "sns_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "sns_media_delete" ON storage.objects;

-- 3. 인증 사용자 업로드 정책 (자신의 폴더에만)
CREATE POLICY "sns_media_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sns-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. 공개 읽기 정책
CREATE POLICY "sns_media_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'sns-media');

-- 5. 본인 파일 삭제 정책
CREATE POLICY "sns_media_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'sns-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
