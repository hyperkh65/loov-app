import { createClient } from '@supabase/supabase-js';

// 영상 수집 도구 전용 Supabase 프로젝트 (LOOV 본 DB와 분리)
export function videoDb() {
  const url = process.env.VIDEO_SUPABASE_URL;
  const key = process.env.VIDEO_SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('VIDEO_SUPABASE_URL / VIDEO_SUPABASE_SERVICE_KEY 미설정');
  return createClient(url, key, { auth: { persistSession: false } });
}
