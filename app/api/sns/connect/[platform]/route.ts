import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { PLATFORMS, Platform, generateState, generateCodeVerifier, generateCodeChallenge } from '@/lib/sns/platforms';
import { getSetting } from '@/lib/get-setting';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://loov.co.kr';
  const returnTo = _req.nextUrl.searchParams.get('return_to') || '';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl}/login`);

  if (!PLATFORMS[platform as Platform]) {
    return NextResponse.json({ error: '지원하지 않는 플랫폼' }, { status: 400 });
  }

  // DB 설정 → 환경변수 순으로 읽기
  const [igAppId, igAppSecret, fbAppId, fbAppSecret] = await Promise.all([
    getSetting('INSTAGRAM_APP_ID'),
    getSetting('INSTAGRAM_APP_SECRET'),
    getSetting('FACEBOOK_APP_ID'),
    getSetting('FACEBOOK_APP_SECRET'),
  ]);

  const missingEnvMsg: Record<string, string | null> = {
    twitter:   (!process.env.TWITTER_CLIENT_ID || !process.env.TWITTER_CLIENT_SECRET)
                 ? 'Twitter Client ID/Secret이 없습니다. NAS .env에 TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET을 추가하세요.' : null,
    threads:   (!process.env.THREADS_APP_ID || !process.env.THREADS_APP_SECRET)
                 ? 'Threads App ID/Secret이 없습니다.' : null,
    facebook:  (!(fbAppId || process.env.FACEBOOK_APP_ID) || !(fbAppSecret || process.env.FACEBOOK_APP_SECRET))
                 ? 'Facebook App ID/Secret이 없습니다. 설정 → API 키에서 등록하세요.' : null,
    instagram: !(igAppId || fbAppId || process.env.INSTAGRAM_APP_ID || process.env.FACEBOOK_APP_ID)
                 ? 'Instagram App ID가 없습니다. 설정 → API 키에서 등록하세요.' : null,
    linkedin:  (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET)
                 ? 'LinkedIn Client ID/Secret이 없습니다.' : null,
  };
  const errMsg = missingEnvMsg[platform];
  if (errMsg) {
    return NextResponse.redirect(
      `${siteUrl}/dashboard/sns?error=${encodeURIComponent(errMsg)}`
    );
  }

  const state = generateState();
  let codeVerifier: string | null = null;
  if (platform === 'twitter') codeVerifier = generateCodeVerifier();

  const { error: insertErr } = await supabase.from('sns_oauth_state').insert({
    user_id: user.id, platform, state, code_verifier: codeVerifier,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10분
  });
  if (insertErr) {
    return NextResponse.redirect(
      `${siteUrl}/dashboard/sns?error=${encodeURIComponent('OAuth 상태 저장 실패: ' + insertErr.message)}`
    );
  }

  const redirectUri = `${siteUrl}/api/sns/callback/${platform}`;
  let authUrl: URL;

  switch (platform) {
    case 'twitter': {
      const challenge = await generateCodeChallenge(codeVerifier!);
      authUrl = new URL('https://twitter.com/i/oauth2/authorize');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', process.env.TWITTER_CLIENT_ID!);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', PLATFORMS.twitter.scopes.join(' '));
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      break;
    }
    case 'threads': {
      authUrl = new URL('https://threads.net/oauth/authorize');
      authUrl.searchParams.set('client_id', process.env.THREADS_APP_ID!);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', PLATFORMS.threads.scopes.join(','));
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);
      break;
    }
    case 'facebook': {
      authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
      authUrl.searchParams.set('client_id', process.env.FACEBOOK_APP_ID!);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', PLATFORMS.facebook.scopes.join(','));
      authUrl.searchParams.set('state', state);
      break;
    }
    case 'instagram': {
      const resolvedIgAppId = igAppId || process.env.INSTAGRAM_APP_ID || fbAppId || process.env.FACEBOOK_APP_ID;
      authUrl = new URL('https://api.instagram.com/oauth/authorize');
      authUrl.searchParams.set('client_id', resolvedIgAppId!);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', PLATFORMS.instagram.scopes.join(','));
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);
      break;
    }
    case 'linkedin': {
      authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', process.env.LINKEDIN_CLIENT_ID!);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', PLATFORMS.linkedin.scopes.join(' '));
      authUrl.searchParams.set('state', state);
      break;
    }
    default:
      return NextResponse.json({ error: '지원하지 않는 플랫폼' }, { status: 400 });
  }

  const res = NextResponse.redirect(authUrl.toString());
  if (returnTo) {
    res.cookies.set('sns_return_to', returnTo, { httpOnly: true, maxAge: 600, path: '/', sameSite: 'lax' });
  }
  return res;
}
