import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const baseUrl = req.nextUrl.origin;
  const returnUrl = `${baseUrl}/dashboard/insta-service?youtube`;

  if (error || !code || !state) {
    return NextResponse.redirect(`${returnUrl}_error=${error || 'cancelled'}`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${baseUrl}/api/youtube/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Token exchange failed');

    // Get channel info
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];
    const channelId = channel?.id || '';
    const channelName = channel?.snippet?.title || 'YouTube Channel';

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== state) {
      return NextResponse.redirect(`${returnUrl}_error=auth_mismatch`);
    }

    const { error: upsertError } = await supabase.from('sns_connections').upsert({
      user_id: user.id,
      platform: 'youtube',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      platform_user_id: channelId,
      platform_username: channelName,
      is_active: true,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      extra: { expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString() },
    }, { onConflict: 'user_id,platform' });

    if (upsertError) throw new Error('DB 저장 실패: ' + upsertError.message);

    return NextResponse.redirect(`${returnUrl}_connected=1`);
  } catch (err) {
    return NextResponse.redirect(`${returnUrl}_error=${encodeURIComponent(String(err))}`);
  }
}
