-- SNS 미디어 + 댓글 기능 마이그레이션

-- 1. 템플릿에 미디어 URL 컬럼 추가
ALTER TABLE sns_post_templates
  ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT '{}';

-- 2. 발행 로그에 미디어 URL + platform_post_id 컬럼 추가
ALTER TABLE sns_post_logs
  ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS platform_post_id text;

-- 3. Supabase Storage 버킷 (대시보드에서 수동 생성 필요)
-- 버킷 이름: sns-media
-- Public 설정: true (공개 URL 필요)
-- 허용 파일 형식: image/jpeg, image/png, image/gif, image/webp, video/mp4, video/quicktime
-- 최대 파일 크기: 50MB

-- 4. Storage 버킷 정책 (대시보드 > Storage > sns-media > Policies)
-- INSERT 정책: (auth.uid()::text = (storage.foldername(name))[1])
-- SELECT 정책: true (공개 읽기)
