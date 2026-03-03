import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data } = await supabase
    .from('sns_post_logs')
    .select('*, sns_post_templates(title)')
    .eq('user_id', user.id)
    .order('posted_at', { ascending: false })
    .limit(50);

  return NextResponse.json(data || []);
}
