import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('bossai_google_tokens')
    .select('email, expires_at, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return NextResponse.json({ connected: false });

  const hasClientId = !!process.env.GOOGLE_CLIENT_ID;

  return NextResponse.json({
    connected: true,
    email: data.email,
    expiresAt: data.expires_at,
    updatedAt: data.updated_at,
    oauthConfigured: hasClientId,
  });
}
