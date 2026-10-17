import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase.from('sns_post_logs').select('id, platform_post_id, posted_at, error_message')
    .eq('user_id', user.id).eq('platform', 'shorts-inbox').order('posted_at', { ascending: false }).limit(100);
  return NextResponse.json((data || []).map(({ error_message, ...r }) => {
    let meta = {}; try { meta = JSON.parse(error_message || '{}'); } catch {}
    return { ...r, meta };
  }));
}
