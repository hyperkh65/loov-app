import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false });

  const { data } = await supabase
    .from('sns_connections')
    .select('platform_username, platform_user_id, is_active')
    .eq('user_id', user.id)
    .eq('platform', 'youtube')
    .eq('is_active', true)
    .single();

  return NextResponse.json({
    connected: !!data,
    channelName: data?.platform_username || '',
    channelId: data?.platform_user_id || '',
  });
}
