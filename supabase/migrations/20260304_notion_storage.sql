-- Add file storage columns to bossai_notion_uploads
ALTER TABLE bossai_notion_uploads
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_size bigint;

-- Create public storage bucket for notion uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('notion-uploads', 'notion-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: allow authenticated users to upload
CREATE POLICY "notion_uploads_insert_policy"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'notion-uploads');

-- Storage RLS: allow users to delete their own files (path starts with their user_id)
CREATE POLICY "notion_uploads_delete_policy"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'notion-uploads'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );
