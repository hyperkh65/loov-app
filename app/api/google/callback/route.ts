import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // user_id
  const error = searchParams.get('error');

  const baseUrl = req.nextUrl.origin;

  if (error || !code || !state) {
    return NextResponse.redirect(`${baseUrl}/dashboard/schedule?google_error=${error || 'cancelled'}`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/google/callback`;

    // 토큰 교환
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

    // 사용자 이메일 가져오기
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    // DB에 저장 (admin client 사용 - RLS 우회)
    const supabase = createAdminClient();
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    await supabase.from('bossai_google_tokens').upsert({
      user_id: state,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      email: userInfo.email,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.redirect(`${baseUrl}/dashboard/schedule?google_connected=1`);
  } catch (err) {
    console.error('Google callback error:', err);
    return NextResponse.redirect(`${baseUrl}/dashboard/schedule?google_error=server_error`);
  }
}
