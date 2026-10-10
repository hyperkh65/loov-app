-- bossai_memos v2: 미디어, 핀, 액션아이템, 무드 추가
ALTER TABLE bossai_memos ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT '{}';
ALTER TABLE bossai_memos ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
ALTER TABLE bossai_memos ADD COLUMN IF NOT EXISTS action_items text[] DEFAULT '{}';
ALTER TABLE bossai_memos ADD COLUMN IF NOT EXISTS mood text DEFAULT '';
ALTER TABLE bossai_memos ADD COLUMN IF NOT EXISTS word_count int DEFAULT 0;
ALTER TABLE bossai_memos ADD COLUMN IF NOT EXISTS template text DEFAULT '';

-- Storage 버킷 (Supabase 대시보드에서 수동 생성 필요: memo-media, public)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('memo-media', 'memo-media', true) ON CONFLICT DO NOTHING;
