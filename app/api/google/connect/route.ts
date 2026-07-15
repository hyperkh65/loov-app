import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth 설정이 없습니다. GOOGLE_CLIENT_ID를 환경변수에 추가해주세요.' }, { status: 500 });
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_BASE_URL || 'https://loov.co.kr'}/api/google/callback`;

  const returnTo = req.nextUrl.searchParams.get('return_to') || '';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/webmasters.readonly',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: user.id,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  const res = NextResponse.redirect(authUrl);
  if (returnTo) {
    res.cookies.set('google_return_to', returnTo, { httpOnly: true, maxAge: 600, path: '/', sameSite: 'lax' });
  }
  return res;
}
