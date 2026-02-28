import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { Platform, PLATFORMS } from '@/lib/sns/platforms';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://loov.co.kr';
  const returnUrl = `${siteUrl}/dashboard/sns`;

  if (error) return NextResponse.redirect(`${returnUrl}&error=${encodeURIComponent(error)}`);
  if (!code || !state) return NextResponse.redirect(`${returnUrl}&error=invalid_response`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl}/login`);

  const admin = createAdminClient();

  // State 검증
  const { data: oauthState, error: stateErr } = await admin
    .from('sns_oauth_state')
    .select('*')
    .eq('state', state)
    .eq('user_id', user.id)
    .eq('platform', platform)
    .gte('expires_at', new Date().toISOString())
    .single();

  if (stateErr || !oauthState) return NextResponse.redirect(`${returnUrl}&error=state_mismatch`);
  await admin.from('sns_oauth_state').delete().eq('id', oauthState.id);

  const config = PLATFORMS[platform as Platform];
  const redirectUri = `${siteUrl}/api/sns/callback/${platform}`;

  try {
    let accessToken: string;
    let refreshToken: string | null = null;
    let expiresIn: number | null = null;
    let platformUserId: string;
    let platformUsername: string;
    let platformDisplayName: string;
    let platformAvatar: string | null = null;

    switch (platform) {
      case 'twitter': {
        const creds = Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64');
        const tokenRes = await fetch(config.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}` },
          body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: process.env.TWITTER_CLIENT_ID!, redirect_uri: redirectUri, code_verifier: oauthState.code_verifier! }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) throw new Error(JSON.stringify(tokenData));
        accessToken = tokenData.access_token;
        refreshToken = tokenData.refresh_token || null;
        expiresIn = tokenData.expires_in || null;
        const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,name', { headers: { Authorization: `Bearer ${accessToken}` } });
        const userData = await userRes.json();
        platformUserId = userData.data.id;
        platformUsername = `@${userData.data.username}`;
        platformDisplayName = userData.data.name;
        platformAvatar = userData.data.profile_image_url || null;
        break;
      }
      case 'threads': {
        const tokenRes = await fetch(config.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: process.env.THREADS_APP_ID!, client_secret: process.env.THREADS_APP_SECRET!, code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) throw new Error(JSON.stringify(tokenData));
        const shortToken = tokenData.access_token;
        const ltRes = await fetch(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${process.env.THREADS_APP_SECRET}&access_token=${shortToken}`);
        const ltData = await ltRes.json();
        accessToken = ltData.access_token || shortToken;
        expiresIn = ltData.expires_in || null;
        const userRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url&access_token=${accessToken}`);
        const userData = await userRes.json();
        if (!userRes.ok || userData.error) throw new Error(`Threads 사용자 정보 실패: ${JSON.stringify(userData)}`);
        platformUserId = userData.id;
        platformUsername = `@${userData.username}`;
        platformDisplayName = userData.name || userData.username;
        platformAvatar = userData.threads_profile_picture_url || null;
        break;
      }
      case 'facebook': {
        const tokenRes = await fetch(`${config.tokenUrl}?client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`);
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || tokenData.error) throw new Error(JSON.stringify(tokenData));
        accessToken = tokenData.access_token;
        expiresIn = tokenData.expires_in || null;
        const userRes = await fetch(`https://graph.facebook.com/v18.0/me?fields=id,name,picture&access_token=${accessToken}`);
        const userData = await userRes.json();
        platformUserId = userData.id;
        platformUsername = userData.name;
        platformDisplayName = userData.name;
        platformAvatar = userData.picture?.data?.url || null;
        break;
      }
      default:
        return NextResponse.redirect(`${returnUrl}&error=unsupported_platform`);
    }

    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    await admin.from('sns_connections').upsert({
      user_id: user.id, platform, access_token: accessToken, refresh_token: refreshToken,
      token_expires_at: expiresAt, platform_user_id: platformUserId, platform_username: platformUsername,
      platform_display_name: platformDisplayName, platform_avatar: platformAvatar,
      is_active: true, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform' });

    return NextResponse.redirect(`${returnUrl}&connected=${platform}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[SNS Callback] ${platform}:`, message);
    return NextResponse.redirect(`${returnUrl}&error=${encodeURIComponent(message)}`);
  }
}
