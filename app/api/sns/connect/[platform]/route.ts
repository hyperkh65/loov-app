import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase-server';
import { PLATFORMS, Platform, generateState, generateCodeVerifier, generateCodeChallenge } from '@/lib/sns/platforms';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://loov.co.kr';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl}/login`);

  const config = PLATFORMS[platform as Platform];
  if (!config) return NextResponse.json({ error: '지원하지 않는 플랫폼' }, { status: 400 });

  // 환경변수 미설정 시 안내
  const missingEnv: Record<string, boolean> = {
    twitter:  !process.env.TWITTER_CLIENT_ID  || !process.env.TWITTER_CLIENT_SECRET,
    threads:  !process.env.THREADS_APP_ID     || !process.env.THREADS_APP_SECRET,
    facebook: !process.env.FACEBOOK_APP_ID    || !process.env.FACEBOOK_APP_SECRET,
  };
  if (missingEnv[platform]) {
    return NextResponse.redirect(
      `${siteUrl}/dashboard/sns?error=${encodeURIComponent('SNS 앱 키가 설정되지 않았습니다. Vercel 환경변수를 등록해 주세요.')}`
    );
  }

  const state = generateState();
  let codeVerifier: string | null = null;
  if (platform === 'twitter') codeVerifier = generateCodeVerifier();

  const admin = createAdminClient();
  await admin.from('sns_oauth_state').insert({ user_id: user.id, platform, state, code_verifier: codeVerifier });

  const redirectUri = `${siteUrl}/api/sns/callback/${platform}`;
  let authUrl: URL;

  switch (platform) {
    case 'twitter': {
      const challenge = await generateCodeChallenge(codeVerifier!);
      authUrl = new URL(config.authUrl);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', process.env.TWITTER_CLIENT_ID!);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', config.scopes.join(' '));
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      break;
    }
    case 'threads': {
      authUrl = new URL(config.authUrl);
      authUrl.searchParams.set('client_id', process.env.THREADS_APP_ID!);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', config.scopes.join(','));
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', state);
      break;
    }
    case 'facebook': {
      authUrl = new URL(config.authUrl);
      authUrl.searchParams.set('client_id', process.env.FACEBOOK_APP_ID!);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', config.scopes.join(','));
      authUrl.searchParams.set('state', state);
      break;
    }
    default:
      return NextResponse.json({ error: '지원하지 않는 플랫폼' }, { status: 400 });
  }

  return NextResponse.redirect(authUrl.toString());
}
