import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { Platform } from '@/lib/sns/platforms';
import { getSetting } from '@/lib/get-setting';

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
  const returnTo = req.cookies.get('sns_return_to')?.value || '';
  const returnUrl = returnTo ? `${siteUrl}${returnTo}` : `${siteUrl}/dashboard/sns`;

  const clearReturnCookie = (res: NextResponse) => {
    if (returnTo) res.cookies.set('sns_return_to', '', { maxAge: 0, path: '/' });
    return res;
  };

  if (error) return clearReturnCookie(NextResponse.redirect(`${returnUrl}?error=${encodeURIComponent(error)}`));
  if (!code || !state) return clearReturnCookie(NextResponse.redirect(`${returnUrl}?error=invalid_response`));

  // Admin client 사용 - 세션 없이도 state로 user_id 조회 가능
  const supabase = createAdminClient();

  // State 검증 (user_id는 state에서 조회)
  const { data: oauthState, error: stateErr } = await supabase
    .from('sns_oauth_state')
    .select('*')
    .eq('state', state)
    .eq('platform', platform)
    .single();

  if (stateErr || !oauthState) {
    console.error('[SNS Callback] state_mismatch:', stateErr?.message);
    return NextResponse.redirect(`${returnUrl}?error=${encodeURIComponent('state_mismatch: ' + (stateErr?.message || 'not found'))}`);
  }

  const userId = oauthState.user_id;
  await supabase.from('sns_oauth_state').delete().eq('id', oauthState.id);

  const redirectUri = `${siteUrl}/api/sns/callback/${platform}`;

  try {
    let accessToken: string;
    let refreshToken: string | null = null;
    let expiresIn: number | null = null;
    let platformUserId: string;
    let platformUsername: string;
    let platformDisplayName: string;
    let platformAvatar: string | null = null;

    // DB 설정 → 환경변수 순으로 Twitter 키 읽기
    const [dbTwClientId, dbTwClientSecret] = await Promise.all([
      getSetting('TWITTER_CLIENT_ID'),
      getSetting('TWITTER_CLIENT_SECRET'),
    ]);
    const twClientId = dbTwClientId || process.env.TWITTER_CLIENT_ID || '';
    const twClientSecret = dbTwClientSecret || process.env.TWITTER_CLIENT_SECRET || '';

    switch (platform as Platform) {
      case 'twitter': {
        const creds = Buffer.from(`${twClientId}:${twClientSecret}`).toString('base64');
        const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${creds}` },
          body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: twClientId, redirect_uri: redirectUri, code_verifier: oauthState.code_verifier! }),
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
        const [dbThAppId, dbThAppSecret] = await Promise.all([
          getSetting('THREADS_APP_ID'),
          getSetting('THREADS_APP_SECRET'),
        ]);
        const threadsAppId = dbThAppId || process.env.THREADS_APP_ID || '';
        const threadsAppSecret = dbThAppSecret || process.env.THREADS_APP_SECRET || '';
        const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: threadsAppId, client_secret: threadsAppSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) throw new Error(JSON.stringify(tokenData));
        const shortToken = tokenData.access_token;
        const ltRes = await fetch(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${threadsAppSecret}&access_token=${shortToken}`);
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
        const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${process.env.FACEBOOK_APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`);
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || tokenData.error) throw new Error(JSON.stringify(tokenData));
        accessToken = tokenData.access_token;
        expiresIn = tokenData.expires_in || null;
        const userRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${accessToken}`);
        const userData = await userRes.json();
        platformUserId = userData.id;
        platformUsername = userData.name;
        platformDisplayName = userData.name;
        platformAvatar = userData.picture?.data?.url || null;
        break;
      }
      case 'instagram': {
        // Instagram API (standalone) - 별도 앱 ID/Secret 사용
        const [_igId, _igSec, _fbId, _fbSec] = await Promise.all([
          getSetting('INSTAGRAM_APP_ID'), getSetting('INSTAGRAM_APP_SECRET'),
          getSetting('FACEBOOK_APP_ID'), getSetting('FACEBOOK_APP_SECRET'),
        ]);
        const igAppId = _igId || process.env.INSTAGRAM_APP_ID || _fbId || process.env.FACEBOOK_APP_ID;
        const igAppSecret = _igSec || process.env.INSTAGRAM_APP_SECRET || _fbSec || process.env.FACEBOOK_APP_SECRET;
        const shortTokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: igAppId!,
            client_secret: igAppSecret!,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code,
          }),
        });
        const shortTokenData = await shortTokenRes.json();
        if (!shortTokenRes.ok || shortTokenData.error_type) throw new Error(JSON.stringify(shortTokenData));
        const shortToken = shortTokenData.access_token;

        // 장기 토큰으로 교환 (60일)
        let longToken = shortToken;
        let longExpires: number | null = null;
        try {
          const longTokenRes = await fetch(
            `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${igAppSecret}&access_token=${shortToken}`
          );
          const longTokenData = await longTokenRes.json();
          if (longTokenData.access_token) { longToken = longTokenData.access_token; longExpires = longTokenData.expires_in || null; }
        } catch { /* 단기 토큰으로 폴백 */ }
        accessToken = longToken;
        expiresIn = longExpires;

        // 사용자 정보 조회 (instagram_business_basic 스코프: id, username만 보장)
        const userRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
        const userData = await userRes.json();
        if (userData.error) throw new Error(`Instagram 사용자 정보 실패: ${JSON.stringify(userData.error)}`);
        platformUserId = userData.id || String(shortTokenData.user_id);
        platformUsername = `@${userData.username || ''}`;
        platformDisplayName = userData.username || '';
        platformAvatar = null;
        break;
      }
      case 'linkedin': {
        const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: process.env.LINKEDIN_CLIENT_ID!, client_secret: process.env.LINKEDIN_CLIENT_SECRET! }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) throw new Error(JSON.stringify(tokenData));
        accessToken = tokenData.access_token;
        expiresIn = tokenData.expires_in || null;
        const userRes = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
        const userData = await userRes.json();
        platformUserId = userData.sub;
        platformUsername = userData.email || userData.name;
        platformDisplayName = userData.name;
        platformAvatar = userData.picture || null;
        break;
      }
      default:
        return NextResponse.redirect(`${returnUrl}?error=unsupported_platform`);
    }

    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    type ExtraAccount = {
      platform_user_id: string; access_token: string; refresh_token?: string | null;
      token_expires_at?: string | null; platform_username: string;
      platform_display_name: string; platform_avatar?: string | null;
      is_active: boolean; caption_language?: string;
    };

    // 이 정확한 계정(user_id+platform+platform_user_id)이 이미 있는지 조회
    const { data: exactMatch } = await supabase
      .from('sns_connections')
      .select('extra')
      .eq('user_id', userId)
      .eq('platform', platform)
      .eq('platform_user_id', platformUserId)
      .maybeSingle();

    if (exactMatch !== null) {
      // 같은 계정 재연결 — 해당 행 업데이트
      const { error: updateErr } = await supabase.from('sns_connections').update({
        access_token: accessToken, refresh_token: refreshToken,
        token_expires_at: expiresAt, platform_username: platformUsername,
        platform_display_name: platformDisplayName, platform_avatar: platformAvatar,
        is_active: true, updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('platform', platform).eq('platform_user_id', platformUserId);
      if (updateErr) throw new Error(`DB저장실패: ${updateErr.message}`);
    } else {
      // 이 플랫폼의 메인 연결 행이 있는지 확인
      const { data: mainRow } = await supabase
        .from('sns_connections')
        .select('platform_user_id, extra')
        .eq('user_id', userId)
        .eq('platform', platform)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!mainRow) {
        // 첫 번째 계정 — 새 행 삽입
        const { error: insertErr } = await supabase.from('sns_connections').insert({
          user_id: userId, platform, access_token: accessToken, refresh_token: refreshToken,
          token_expires_at: expiresAt, platform_user_id: platformUserId, platform_username: platformUsername,
          platform_display_name: platformDisplayName, platform_avatar: platformAvatar,
          is_active: true, updated_at: new Date().toISOString(),
        });
        if (insertErr) throw new Error(`DB저장실패: ${insertErr.message}`);
      } else {
        // 다른 계정 추가 — extra.extra_accounts 배열에 저장 (마이그레이션 없이 다계정 지원)
        const prevExtra = (mainRow.extra as Record<string, unknown>) || {};
        const extraAccounts: ExtraAccount[] = Array.isArray(prevExtra.extra_accounts)
          ? (prevExtra.extra_accounts as ExtraAccount[]) : [];
        const idx = extraAccounts.findIndex((a) => a.platform_user_id === platformUserId);
        const newAcc: ExtraAccount = {
          platform_user_id: platformUserId, access_token: accessToken,
          refresh_token: refreshToken, token_expires_at: expiresAt,
          platform_username: platformUsername, platform_display_name: platformDisplayName,
          platform_avatar: platformAvatar, is_active: true,
          caption_language: idx >= 0 ? (extraAccounts[idx].caption_language || 'ko') : 'ko',
        };
        if (idx >= 0) extraAccounts[idx] = newAcc;
        else extraAccounts.push(newAcc);
        const { error: updateErr } = await supabase.from('sns_connections').update({
          extra: { ...prevExtra, extra_accounts: extraAccounts },
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId).eq('platform', platform).eq('platform_user_id', mainRow.platform_user_id);
        if (updateErr) throw new Error(`DB저장실패: ${updateErr.message}`);
      }
    }
    return clearReturnCookie(NextResponse.redirect(`${returnUrl}?connected=${platform}`));
  } catch (err: unknown) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 200);
    console.error(`[SNS Callback] ${platform}:`, message);
    return clearReturnCookie(NextResponse.redirect(`${returnUrl}?error=${encodeURIComponent(message)}`));
  }
}
