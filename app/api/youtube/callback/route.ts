import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state');
  const error = searchParams.get('error');
  // req.nextUrl.origin은 리버스 프록시 뒤에서 도커 컨테이너 내부 호스트명으로
  // 잘못 해석되는 게 실측 확인됨(구글 invalid_request의 실제 원인) — 사용자에게
  // 돌려보내는 URL과 토큰교환 redirect_uri 둘 다 공개 도메인 env로 고정해야 함.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  // state format: "userId:returnPath" or legacy "userId"
  const colonIdx = stateRaw?.indexOf(':') ?? -1;
  const state = colonIdx > 0 ? stateRaw!.substring(0, colonIdx) : stateRaw;
  const returnPath = colonIdx > 0 ? stateRaw!.substring(colonIdx + 1) : '/dashboard/insta-service';
  const returnUrl = `${baseUrl}${returnPath}${returnPath.includes('?') ? '&' : '?'}youtube`;

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

    // 기존 YouTube 연결 삭제 후 새로 저장 (upsert 충돌 방지)
    await supabase.from('sns_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', 'youtube');

    const { error: insertError } = await supabase.from('sns_connections').insert({
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
    });

    if (insertError) throw new Error('DB 저장 실패: ' + insertError.message);

    const successUrl = `${baseUrl}${returnPath}${returnPath.includes('?') ? '&' : '?'}yt_connected=1`;
    return NextResponse.redirect(successUrl);
  } catch (err) {
    return NextResponse.redirect(`${returnUrl}_error=${encodeURIComponent(String(err))}`);
  }
}
