import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { readMonglePost } from '@/lib/mongle-posts';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data, error } = await supabase.from('shorts_jobs')
    .select('id, title, phrase, description, status, source, scheduled_at, uploaded_at, video_id, video_url, error, thumb, created_at, updated_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data || []).map(r => r.id.startsWith('hold_mongle_') ? { ...r, post: readMonglePost(r.id) } : r));
}
